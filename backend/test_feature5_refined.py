import json
import os
import sys

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from incident_executive_summary import ExecutiveSummaryEngine

def test_feature5_final_refined():
    engine = ExecutiveSummaryEngine()
    
    # 1. Mock Triage Result
    triage_result = {
        "Triage Results": {
            "Affected Service": "payment-api",
            "Severity Level": "P1 (Critical)",
            "User Impact": "Critical Outage",
            "Primary Category": "Database_Error"
        },
        "Context Metadata": {
            "Template ID": "DB-LOCK-99",
            "Standard ISO Time": "2026-04-18T22:30:00Z"
        }
    }

    # 2. Mock RCA Result (Automated Case)
    rca_result = {
        "root_cause_analysis": {
            "top_hypotheses": [
                {
                    "hypothesis": "Database Connection Pool Exhaustion",
                    "total_confidence": 0.96,
                    "recovery_workflow": {
                        "trigger_id": "RESTART_DB_POOL",
                        "approval_required": False
                    }
                }
            ],
            # Status is AUTO-EXECUTED
            "hitl_status": "AUTO-EXECUTED",
            "analyzed_at": "2026-04-18T22:31:00Z" # Base Time for next update
        }
    }

    print("=" * 70)
    print("🏆 [FINAL REFINED TEST] FEATURE 5 - EXECUTIVE SUMMARY")
    print("=" * 70)
    
    report = engine.generate(triage_result, rca_result, persona="Executive")
    print(report)

    # 3. Verification check
    if "🔵 AUTO-EXECUTED" in report:
        print("✅ EMOJI: Optimized (Blue for automation success)")
    
    if "23:01:00 UTC" in report:
        print("✅ TIMESTAMP: Correct (Analyzed at 22:31 + 30m)")

    if "$2,500" in report:
        print("✅ REVENUE IMPACT: Correct (payment-api: $500/m * 5m = $2,500)")

if __name__ == "__main__":
    test_feature5_final_refined()
