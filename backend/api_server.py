import os
import json
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

# Import incident engines
from incident_triage_poc import incident_triage
from incident_rca_engine import AdvancedRCAEngine
from incident_executive_summary import ExecutiveSummaryEngine
from incident_action_plan import ActionPlanEngine
from incident_code_optimizer import CodeOptimizationEngine

app = FastAPI(title="IncidentCopilot Real-time API")

# Path to data directory
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
os.makedirs(DATA_DIR, exist_ok=True)

class AnalyzeRequest(BaseModel):
    log_text: str
    context: Optional[dict] = None

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/analyze")
async def analyze_incident(req: AnalyzeRequest):
    """
    Core pipeline handler. Runs all features (F1-F6) and persists results to data/.
    """
    try:
        # 1. Initialize Engines
        rca_engine = AdvancedRCAEngine()
        summary_engine = ExecutiveSummaryEngine()
        action_engine = ActionPlanEngine()
        optimizer = CodeOptimizationEngine()

        # Default context if not provided
        context = req.context or {
            "metrics_data": {
                "upstream.latency": {"current": 1250, "baseline": 250},
                "db.active_connections": {"current": 450, "baseline": 150, "limit": 400}
            },
            "metric_anomalies": ["db.active_connections", "upstream.latency"],
            "recent_deploy": False
        }

        # --- RUN PIPELINE ---
        
        # F1: Triage
        triage_result = incident_triage(req.log_text)
        
        # F2: RCA
        rca_result = rca_engine.analyze(triage_result, context)
        
        # F4: Action Plan (F4 before F5/F6 is fine)
        action_plan = action_engine.generate_plan(rca_result, triage_result)
        
        # F6: Code Optimization
        opt_result = optimizer.analyze(rca_result, triage_result, context)
        
        # F5: Executive Summary (Aggregates everything)
        # Note: Summary engine currently expects 'rca_report' which includes opt_brief
        # We'll just pass persona="SRE" to get the technical briefing
        sre_markdown = summary_engine.generate(triage_result, rca_result, context, persona="SRE")
        executive_markdown = summary_engine.generate(triage_result, rca_result, context, persona="Executive")

        # --- PERSIST TO DATA/ (Feature Split Format) ---
        
        def save_json(name, data):
            path = os.path.join(DATA_DIR, name)
            with open(path, "w") as f:
                json.dump(data, f, indent=2)

        save_json("feature1_triage.json", triage_result)
        save_json("feature2_rca.json", rca_result)
        # Feature 3 (Evidence) is implicitly handled by the normalizer inside summary_engine.generate
        # But for the split loader, we should extract the normalized evidence items if possible.
        # For now, we'll save the raw rca result which contains top_hypotheses.
        
        # Feature 3 Evidence Extraction (Shim for frontend loader)
        evidence_items = summary_engine.normalizer.normalize(triage_result, context, rca_result.get("root_cause_analysis", {}).get("top_hypotheses", []))
        # EvidenceItem is a class in incident_executive_summary, need to serialize
        evidence_json = [vars(item) for item in evidence_items]
        save_json("feature3_evidence.json", evidence_json)

        save_json("feature4_action_plan.json", action_plan)
        save_json("feature5_summary.json", {
            "sre_markdown": sre_markdown,
            "executive_markdown": executive_markdown
        })
        save_json("feature6_optimization.json", opt_result)

        # Return Consolidated result for immediate UI consumption
        return {
            "triage": triage_result,
            "rca": rca_result,
            "evidence": evidence_json,
            "action_plan": action_plan,
            "summary": {"sre": sre_markdown, "executive": executive_markdown},
            "optimization": opt_result
        }

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
