import json
import sys
import os
from datetime import datetime

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from incident_rca_engine import AdvancedRCAEngine

def test_rca_output_format():
    engine = AdvancedRCAEngine()
    
    # Mock triage result
    triage_result = {
        "log_raw": "Connection refused: 400 bad request in API schema",
        "Triage Results": {
            "Affected Service": "API Gateway",
            "Severity Level": "P2 (High)",
            "Primary Category": "Software_Glitch",
            "Detected Categories": {"Software_Glitch": 0.9}
        },
        "Context Metadata": {
            "Template ID": "HDFS-102"
        }
    }
    
    # Mock context
    context = {
        "recent_deploy": True,
        "deploy_time_delta_mins": 5,
        "metric_anomalies": ["api.error.400_rate"]
    }
    
    result = engine.analyze(triage_result, external_context=context)
    print(json.dumps(result, indent=4, ensure_ascii=False))

if __name__ == "__main__":
    test_rca_output_format()
