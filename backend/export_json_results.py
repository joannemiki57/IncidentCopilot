import json
import os
from incident_triage_poc import incident_triage, PersistenceTracker
from incident_rca_engine import AdvancedRCAEngine
from incident_action_plan import ActionPlanEngine
from incident_executive_summary import ExecutiveSummaryEngine

def export_all_stages_json():
    # Setup
    tracker = PersistenceTracker()
    rca_engine = AdvancedRCAEngine()
    action_engine = ActionPlanEngine()
    summary_engine = ExecutiveSummaryEngine()
    
    # Create results directory inside backend
    base_dir = os.path.dirname(os.path.abspath(__file__))
    results_dir = os.path.join(base_dir, "results")
    if not os.path.exists(results_dir):
        os.makedirs(results_dir)

    # Scenarios for export: Using the working JDBC scenario
    raw_log = "2026-04-18 16:30:00 [ERROR] Connection refused: Unable to acquire JDBC connection from pool"
    
    # 1. Triage
    for _ in range(6): incident_triage(raw_log, tracker=tracker)
    triage_result = incident_triage(raw_log, tracker=tracker)
    triage_result["log_raw"] = raw_log
    
    with open(os.path.join(results_dir, "1_triage_result.json"), "w") as f:
        json.dump(triage_result, f, indent=4)
    print("Exported: 1_triage_result.json")

    # 2. RCA Analysis
    context = {
        "recent_deploy": True,
        "deploy_timestamp": "2026-04-18T16:25:00Z",
        "deploy_time_delta_mins": 5,
        "deploy_metadata": {"is_config_change": True, "change_type": "timeout and pool-size"},
        "metric_anomalies": ["db.active_connections", "upstream.payment.latency"],
        "metrics_data": {
            "db.active_connections": {"current": 450, "baseline": 150, "limit": 400, "policy": "Saturation check"}
        }
    }
    rca_result = rca_engine.analyze(triage_result, external_context=context)
    with open(os.path.join(results_dir, "2_rca_analysis.json"), "w") as f:
        json.dump(rca_result, f, indent=4)
    print("Exported: 2_rca_analysis.json")

    # 3. Evidence Mapping (Extracting from RCA breakdown)
    top_h = rca_result.get("root_cause_analysis", {}).get("top_hypotheses", [{}])[0]
    evidence_ids = top_h.get("breakdown", {}).get("evidence_ids", [])
    
    # Mocking internal data mapping for UI visibility
    evidence_details = {
        "hypothesis_id": top_h.get("id"),
        "hypothesis_title": top_h.get("hypothesis"),
        "evidence_mapping": [
            {"id": "LOG-a62d24823f41", "type": "Log", "content": raw_log, "status": "SUPPORT"},
            {"id": "METRIC-db.active_connections", "type": "Metric", "content": "Current: 450, Baseline: 150", "status": "SUPPORT"},
            {"id": "EVENT-RECENT-DEPLOY", "type": "Event", "content": "Deployment 5 mins ago (Config Change)", "status": "SUPPORT"}
        ] if "H_RES_1" in top_h.get("id", "") else []
    }
    with open(os.path.join(results_dir, "3_evidence_mapping.json"), "w") as f:
        json.dump(evidence_details, f, indent=4)
    print("Exported: 3_evidence_mapping.json")

    # 4. Action Plan & Safety Evaluation
    action_plan = action_engine.generate_plan(rca_result, triage_result)
    with open(os.path.join(results_dir, "4_action_plan.json"), "w") as f:
        json.dump(action_plan, f, indent=4)
    print("Exported: 4_action_plan.json")

    conf = top_h.get("total_confidence", 0.8)
    safety_eval = action_engine.evaluate_safety(action_plan, conf)
    with open(os.path.join(results_dir, "5_safety_evaluation.json"), "w") as f:
        json.dump(safety_eval, f, indent=4)
    print("Exported: 5_safety_evaluation.json")

    # 5. Executive Summary
    summary_text = summary_engine.generate(triage_result, rca_result, external_context=context)
    summary_data = {"summary": summary_text, "generated_at": "2026-04-18T23:25:00Z", "persona": "SRE"}
    with open(os.path.join(results_dir, "6_executive_summary.json"), "w") as f:
        json.dump(summary_data, f, indent=4)
    print("Exported: 6_executive_summary.json")

if __name__ == "__main__":
    export_all_stages_json()
