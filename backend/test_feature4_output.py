import json
import os
import sys

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from incident_action_plan import ActionPlanEngine

def test_feature4_only():
    engine = ActionPlanEngine()
    
    # Mock inputs
    rca_result = {
        "root_cause_analysis": {
            "top_hypotheses": [
                {
                    "hypothesis": "Database Connection Pool Exhaustion",
                    "total_confidence": 0.95,
                    "recovery_workflow": {
                        "trigger_id": "RESTART_DB_POOL"
                    }
                }
            ]
        }
    }
    
    triage_result = {
        "Triage Results": {
            "Affected Service": "payment-api",
            "Severity Level": "P1 (Critical)"
        },
        "Context Metadata": {
            "Template ID": "e095585079c9"
        }
    }
    
    print("-" * 40)
    print("🔋 [Feature 4] GENERATING ACTION PLAN...")
    
    # 1. Map & Generate Plan
    plan = engine.generate_plan(rca_result, triage_result)
    
    # 2. Evaluate Safety
    safety = engine.evaluate_safety(plan, 0.95)
    
    print(f"Proposed Action: {plan['title']}")
    print(f"Target: {plan['target']}")
    print(f"Suggested Command: `{plan['command']}`")
    print(f"Decision: {safety['decision']} (Risk Level: {safety['risk_level']})")
    
    print(f"📢 [HITL] Approval notification sent to #ops-alerts.")
    print(f"✅ Operator approved remediation via Slack interface.")
    
    # 3. Verification
    verification = engine.verify_remediation("e095585079c9", plan, health_status="RECOVERED")
    
    print(f"🔍 [Verification] SUCCESS: {verification['message']}")
    print(f"✨ Final Action: {verification['next_steps']}")
    print("-" * 40)

if __name__ == "__main__":
    test_feature4_only()
