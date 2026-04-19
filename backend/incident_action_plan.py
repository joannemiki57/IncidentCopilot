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
       Enhanced with Safety Net (Undo), Idempotency (Locking), Fallback(Plan B),
       and Granular Risk Matrix.
    """
    
    AUDIT_LOG_FILE = "incident_audit_log.json"
    MAX_RETRIES = 1
    
    RUNBOOK_LIBRARY = {
        "RESTART_DB_POOL": RunbookAction(
            "RESTART_DB_POOL", "Restart Database Connection Pool",
            "service/{service}", "kubectl restart deployment/{service} -n production",
            undo_template="kubectl rollout undo deployment/{service} -n production",
            blast_radius="Medium", reversibility="High", risk_score=30
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
        self._sessions = {} # Incident Session: {incident_id: {retries, state}}

    def acquire_lock(self, incident_id):
        """Prevents duplicate execution for the same incident."""
        if incident_id in self._locks and self._locks[incident_id] in ["INITIATED", "EXECUTING", "RETRYING"]:
            return False, f"Action already in progress (Status: {self._locks[incident_id]})"
        self._locks[incident_id] = "INITIATED"
        if incident_id not in self._sessions:
            self._sessions[incident_id] = {"retries": 0, "state": "STARTING"}
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
        """Step 3: Granular Risk Matrix & Approval logic."""
        if action_plan.get("status") == "NO_HYPOTHESIS_FOUND":
            return {"decision": "BLOCKED (No Hypothesis)", "approval_required": True, "risk_level": "Unknown"}

        risk = action_plan.get("risk_score", 100)
        conf = int(hypothesis_confidence * 100)

        # Risk Matrix Implementation
        if risk <= 30 and conf >= 90:
            # Grade A: High Confidence + Low Risk
            decision = "AUTO-EXECUTABLE"
            approval_level = "None (System)"
            approval_required = False
        elif risk <= 60 and conf >= 75:
            # Grade B: Medium Risk + Decent Confidence
            decision = "APPROVAL REQUIRED (SRE Lead)"
            approval_level = "SRE Partner / Lead"
            approval_required = True
        elif risk > 60 or conf < 60:
            # Grade C: High Risk or Low Confidence
            decision = f"APPROVAL REQUIRED (Expert Panel)"
            approval_level = "L2/L3 Senior Engineer"
            approval_required = True
        else:
            decision = "BLOCKED (Unsafe Params)"
            approval_level = "N/A"
            approval_required = True

        return {
            "decision": decision,
            "approval_level": approval_level,
            "approval_required": approval_required,
            "risk_level": "High" if risk > 70 else "Medium" if risk > 30 else "Low",
            "slack_payload": self._generate_notification(action_plan, decision)
        }

    def verify_remediation(self, incident_id, action_plan, health_status="RECOVERED"):
        """Step 4: Post-Action Verification + Fallback(Plan B) Logic."""
        session = self._sessions.get(incident_id, {"retries": 0, "state": "UNKNOWN"})
        print(f"⌛ [Step 4] Monitoring health for {action_plan.get('target', 'N/A')}... (Retry: {session['retries']}/{self.MAX_RETRIES})")
        
        if health_status == "RECOVERED":
            res = {
                "verification_status": "SUCCESS",
                "message": f"Service metrics recovered for {action_plan['target']}.",
                "next_steps": "Close Incident"
            }
            self.release_lock(incident_id, "SUCCESS")
        elif health_status == "DEGRADED": 
            # Fallback: Automatic Rollback
            print(f"⚠️  [CRITICAL] Metrics worsening! Initiating Fallback (Rollback)...")
            res = {
                "verification_status": "ROLLBACK_TRIGGERED",
                "message": f"Action caused degradation. Reverting with: `{action_plan['undo_command']}`",
                "escalation": "Trigger PagerDuty: L2 On-Call Assigned"
            }
            self.release_lock(incident_id, "ROLLBACK_SUCCESS")
        else: 
            # Fallback: Attempt Retry or Escalate
            if session["retries"] < self.MAX_RETRIES:
                session["retries"] += 1
                print(f"🔄  [RETRY] No recovery detected. Attempting retry {session['retries']}...")
                res = {
                    "verification_status": "RETRYING",
                    "message": "Waiting for stabilization before retry...",
                    "next_steps": "Execute action again"
                }
                self.release_lock(incident_id, "RETRYING")
            else:
                print(f"🛑 [ESCALATE] Retry limit exceeded. Escalating to L3...")
                res = {
                    "verification_status": "ESCALATED",
                    "message": "Remediation failed. Manual intervention required.",
                    "escalation": "Level 3 Expert notified"
                }
                self.release_lock(incident_id, "ESCALATED")
            
        self.log_audit(incident_id, action_plan, res)
        return res

    def log_audit(self, incident_id, plan, result):
        """Audit Log: Generates JSON record for Postmortem analysis."""
        audit_entry = {
            "timestamp": datetime.now().isoformat(),
            "incident_id": incident_id,
            "action": plan.get("title", "Unknown"),
            "command": plan.get("command", "N/A"),
            "target": plan.get("target", "N/A"),
            "risk_score": plan.get("risk_score", 0),
            "outcome": result.get("verification_status", "UNKNOWN"),
            "detail": result.get("message", ""),
            "escalation": result.get("escalation", "None")
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
