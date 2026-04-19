import json
import os
import sys

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from incident_executive_summary import ExecutiveSummaryEngine

def test_feature5_only():
    engine = ExecutiveSummaryEngine()
    
    # 1. Mock Triage Result
    triage_result = {
        "Triage Results": {
            "Affected Service": "HDFS-DataNode",
            "Severity Level": "P2 (High)",
            "User Impact": "Degraded Performance/Errors",
            "Primary Category": "Network_Error",
            "Persistence": {
                "duration": 450,
                "count": 12,
                "state": "Persistent",
                "first_seen": "2026-04-18T22:10:00Z"
            }
        },
        "Context Metadata": {
            "Template ID": "HDFS-ERROR-102",
            "Standard ISO Time": "2026-04-18T22:12:00Z"
        },
        "log_raw": "PacketResponder 1 for block blk_123 terminates with error: Connection refused"
    }

    # 2. Mock RCA Result
    rca_result = {
        "root_cause_analysis": {
            "top_hypotheses": [
                {
                    "hypothesis": "Infrastructure Gray Failure (Network Partition)",
                    "total_confidence": 0.88,
                    "recovery_workflow": {
                        "trigger_id": "RESTART_NET_ADAPTER",
                        "approval_required": True
                    }
                },
                {
                    "hypothesis": "Software Glitch in DataNode Responder",
                    "total_confidence": 0.45,
                    "recovery_workflow": {
                        "trigger_id": "RESTART_DS_NODE"
                    }
                }
            ],
            "hitl_status": "Awaiting Approval",
            "analyzed_at": "2026-04-18T22:12:50Z"
        }
    }

    # 3. Mock External Context
    external_context = {
        "metrics_data": {
            "network.egress.error_rate": {
                "current": 4.5,
                "baseline": 0.1,
                "policy": "Network Error Threshold",
                "timestamp": "2026-04-18T22:11:00Z"
            },
            "cpu.usage": {
                "current": 12.0,
                "baseline": 15.0,
                "policy": "Resource baseline"
            }
        },
        "recent_deploy": False
    }

    print("=" * 60)
    print("🚀 [Feature 5] GENERATING SRE TECHNICAL BRIEFING...")
    print("=" * 60)
    sre_report = engine.generate(triage_result, rca_result, external_context, persona="SRE")
    print(sre_report)

    print("\n" + "=" * 60)
    print("👔 [Feature 5] GENERATING EXECUTIVE SUMMARY...")
    print("=" * 60)
    exec_report = engine.generate(triage_result, rca_result, external_context, persona="Executive")
    print(exec_report)

if __name__ == "__main__":
    test_feature5_only()
