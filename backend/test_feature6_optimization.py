import json
import os
import sys

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)

# Import Engines
from incident_triage_poc import incident_triage
from incident_rca_engine import AdvancedRCAEngine
from incident_executive_summary import ExecutiveSummaryEngine

def test_feature6_flow():
    print("======================================================================")
    print("🚀 [TEST] FEATURE 6 - AI DRIVEN CODE OPTIMIZATION")
    print("======================================================================\n")

    # 1. Mock Input: N+1 Query Symptom
    log_line = "2026-04-18 22:30:00 order-service ERROR: N+1 Database Query Pattern detected: repeated SELECT calls (101 times) causing connection pool wait-timeout"
    context = {
        "metrics_data": {
            "upstream.latency": { "current": 1250, "baseline": 300, "policy": "High Latency" },
            "db.active_connections": { "current": 390, "baseline": 150, "limit": 400, "policy": "Saturation Check" }
        },
        "metric_anomalies": ["db.active_connections", "upstream.latency"],
        "recent_deploy": False
    }

    # 2. Run Pipeline
    print("Step 1: Triage...")
    triage_result = incident_triage(log_line)
    
    print("Step 2: RCA (Detecting Code Level Issue)...")
    rca_engine = AdvancedRCAEngine()
    rca_result = rca_engine.analyze(triage_result, context)
    
    print("Step 3: Executive Summary (Feature 6 Integration)...")
    summary_engine = ExecutiveSummaryEngine()
    sre_report = summary_engine.generate(triage_result, rca_result, context, persona="SRE")

    # 3. Verify Output
    print("\n--- [SRE Technical Briefing Output] ---")
    print(sre_report)

    # Assertions (Visual check)
    if "AI Code Optimization Briefing" in sre_report:
        print("\n✅ Verification SUCCESS: Optimization Briefing found in SRE report.")
    else:
        print("\n❌ Verification FAILED: Optimization Briefing NOT found.")

    if "OrderService" in sre_report:
        print("✅ Verification SUCCESS: Target location identified.")
    
    if "1250ms" in sre_report and "77.6% reduction" in sre_report:
        print("✅ Verification SUCCESS: Performance delta calculation verified.")

if __name__ == "__main__":
    test_feature6_flow()
