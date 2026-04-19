import json
import os
import sys

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOGS_DIR = os.path.join(os.path.dirname(BASE_DIR), "data", "logs")
sys.path.append(BASE_DIR)

# Import Engines
from incident_triage_poc import incident_triage
from incident_rca_engine import AdvancedRCAEngine
from incident_action_plan import ActionPlanEngine
from incident_executive_summary import ExecutiveSummaryEngine, EvidenceNormalizer

def run_and_save_pipeline():
    # 1. Prepare Mock/Input Data
    log_line = "081109 203615 148 ERROR dfs.DataNode$PacketResponder: PacketResponder 1 for block blk_123 terminates with error: Connection refused"
    external_context = {
        "metrics_data": {
            "network.egress.error_rate": { "current": 4.5, "baseline": 0.1, "policy": "Network Threshold" },
            "cpu.usage": { "current": 10.0, "baseline": 15.0, "policy": "Normal range" }
        },
        "recent_deploy": False
    }

    # --- Feature 1: Triage ---
    print("Executing Feature 1...")
    triage_result = incident_triage(log_line)
    with open(os.path.join(LOGS_DIR, "feature1_triage.json"), "w") as f:
        json.dump(triage_result, f, indent=4)

    # --- Feature 2: RCA ---
    print("Executing Feature 2...")
    rca_engine = AdvancedRCAEngine()
    rca_result = rca_engine.analyze(triage_result, external_context)
    with open(os.path.join(LOGS_DIR, "feature2_rca.json"), "w") as f:
        json.dump(rca_result, f, indent=4)

    # --- Feature 3: Evidence Mapping ---
    print("Executing Feature 3...")
    normalizer = EvidenceNormalizer()
    top_hypos = rca_result.get("root_cause_analysis", {}).get("top_hypotheses", [])
    evidence_graph = normalizer.normalize(triage_result, external_context, top_hypos)
    # Convert objects to serializable dicts
    evidence_serializable = []
    for item in evidence_graph:
        evidence_serializable.append(item.__dict__)
    
    with open(os.path.join(LOGS_DIR, "feature3_evidence.json"), "w") as f:
        json.dump(evidence_serializable, f, indent=4)

    # --- Feature 4: Action Plan ---
    print("Executing Feature 4...")
    action_engine = ActionPlanEngine()
    plan = action_engine.generate_plan(rca_result, triage_result)
    safety = action_engine.evaluate_safety(plan, top_hypos[0]['total_confidence'] if top_hypos else 0.5)
    action_output = {
        "plan": plan,
        "safety_evaluation": safety
    }
    with open(os.path.join(LOGS_DIR, "feature4_action_plan.json"), "w") as f:
        json.dump(action_output, f, indent=4)

    # --- Feature 5: Executive Summary ---
    print("Executing Feature 5...")
    summary_engine = ExecutiveSummaryEngine()
    sre_report = summary_engine.generate(triage_result, rca_result, external_context, persona="SRE")
    exec_report = summary_engine.generate(triage_result, rca_result, external_context, persona="Executive")
    summary_output = {
        "sre_markdown": sre_report,
        "executive_markdown": exec_report
    }
    with open(os.path.join(LOGS_DIR, "feature5_summary.json"), "w") as f:
        json.dump(summary_output, f, indent=4)

    print(f"\n✅ All pipeline outputs saved to: {LOGS_DIR}")

if __name__ == "__main__":
    run_and_save_pipeline()
