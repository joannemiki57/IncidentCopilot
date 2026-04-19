import json
import os
from incident_triage_poc import incident_triage
from incident_rca_engine import AdvancedRCAEngine
from incident_code_optimizer import CodeOptimizationEngine

def save_feature6_artifact():
    # 1. Setup scenario
    log_line = "2026-04-18 22:30:00 order-service ERROR: N+1 Database Query Pattern detected: repeated SELECT calls (101 times) causing latency"
    context = {
        "metrics_data": {
            "upstream.latency": { "current": 1250, "baseline": 300 },
            "db.active_connections": { "current": 390, "baseline": 150, "limit": 400 }
        },
        "metric_anomalies": ["db.active_connections", "upstream.latency"],
        "recent_deploy": False
    }

    # 2. Process through pipeline
    triage_result = incident_triage(log_line)
    rca_engine = AdvancedRCAEngine()
    rca_result = rca_engine.analyze(triage_result, context)
    
    # 3. Target Feature 6 Output
    optimizer = CodeOptimizationEngine()
    opt_result = optimizer.analyze(rca_result, triage_result, context)

    # 4. Save to data/ directory
    os.makedirs("data", exist_ok=True)
    target_path = "data/feature6_optimization.json"
    
    with open(target_path, "w") as f:
        json.dump(opt_result, f, indent=2)
    
    print(f"✅ Feature 6 JSON output saved to: {target_path}")

if __name__ == "__main__":
    save_feature6_artifact()
