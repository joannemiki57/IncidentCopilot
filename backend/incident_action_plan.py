import json
import os
import time
from datetime import datetime

class RunbookAction:
    def __init__(self, action_id, title, target_template, command_template, 
                 undo_template=None, blast_radius="Medium", reversibility="High", risk_score=50):
        self.action_id = action_id
        self.title = title
        self.target_template = target_template
        self.command_template = command_template
        self.undo_template = undo_template # New: Safety Net
        self.blast_radius = blast_radius 
        self.reversibility = reversibility 
        self.risk_score = risk_score

class ActionPlanEngine:
    """Feature 4: Action Plan / Runbook (Automated 4-step Pipeline).
       Enhanced with Safety Net (Undo), Idempotency (Locking), and Audit Log.
    """
    
    AUDIT_LOG_FILE = "incident_audit_log.json"
    
    RUNBOOK_LIBRARY = {
        "RESTART_DB_POOL": RunbookAction(
            "RESTART_DB_POOL", "Restart Database Connection Pool",
            "service/{service}", "kubectl restart deployment/{service} -n production",
            undo_template="kubectl scale deployment/{service} --replicas=0 && kubectl scale deployment/{service} --replicas=10",
            blast_radius="Medium", reversibility="High", risk_score=40
        ),
        "SWITCH_STANDBY_API": RunbookAction(
            "SWITCH_STANDBY_API", "Failover to Standby Upstream API",
            "gateway/{service}-egress", "vault kv get secret/api/standby | terraform apply -var 'active_api=standby'",
            undo_template="terraform apply -var 'active_api=primary'",
            blast_radius="Large", reversibility="Partial", risk_score=75
        ),
        "ROLLBACK_DEPLOY": RunbookAction(
            "ROLLBACK_DEPLOY", "Rollback Latest Deployment",
            "deployment/{service}", "kubectl rollout undo deployment/{service} --to-revision={prev_rev}",
            undo_template="kubectl rollout undo deployment/{service} --to-revision={broken_rev}",
            blast_radius="High", reversibility="Partial", risk_score=85
        )
    }

    def __init__(self):
        self._locks = {} # Idempotency: Stores incident_id -> status

    def acquire_lock(self, incident_id):
        """Prevents duplicate execution for the same incident."""
        if incident_id in self._locks:
            return False, f"Action already in progress (Status: {self._locks[incident_id]})"
        self._locks[incident_id] = "INITIATED"
        return True, "Lock acquired"

    def release_lock(self, incident_id, status="COMPLETED"):
        self._locks[incident_id] = status

    def generate_plan(self, rca_result, triage_result):
        """Step 1 & 2: Mapping & Command Generation."""
        top_hypos = rca_result.get("root_cause_analysis", {}).get("top_hypotheses", [])
        if not top_hypos:
            return {"status": "NO_HYPOTHESIS_FOUND", "message": "No root cause candidates identified to map actions."}
        top_h = top_hypos[0]
        trigger_id = top_h.get("recovery_workflow", {}).get("trigger_id", "UNKNOWN")
        
        # 1. Action Mapping
        action_template = self.RUNBOOK_LIBRARY.get(trigger_id)
        if not action_template:
            return {"status": "NO_ACTION_MAPPED", "message": f"No runbook found for {trigger_id}"}

        # 2. Command Generation (Identifier Binding)
        service = triage_result.get("Triage Results", {}).get("Affected Service", "unknown-service")
        prev_rev = "PREV_STABLE_01" 
        broken_rev = "BROKEN_V123"

        target = action_template.target_template.format(service=service)
        command = action_template.command_template.format(service=service, prev_rev=prev_rev)
        
        # Safety Net Logic
        undo_command = None
        if action_template.undo_template:
            undo_command = action_template.undo_template.format(service=service, broken_rev=broken_rev)

        return {
            "action_id": action_template.action_id,
            "title": action_template.title,
            "target": target,
            "command": command,
            "undo_command": undo_command,
            "blast_radius": action_template.blast_radius,
            "reversibility": action_template.reversibility,
            "risk_score": action_template.risk_score,
            "parameters": {"service": service, "prev_rev": prev_rev}
        }

    def evaluate_safety(self, action_plan, hypothesis_confidence):
        """Step 3: Safety Guard & Approval logic."""
        if action_plan.get("status") == "NO_HYPOTHESIS_FOUND":
            return {"decision": "BLOCKED (No Hypothesis)", "approval_required": True, "risk_level": "Unknown"}

        risk = action_plan.get("risk_score", 100)
        conf = int(hypothesis_confidence * 100)

        if risk <= 30 and conf >= 85:
            decision = "AUTO-EXECUTABLE"
            approval_required = False
        elif risk >= 80 and conf <= 50:
            decision = "BLOCKED (High Risk / Low Confidence)"
            approval_required = True
        else:
            decision = "APPROVAL REQUIRED (Manual Review)"
            approval_required = True

        return {
            "decision": decision,
            "approval_required": approval_required,
            "risk_level": "High" if risk > 70 else "Medium" if risk > 30 else "Low",
            "slack_payload": self._generate_notification(action_plan, decision)
        }

    def verify_remediation(self, incident_id, action_plan, health_status="RECOVERED"):
        """Step 4: Post-Action Verification + Safety Net (Undo)."""
        print(f"⌛ [Step 4] Monitoring system health for 5 minutes post-action...")
        
        if health_status == "RECOVERED":
            res = {
                "verification_status": "SUCCESS",
                "message": f"Service metrics recovered for {action_plan['target']}.",
                "next_steps": "Close Incident"
            }
        elif health_status == "DEGRADED": # Trigger Safety Net
            print(f"⚠️  [CRITICAL] Metrics worsening! Triggering Safety Net Rollback...")
            res = {
                "verification_status": "UNDO_TRIGGERED",
                "message": f"Action caused degradation. Reverting with: `{action_plan['undo_command']}`",
                "escalation": "Trigger PagerDuty: Manual Investigation Required"
            }
        else:
            res = {
                "verification_status": "FAILURE",
                "message": "No recovery detected. Escalating...",
                "escalation": "Level 2 On-Call"
            }
            
        self.release_lock(incident_id, res["verification_status"])
        self.log_audit(incident_id, action_plan, res)
        return res

    def log_audit(self, incident_id, plan, result):
        """Audit Log: Generates JSON record for Postmortem analysis."""
        audit_entry = {
            "timestamp": datetime.now().isoformat(),
            "incident_id": incident_id,
            "action": plan["title"],
            "command": plan["command"],
            "target": plan["target"],
            "risk_score": plan["risk_score"],
            "outcome": result["verification_status"],
            "detail": result["message"]
        }
        
        # In a real app, this would append to a database or JSON file
        try:
            logs = []
            if os.path.exists(self.AUDIT_LOG_FILE):
                with open(self.AUDIT_LOG_FILE, 'r') as f:
                    logs = json.load(f)
            logs.append(audit_entry)
            with open(self.AUDIT_LOG_FILE, 'w') as f:
                json.dump(logs, f, indent=4)
        except Exception as e:
            print(f"Logging error: {e}")

    def _generate_notification(self, plan, decision):
        # Slack/Teams payload generation logic (simplified)
        return {"decision": decision, "action": plan.get("title", "No Action Proposed")}

if __name__ == "__main__":
    pass
