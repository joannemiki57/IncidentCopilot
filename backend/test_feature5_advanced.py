import json
import os
import sys
from datetime import datetime, timedelta

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from incident_executive_summary import ExecutiveSummaryEngine

def test_feature5_advanced():
    engine = ExecutiveSummaryEngine()
    
    # --- SCENARIO 1: Database Saturation ---
    triage_db = {
        "Triage Results": {
            "Affected Service": "payment-api",
            "Severity Level": "P1 (Critical)",
            "User Impact": "Critical Outage",
            "Primary Category": "Database_Error"
        },
        "Context Metadata": { "Template ID": "DB-LOCK-99", "Standard ISO Time": "2026-04-18T22:30:00Z" }
    }
    rca_db = {
        "root_cause_analysis": {
            "top_hypotheses": [
                {
                    "hypothesis": "Database Connection Pool Exhaustion",
                    "total_confidence": 0.96,
                    "recovery_workflow": { "trigger_id": "RESTART_DB_POOL", "approval_required": False }
                }
            ],
            "hitl_status": "AUTO-EXECUTED",
            "analyzed_at": "2026-04-18T22:31:00Z"
        }
    }
    
    print("\n" + "="*70)
    print("📈 [SCENARIO 1] DATABASE SATURATION - EXECUTIVE REPORT")
    print("="*70)
    exec_db = engine.generate(triage_db, rca_db, persona="Executive")
    print(exec_db)
    
    print("\n" + "="*70)
    print("🛠️ [SCENARIO 1] DATABASE SATURATION - SRE REPORT (WITH ACTION ITEMS)")
    print("="*70)
    sre_db = engine.generate(triage_db, rca_db, persona="SRE")
    print(sre_db)

    # --- SCENARIO 2: Network Partition ---
    triage_net = {
        "Triage Results": { "Affected Service": "gateway", "Severity Level": "P2", "Primary Category": "Network_Error" },
        "Context Metadata": { "Template ID": "NET-PART-01" }
    }
    rca_net = {
        "root_cause_analysis": {
            "top_hypotheses": [
                {
                    "hypothesis": "Infrastructure Network Partition",
                    "total_confidence": 0.85,
                    "recovery_workflow": { "trigger_id": "SWITCH_STANDBY_API" }
                }
            ],
            "analyzed_at": "2026-04-18T22:45:00Z"
        }
    }
    
    print("\n" + "="*70)
    print("🌐 [SCENARIO 2] NETWORK PARTITION - SRE REPORT (WITH NETWORK ACTION ITEMS)")
    print("="*70)
    sre_net = engine.generate(triage_net, rca_net, persona="SRE")
    print(sre_net)

if __name__ == "__main__":
    test_feature5_advanced()
