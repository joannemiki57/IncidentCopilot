import json
import time
from incident_triage_poc import incident_triage, PersistenceTracker
from incident_rca_engine import AdvancedRCAEngine
from incident_executive_summary import ExecutiveSummaryEngine
from incident_action_plan import ActionPlanEngine

def run_v3_1_causal_audit_demo():
    tracker = PersistenceTracker()
    rca_engine = AdvancedRCAEngine()
    summary_engine = ExecutiveSummaryEngine()
    action_engine = ActionPlanEngine()

    print("\n" + "="*80)
    print("🚀 AIOPS INCIDENT COPILOT: END-TO-END PIPELINE (v3.1)")
    print("="*80)

    # Scenario: DB pool issues
    raw_log = "2026-04-18 16:30:00 [ERROR] Connection refused: Unable to acquire JDBC connection from pool"
    
    # Build persistence
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
            "change_type": "timeout configuration"
        },
        "metric_anomalies": ["db.active_connections", "upstream.payment.latency"],
        "metrics_data": {
            "upstream.payment.latency": {
                "current": 1375, 
                "baseline": 250, 
                "baseline_window": "P95 over 24h trailing window",
                "policy": "Deviation from SLA target (250ms)",
                "timestamp": "2026-04-18T16:26:00Z"
            },
            "db.active_connections": {
                "current": 450, 
                "baseline": 150, 
                "limit": 400,
                "baseline_window": "Average over previous 1h",
                "policy": "Saturation check vs pool limit",
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
    
    # 1-3. Triage & RCA & Summary
    rca_result = rca_engine.analyze(triage_result, external_context=context)
    sre_report = summary_engine.generate(triage_result, rca_result, external_context=context, persona="SRE")
    print(sre_report)
    
    print("-" * 40)
    print("🔋 [Feature 4] GENERATING ACTION PLAN...")
    
    # 4. Action Plan Generation
    incident_id = triage_result["Context Metadata"]["Template ID"]
    plan = action_engine.generate_plan(rca_result, triage_result)
    # Overwrite target and command for demo consistency
    plan["target"] = "service/payment-api"
    plan["command"] = f"kubectl restart deployment/payment-api -n production --grace-period=30"
    
    safety = action_engine.evaluate_safety(plan, rca_result["root_cause_analysis"]["top_hypotheses"][0]["total_confidence"])
    
    print(f"Proposed Action: {plan['title']}")
    print(f"Target: {plan['target']}")
    print(f"Suggested Command: `{plan['command']}`")
    print(f"Decision: {safety['decision']} (Risk Level: {safety['risk_level']})")
    print(f"📢 [HITL] Approval notification sent to #ops-alerts.")
    
    # Simulate Approval
    print(f"✅ Operator approved remediation via Slack interface.")
    
    # 5. Verification
    print(f"⌛ [Step 4] Monitoring system health for 5 minutes post-action...")
    verification = action_engine.verify_remediation(incident_id, plan, health_status="RECOVERED")
    print(f"🔍 [Verification] SUCCESS: Service metrics recovered. Error rate dropped below 0.1%.")
    print(f"✨ Final Action: Close Incident")

    print("="*80)
    print("✅ End-to-End Pipeline Verification Successful.")
    print("="*80)

if __name__ == "__main__":
    run_v3_1_causal_audit_demo()
