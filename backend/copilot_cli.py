#!/usr/bin/env python3
import sys
import argparse
import json
from incident_triage_poc import incident_triage, PersistenceTracker
from incident_rca_engine import AdvancedRCAEngine
from incident_executive_summary import ExecutiveSummaryEngine
from incident_action_plan import ActionPlanEngine
from incident_code_optimizer import CodeOptimizationEngine

def main():
    parser = argparse.ArgumentParser(description="IncidentCopilot Terminal CLI")
    parser.add_argument("log", nargs="?", help="Raw log string to analyze")
    parser.add_argument("--persona", choices=["SRE", "Executive"], default="SRE", help="Report persona (default: SRE)")
    parser.add_argument("--json", action="store_true", help="Output raw JSON instead of Markdown")
    args = parser.parse_args()

    # Handle stdin if no log argument is provided
    if not args.log:
        if not sys.stdin.isatty():
            args.log = sys.stdin.read().strip()
        else:
            parser.print_help()
            sys.exit(1)

    if not args.log:
        print("Error: No log input provided.")
        sys.exit(1)

    # Initialize Engines
    tracker = PersistenceTracker()
    rca_engine = AdvancedRCAEngine()
    summary_engine = ExecutiveSummaryEngine()
    action_engine = ActionPlanEngine()
    
    # 1. Triage
    triage_result = incident_triage(args.log, tracker=tracker)
    
    # 2. RCA (Mocking some context for CLI demo)
    context = {
        "metrics_data": {
            "upstream.latency": {"current": 1250, "baseline": 250},
            "db.active_connections": {"current": 450, "baseline": 150, "limit": 400}
        },
        "metric_anomalies": ["db.active_connections", "upstream.latency"],
        "recent_deploy": False
    }
    rca_result = rca_engine.analyze(triage_result, context)
    top_hypos = rca_result.get("root_cause_analysis", {}).get("top_hypotheses", [])
    
    # 3. Action Plan & Safety
    plan = action_engine.generate_plan(rca_result, triage_result)
    safety = None
    if top_hypos:
        safety = action_engine.evaluate_safety(plan, top_hypos[0]["total_confidence"])
    
    # 4. Summary & Report
    report = summary_engine.generate(triage_result, rca_result, context, persona=args.persona)

    if args.json:
        full_output = {
            "triage": triage_result,
            "rca": rca_result,
            "action_plan": {**plan, "safety": safety},
            "report": report
        }
        print(json.dumps(full_output, indent=2))
    else:
        print("\n" + "="*80)
        print(f"🕵️  INCIDENT COPILOT ANALYSIS - {args.persona} PERSONA")
        print("="*80)
        print(report)
        print("\n" + "="*80)
        if "title" in plan and safety:
            print(f"🔋 [ACTION PLAN] {plan['title']}")
            print(f"💻 Suggested: `{plan['command']}`")
            print(f"⚖️  Decision: {safety['decision']}")
        else:
            print(f"🔋 [ACTION PLAN] NO AUTOMATED ACTION MAPPED")
            print(f"💬 Detail: {plan.get('message', 'No hypothesis or action mapping found.')}")
        print("="*80 + "\n")

if __name__ == "__main__":
    main()
