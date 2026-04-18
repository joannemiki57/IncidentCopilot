import json
import os
import sys

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from incident_triage_poc import incident_triage, PersistenceTracker
from incident_rca_engine import AdvancedRCAEngine
from incident_action_plan import ActionPlanEngine
from incident_executive_summary import ExecutiveSummaryEngine

def generate_scenario(name, log_msg, context):
    tracker = PersistenceTracker()
    rca_engine = AdvancedRCAEngine()
    action_engine = ActionPlanEngine()
    summary_engine = ExecutiveSummaryEngine()

    # 1. Triage
    for _ in range(5): incident_triage(log_msg, tracker=tracker)
    triage_result = incident_triage(log_msg, tracker=tracker)
    triage_result["log_raw"] = log_msg

    # 2. RCA
    rca_result = rca_engine.analyze(triage_result, external_context=context)

    # 3. Action Plan
    action_plan = action_engine.generate_plan(rca_result, triage_result)
    conf = rca_result.get("root_cause_analysis", {}).get("top_hypotheses", [{}])[0].get("total_confidence", 0.8)
    safety_eval = action_engine.evaluate_safety(action_plan, conf)
    
    # 4. Summary
    summary = summary_engine.generate(triage_result, rca_result, external_context=context, persona="SRE")

    # Combine
    combined = {
        "scenario_name": name,
        "triage": triage_result,
        "rca": rca_result,
        "action_plan": action_plan,
        "safety_evaluation": safety_eval,
        "summary": summary
    }
    
    # Save to data directory
    output_path = f"data/{name}.json"
    with open(output_path, "w") as f:
        json.dump(combined, f, indent=4)
    print(f"Generated: {output_path}")

def main():
    if not os.path.exists("data"):
        os.makedirs("data")

    # Scenario 1: db-saturation
    generate_scenario(
        "db-saturation",
        "2026-04-18 16:30:00 [ERROR] Connection refused: Unable to acquire JDBC connection from pool",
        {
            "recent_deploy": True,
            "deploy_time_delta_mins": 5,
            "metric_anomalies": ["db.active_connections", "upstream.payment.latency"],
            "metrics_data": {
                "db.active_connections": {"current": 450, "baseline": 150, "limit": 400, "policy": "Saturation check"}
            }
        }
    )

    # Scenario 2: hdfs-failure
    generate_scenario(
        "hdfs-failure",
        "081109 203615 148 ERROR dfs.DataNode$PacketResponder: PacketResponder 1 for block blk_-1608999687919862906 terminates with error: Connection refused",
        {
            "recent_deploy": False,
            "metric_anomalies": ["upstream.dfs.latency", "network.egress.error_rate"],
            "metrics_data": {
                "upstream.dfs.latency": {"current": 4500, "baseline": 200, "policy": "Node health check"}
            }
        }
    )

    # Scenario 3: bgl-hardware
    generate_scenario(
        "bgl-hardware",
        "2005-06-14-10.15.23.940275 R20-M0-ND-C:J15-U11 RAS KERNEL FATAL machine check exception",
        {
            "recent_deploy": False,
            "node_variance_detected": True,
            "metric_anomalies": ["compute.node.memory_errors", "node.cpu.iowait"],
            "metrics_data": {
                "compute.node.memory_errors": {"current": 45, "baseline": 2, "policy": "Hardware Error Threshold"}
            }
        }
    )

if __name__ == "__main__":
    main()
