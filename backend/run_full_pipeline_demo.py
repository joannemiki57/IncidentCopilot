import json
from incident_triage_poc import incident_triage, PersistenceTracker
from incident_rca_engine import AdvancedRCAEngine
from incident_executive_summary import ExecutiveSummaryEngine

def run_v3_1_causal_audit_demo():
    tracker = PersistenceTracker()
    rca_engine = AdvancedRCAEngine()
    summary_engine = ExecutiveSummaryEngine()

    print("\n" + "="*80)
    print("DECISION SUPPORT LAYER (v3.1): CAUSAL AUDIT")
    print("="*80)

    # Scenario: Config deploy regression vs Upstream degradation vs DB pool issue
    raw_log = "2026-04-18 16:30:00 [ERROR] Connection refused: Unable to acquire JDBC connection from pool"
    
    # Build persistence (simulate 183 occurrences)
    for _ in range(6):
        incident_triage(raw_log, tracker=tracker)
    triage_result = incident_triage(raw_log, tracker=tracker)
    triage_result["log_raw"] = raw_log
    
    context = {
        "recent_deploy": True,
        "deploy_timestamp": "2026-04-18T16:25:00Z",
        "deploy_time_delta_mins": 5,
        "deploy_metadata": {
            "is_config_change": True,
            "change_type": "timeout and pool-size"
        },
        "metric_anomalies": ["db.active_connections", "upstream.payment.latency"],
        "metrics_data": {
            "upstream.payment.latency": {
                "current": 1240, 
                "baseline": 200, 
                "baseline_window": "P95 over 24h trailing window",
                "policy": "SLA violation threshold (SLA target: 250ms)",
                "timestamp": "2026-04-18T16:26:00Z"
            },
            "db.active_connections": {
                "current": 450, 
                "baseline": 150, 
                "limit": 400,
                "baseline_window": "Average over previous 1h",
                "policy": "Saturation check vs configured pool limit",
                "timestamp": "2026-04-18T16:28:00Z"
            },
            "db.cpu_usage": {
                "current": 22, 
                "baseline": 25, 
                "baseline_window": "Median over previous 7 days",
                "policy": "Resource saturation health check",
                "timestamp": "2026-04-18T16:28:30Z"
            }
        }
    }
    
    rca_result = rca_engine.analyze(triage_result, external_context=context)
    sre_report = summary_engine.generate(triage_result, rca_result, external_context=context, persona="SRE")
    
    print(sre_report)
    
    print("="*80)
    print("v3.1 AUDIT CHECKLIST:")
    print("  [1] Hypotheses are on distinct axes (Upstream vs Deploy-Config vs DB Pool)")
    print("  [2] DB CPU weakens 'DB Connection Pool Exhaustion', NOT the leader")
    print("  [3] Config deploy is SUPPORT (not CONTEXT)")
    print("  [4] Logs show count, first-seen, impact service")
    print("  [5] Separation gap is quantified with actionable label")
    print("  [6] Every item has Baseline | Policy | Drilldown consistently")
    print("  [7] Guardrail reason is specific (not generic)")
    print("="*80)

if __name__ == "__main__":
    run_v3_1_causal_audit_demo()
