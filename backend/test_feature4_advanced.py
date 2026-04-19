import json
import os
import sys

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from incident_action_plan import ActionPlanEngine

def test_feature4_advanced():
    engine = ActionPlanEngine()
    incident_id = "inc-adv-001"
    
    # Mock inputs
    rca_result = {
        "root_cause_analysis": {
            "top_hypotheses": [
                {
                    "hypothesis": "Database Connection Pool Exhaustion",
                    "total_confidence": 0.95,
                    "recovery_workflow": { "trigger_id": "RESTART_DB_POOL" }
                }
            ]
        }
    }
    triage_result = {
        "Triage Results": { "Affected Service": "order-service", "Severity Level": "P1" }
    }

    print("\n--- [TEST 1: Idempotency & Locking] ---")
    locked, msg = engine.acquire_lock(incident_id)
    print(f"First click: {msg}")
    
    locked2, msg2 = engine.acquire_lock(incident_id)
    print(f"Second click (during action): {msg2}") # Should be blocked

    print("\n--- [TEST 2: Risk Matrix - Grade A (Auto)] ---")
    plan = engine.generate_plan(rca_result, triage_result)
    safety = engine.evaluate_safety(plan, 0.95) # High confidence + Low Risk (30)
    print(f"Decision: {safety['decision']} (Approval Level: {safety['approval_level']})")

    print("\n--- [TEST 3: Risk Matrix - Grade C (High Risk Rollback)] ---")
    rca_rollback = {
        "root_cause_analysis": {
            "top_hypotheses": [
                {
                    "hypothesis": "Broken Deployment",
                    "total_confidence": 0.50, # Low confidence
                    "recovery_workflow": { "trigger_id": "ROLLBACK_DEPLOY" } # High Risk (85)
                }
            ]
        }
    }
    plan_rb = engine.generate_plan(rca_rollback, triage_result)
    safety_rb = engine.evaluate_safety(plan_rb, 0.50)
    print(f"Decision: {safety_rb['decision']} (Approval Level: {safety_rb['approval_level']})")

    print("\n--- [TEST 4: Fallback - Automatic Rollback on DEGRADED] ---")
    res_fallback = engine.verify_remediation(incident_id, plan, health_status="DEGRADED")
    print(f"Verification Result: {res_fallback['verification_status']}")
    print(f"Action: {res_fallback['message']}")
    print(f"Escalation: {res_fallback['escalation']}")

    print("\n--- [TEST 5: Audit Log Check] ---")
    if os.path.exists(engine.AUDIT_LOG_FILE):
        with open(engine.AUDIT_LOG_FILE, 'r') as f:
            logs = json.load(f)
            latest = logs[-1]
            print(f"Latest Log -> Action: {latest['action']}, Outcome: {latest['outcome']}, Escalation: {latest['escalation']}")

if __name__ == "__main__":
    test_feature4_advanced()
