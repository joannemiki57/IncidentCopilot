import json
import os
import sys

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(BASE_DIR), "data")
sys.path.append(BASE_DIR)

# Import Engines
from incident_triage_poc import incident_triage
from incident_rca_engine import AdvancedRCAEngine
from incident_action_plan import ActionPlanEngine
from incident_executive_summary import ExecutiveSummaryEngine, EvidenceNormalizer

def generate_artifact(scenario_name, log_line, metrics_data):
    print(f"Generating artifact for: {scenario_name}...")
    
    # 1. Triage
    triage_result = incident_triage(log_line)
    
    # 2. RCA
    rca_engine = AdvancedRCAEngine()
    external_context = {"metrics_data": metrics_data, "recent_deploy": False}
    rca_result = rca_engine.analyze(triage_result, external_context)
    
    # 3. Evidence
    normalizer = EvidenceNormalizer()
    top_hypos = rca_result.get("root_cause_analysis", {}).get("top_hypotheses", [])
    evidence_graph = normalizer.normalize(triage_result, external_context, top_hypos)
    evidence_serializable = [item.__dict__ for item in evidence_graph]
    
    # 4. Action Plan
    action_engine = ActionPlanEngine()
    plan = action_engine.generate_plan(rca_result, triage_result)
    safety = action_engine.evaluate_safety(plan, top_hypos[0]['total_confidence'] if top_hypos else 0.5)
    
    # 5. Summary
    summary_engine = ExecutiveSummaryEngine()
    sre_report = summary_engine.generate(triage_result, rca_result, external_context, persona="SRE")
    exec_report = summary_engine.generate(triage_result, rca_result, external_context, persona="Executive")
    
    # Combine into full artifact
    artifact = {
        "scenario": scenario_name,
        "feature1_triage": triage_result,
        "feature2_rca": rca_result,
        "feature3_evidence": evidence_serializable,
        "feature4_action_plan": { "plan": plan, "safety_evaluation": safety },
        "feature5_summary": { "sre_markdown": sre_report, "executive_markdown": exec_report }
    }
    
    target_path = os.path.join(DATA_DIR, f"{scenario_name}.json")
    with open(target_path, "w") as f:
        json.dump(artifact, f, indent=4)
    print(f"✅ Saved to {target_path}")

def main():
    # Scenario 1: DB Saturation
    generate_artifact(
        "db-saturation",
        "2026-04-18 22:30:00 payment-api ERROR: Could not acquire connection from pool (timeout matched)",
        {
            "db.active_connections": { "current": 450, "baseline": 150, "limit": 400, "policy": "Saturation Check" },
            "cpu.usage": { "current": 12.0, "baseline": 15.0, "policy": "Normal range" }
        }
    )
    
    # Scenario 2: HDFS Failure
    generate_artifact(
        "hdfs-failure",
        "081109 203615 148 ERROR dfs.DataNode$PacketResponder: PacketResponder terminates with error: Connection refused",
        {
            "network.egress.error_rate": { "current": 4.5, "baseline": 0.1, "policy": "Network Error Threshold" },
            "disk.iops": { "current": 1200, "baseline": 1100, "policy": "Normal range" }
        }
    )
    
    # Scenario 3: BGL Hardware
    generate_artifact(
        "bgl-hardware",
        "2026-04-18 22:45:00 RAS KERNEL FATAL: Correctable ECC memory error threshold exceeded on Node R12-M1",
        {
            "hardware.memory.ecc_errors": { "current": 25, "baseline": 0, "limit": 10, "policy": "Hardware Health Policy" },
            "cpu.temp": { "current": 78, "baseline": 65, "policy": "High temp warning" }
        }
    )

if __name__ == "__main__":
    main()
