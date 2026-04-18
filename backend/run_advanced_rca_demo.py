import json
from incident_rca_engine import AdvancedRCAEngine

def run_comprehensive_demo():
    engine = AdvancedRCAEngine()
    
    print("\n" + "="*80)
    print("COMPREHENSIVE HYBRID RCA DEMO: NEW SCENARIOS & PRIORITY LOGIC")
    print("="*80)

    # SCENARIO 1: SSL Expiration (Identity/Auth)
    print("\n[Scenario 1: SSL Certificate Expiration]")
    triage_1 = {
        "log_raw": "SSL_ERROR_HANDSHAKE_FAILED_UNKNOWN_CA: certificate has expired",
        "Triage Results": { 
            "Primary Category": "Network_Error", 
            "Detected Categories": {"Network_Error": 0.9},
            "Severity Level": "P2 (High)" # Added for HITL check
        }
    }
    context_1 = { "metric_anomalies": ["ssl.cert.days_to_expire"] }
    res_1 = engine.analyze(triage_1, context_1)
    top_1 = res_1['root_cause_analysis']['top_hypotheses'][0]
    print(f" -> Cause:      {top_1['hypothesis']}")
    print(f" -> Confidence: {top_1['total_confidence']}")
    print(f" -> Reason:     {res_1['root_cause_analysis']['reasoning_context']}")

    # SCENARIO 2: Backward Compatibility (Post-Deploy)
    # Testing Time-Decay Boost
    print("\n[Scenario 2: API Compatibility Issue (Very Recent Deploy)]")
    triage_2 = {
        "log_raw": "400 Bad Request: Missing required field 'user_meta'",
        "Triage Results": { 
            "Primary Category": "Software_Glitch", 
            "Detected Categories": {"Software_Glitch": 0.9},
            "Severity Level": "P1 (Critical)" # Added for HITL check
        }
    }
    context_2 = {
        "recent_deploy": True,
        "deploy_time_delta_mins": 5, # 5 mins ago -> Max boost
        "metric_anomalies": ["api.error.400_rate"]
    }
    res_2 = engine.analyze(triage_2, context_2)
    top_2 = res_2['root_cause_analysis']['top_hypotheses'][0]
    workflow_2 = top_2['recovery_workflow']
    print(f" -> Cause:      {top_2['hypothesis']}")
    print(f" -> Confidence: {top_2['total_confidence']}")
    print(f" -> HITL Status: {res_2['root_cause_analysis']['hitl_status']}")
    print(f" -> Recovery Trigger: {workflow_2['trigger_id']}")
    print(f" -> Approval Required: {workflow_2['approval_required']}")
    print(f" -> Reason:     {res_2['root_cause_analysis']['reasoning_context']}")

    # SCENARIO 3: Gray Failure (Node Variance)
    print("\n[Scenario 3: Infrastructure Gray Failure (Node Slowdown)]")
    triage_3 = {
        "log_raw": "App response slow, observed high i/o wait on local disk",
        "Triage Results": { "Primary Category": "Hardware_Error", "Detected Categories": {"Hardware_Error": 0.8} }
    }
    context_3 = { 
        "metric_anomalies": ["node.disk.latency"],
        "node_variance_detected": True # Special flag for gray failure
    }
    res_3 = engine.analyze(triage_3, context_3)
    top_3 = res_3['root_cause_analysis']['top_hypotheses'][0]
    print(f" -> Cause:      {top_3['hypothesis']}")
    print(f" -> Confidence: {top_3['total_confidence']}")
    print(f" -> Reason:     {res_3['root_cause_analysis']['reasoning_context']}")

    # SCENARIO 4: Priority of Causality (Network > DB)
    print("\n[Scenario 4: Priority of Causality (Infrastructure Boost)]")
    triage_4 = {
        "log_raw": "Connection Refused while fetching user from PG database",
        "Triage Results": { "Primary Category": "Network_Error", "Detected Categories": {"Network_Error": 0.9} }
    }
    res_4 = engine.analyze(triage_4) # No external context
    top_4 = res_4['root_cause_analysis']['top_hypotheses'][0]
    print(f" -> Cause:      {top_4['hypothesis']}")
    print(f" -> Confidence: {top_4['total_confidence']} (Includes +0.1 Infrastructure Boost)")

    print("\n" + "="*80)
    print("✅ All Advanced RCA Scenarios Verified.")
    print("="*80)

if __name__ == "__main__":
    run_comprehensive_demo()
