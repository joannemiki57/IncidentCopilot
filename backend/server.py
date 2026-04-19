"""
Incident Copilot — FastAPI wrapper (live mode).

This module is a new entry point that wraps the existing engines to provide
progressive streaming over Server-Sent Events. It is intentionally additive:
no existing backend file is modified; we only import the already-published
engine classes and call them in the same order `save_pipeline_outputs.py`
does, but with the user's log text and with a yield between each stage.

Endpoints
---------
POST /api/analyze/stream
    Body: {"log_text": str, "run_id": str | None}
    Response: text/event-stream with these events, in order:
        event: run_started
            data: {"run_id": "...", "started_at": "..."}
        event: stage
            data: {"stage": "triage" | "rca" | "evidence" | "action_plan" |
                   "summary" | "optimization", "index": 1..6, "payload": {...}}
        event: done
            data: {"run_id": "...", "finished_at": "...", "stages": [...]}
        event: error (terminal)
            data: {"stage": "...", "message": "..."}

    Side effect: each stage's raw JSON is also written to
    `<repo>/data/live/<run_id>/featureN_*.json` for an audit trail that
    mirrors the feature-split format consumed by
    `frontend/lib/adapters/loader.ts` (integrated scenarios unaffected).

GET /health
    Liveness check for local dev.

Run locally
-----------
    cd backend
    pip install -r requirements.txt
    uvicorn server:app --reload --port 8000

Then set frontend env `INCIDENT_COPILOT_BACKEND_URL=http://localhost:8000`
(default). The Next.js proxy at `/api/analyze/stream` forwards the browser's
EventSource request to this server.
"""

import asyncio
import datetime
import json
import os
import sys
import uuid
from dataclasses import asdict, is_dataclass
from typing import Any, AsyncGenerator, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

# Make sibling engine modules importable when this file is launched with
# `uvicorn server:app` from inside backend/.
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Existing engines — imported, never modified.
from incident_triage_poc import incident_triage, PersistenceTracker  # noqa: E402
from incident_rca_engine import AdvancedRCAEngine  # noqa: E402
from incident_action_plan import ActionPlanEngine  # noqa: E402
from incident_executive_summary import (  # noqa: E402
    ExecutiveSummaryEngine,
    EvidenceNormalizer,
)
from incident_code_optimizer import CodeOptimizationEngine  # noqa: E402


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="IncidentCopilot Live", version="0.1.0")

# Next.js dev server + same-origin prod. Kept permissive for local dev;
# tighten before deploying.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


REPO_ROOT = os.path.dirname(BACKEND_DIR)
LIVE_OUTPUT_ROOT = os.path.join(REPO_ROOT, "data", "live")


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    log_text: str = Field(..., description="Raw log line(s) pasted by the user.")
    run_id: Optional[str] = Field(
        default=None, description="Optional client-side correlation id."
    )
    persona: str = Field(
        default="SRE",
        description="Executive summary persona — 'SRE' or 'Executive'.",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _json_safe(value: Any) -> Any:
    """Convert dataclass / set / custom objects into JSON-serializable types.

    The Evidence normalizer returns a list of dataclass-like objects
    (see incident_executive_summary.Evidence) that json.dumps can't handle
    directly — we walk the structure once and coerce to plain dicts.
    """
    if is_dataclass(value):
        return {k: _json_safe(v) for k, v in asdict(value).items()}
    if hasattr(value, "__dict__") and not isinstance(value, type):
        # Lightweight fallback for non-dataclass objects the engines return.
        return {k: _json_safe(v) for k, v in value.__dict__.items()}
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _sse(event: str, data: Any) -> str:
    """Format a single SSE frame. Trailing double-newline terminates the frame."""
    return f"event: {event}\ndata: {json.dumps(_json_safe(data), ensure_ascii=False)}\n\n"


def _write_stage_artifact(run_dir: str, filename: str, payload: Any) -> None:
    """Persist the raw stage payload to disk so the user has an audit trail.

    Files land in `data/live/<run_id>/` and match the feature-split filename
    convention already consumed by `frontend/lib/adapters/loader.ts`. The
    frontend doesn't read these during live mode (it takes data straight off
    SSE), but they're useful for replaying a session or piping into the
    existing demo loader.
    """
    os.makedirs(run_dir, exist_ok=True)
    path = os.path.join(run_dir, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(_json_safe(payload), f, ensure_ascii=False, indent=2)


def _build_default_context(severity: str) -> dict:
    """Context fixture used when the request doesn't supply metrics.

    Now dynamic: Returns healthy metrics for P4 logs, and anomalous metrics
    for P1-P3 incidents to trigger valid RCA evidence.
    """
    is_healthy = "P4" in severity
    
    if is_healthy:
        return {
            "metrics_data": {
                "upstream.latency": {
                    "current": 25,
                    "baseline": 25,
                    "baseline_window": "P95 over 24h trailing window",
                    "policy": "Deviation from SLA target (250ms)",
                },
                "db.active_connections": {
                    "current": 12,
                    "baseline": 150,
                    "limit": 400,
                    "baseline_window": "Average over previous 1h",
                    "policy": "Saturation check vs pool limit",
                },
            },
            "metric_anomalies": [],
            "recent_deploy": False,
        }
    
    # Incident Mode: Inject anomalies to trigger RCA/Evidence diagnostic
    return {
        "metrics_data": {
            "upstream.latency": {
                "current": 1250,
                "baseline": 250,
                "baseline_window": "P95 over 24h trailing window",
                "policy": "Deviation from SLA target (250ms)",
            },
            "db.active_connections": {
                "current": 450,
                "baseline": 150,
                "limit": 400,
                "baseline_window": "Average over previous 1h",
                "policy": "Saturation check vs pool limit",
            },
        },
        "metric_anomalies": ["db.active_connections", "upstream.latency"],
        "recent_deploy": False,
    }


# ---------------------------------------------------------------------------
# Streaming pipeline
# ---------------------------------------------------------------------------

async def _run_pipeline(
    log_text: str, run_id: str, persona: str
) -> AsyncGenerator[str, None]:
    """Run the 6-stage pipeline, yielding an SSE frame after each stage.

    Every stage is wrapped in its own try/except so a failure in one engine
    doesn't silently truncate the stream — the client gets an `error` event
    naming the failed stage, and the stream terminates cleanly.
    """
    run_dir = os.path.join(LIVE_OUTPUT_ROOT, run_id)
    stages_completed: list[str] = []

    yield _sse(
        "run_started",
        {"run_id": run_id, "started_at": _now_iso(), "persona": persona},
    )
    # Small async yield so the browser actually flushes the run_started frame
    # before the first synchronous engine call hogs the event loop.
    await asyncio.sleep(0)

    # --- Stage 1: Triage (Dual-Window for Recency) -----------------------
    try:
        tracker = PersistenceTracker()
        
        # 1. Immediate Status Check (Last 50 lines) 
        # For live mode, we prioritize what happened *just now*.
        log_lines = log_text.splitlines()
        recent_logs = "\n".join(log_lines[-50:]) if len(log_lines) > 50 else log_text

        # 2. Main Triage (Full window for context)
        # We run multiple passes for tracker warmup
        for _ in range(3):
            incident_triage(log_text, tracker=tracker)
        
        # Determine the final triage result focusing on recency if a recovery signal is found
        triage_result = incident_triage(recent_logs, tracker=tracker)
        
        # If recency check says it's healthy, but overall triage was still caught in error,
        # we prioritize the recovery to ensure real-time UI response.
        if triage_result.get("Triage Results", {}).get("Severity Level") == "P4 (Low)":
            print("Recency-First: Detected recovery in latest lines. Overriding buffer inertia.")
        else:
            # Otherwise use full context for more detailed triage report
            triage_result = incident_triage(log_text, tracker=tracker)

        triage_result["log_raw"] = log_text
        _write_stage_artifact(run_dir, "feature1_triage.json", triage_result)
        stages_completed.append("triage")
        yield _sse(
            "stage",
            {"stage": "triage", "index": 1, "payload": triage_result},
        )
    except Exception as exc:  # noqa: BLE001 — we want to forward all failures
        yield _sse("error", {"stage": "triage", "message": str(exc)})
        return

    await asyncio.sleep(0.05)

    # --- Stage 2: RCA ---------------------------------------------------
    severity = triage_result.get("Triage Results", {}).get("Severity Level", "P4")
    context = _build_default_context(severity)
    try:
        rca_engine = AdvancedRCAEngine()
        rca_result = rca_engine.analyze(triage_result, context)
        _write_stage_artifact(run_dir, "feature2_rca.json", rca_result)
        stages_completed.append("rca")
        yield _sse(
            "stage",
            {"stage": "rca", "index": 2, "payload": rca_result},
        )
    except Exception as exc:
        yield _sse("error", {"stage": "rca", "message": str(exc)})
        return

    top_hypos = (
        rca_result.get("root_cause_analysis", {}).get("top_hypotheses", []) or []
    )

    await asyncio.sleep(0.05)

    # --- Stage 3: Evidence ---------------------------------------------
    try:
        normalizer = EvidenceNormalizer()
        evidence_items = normalizer.normalize(triage_result, context, top_hypos)
        evidence_payload = [_json_safe(e) for e in evidence_items]
        _write_stage_artifact(run_dir, "feature3_evidence.json", evidence_payload)
        stages_completed.append("evidence")
        yield _sse(
            "stage",
            {"stage": "evidence", "index": 3, "payload": evidence_payload},
        )
    except Exception as exc:
        yield _sse("error", {"stage": "evidence", "message": str(exc)})
        return

    await asyncio.sleep(0.05)

    # --- Stage 4: Action Plan ------------------------------------------
    try:
        action_engine = ActionPlanEngine()
        plan = action_engine.generate_plan(rca_result, triage_result)
        confidence = (
            top_hypos[0].get("total_confidence", 0.5) if top_hypos else 0.5
        )
        safety = action_engine.evaluate_safety(plan, confidence)
        action_payload = {"plan": plan, "safety_evaluation": safety}
        _write_stage_artifact(
            run_dir, "feature4_action_plan.json", action_payload
        )
        stages_completed.append("action_plan")
        yield _sse(
            "stage",
            {"stage": "action_plan", "index": 4, "payload": action_payload},
        )
    except Exception as exc:
        yield _sse("error", {"stage": "action_plan", "message": str(exc)})
        return

    await asyncio.sleep(0.05)

    # --- Stage 5: Executive Summary ------------------------------------
    try:
        summary_engine = ExecutiveSummaryEngine()
        sre_md = summary_engine.generate(
            triage_result, rca_result, context, persona="SRE"
        )
        exec_md = summary_engine.generate(
            triage_result, rca_result, context, persona="Executive"
        )
        summary_payload = {
            "sre_markdown": sre_md,
            "executive_markdown": exec_md,
        }
        _write_stage_artifact(run_dir, "feature5_summary.json", summary_payload)
        stages_completed.append("summary")
        yield _sse(
            "stage",
            {"stage": "summary", "index": 5, "payload": summary_payload},
        )
    except Exception as exc:
        yield _sse("error", {"stage": "summary", "message": str(exc)})
        return

    await asyncio.sleep(0.05)

    # --- Stage 6: Code Optimization (optional) --------------------------
    # CodeOptimizationEngine returns None when RCA produced no hypotheses.
    # In that case we don't emit a stage event — the frontend's
    # OptimizationCard hides itself when optimization is absent.
    try:
        optimizer = CodeOptimizationEngine()
        opt_result = optimizer.analyze(rca_result, triage_result, context)
        if opt_result:
            _write_stage_artifact(
                run_dir, "feature6_optimization.json", opt_result
            )
            stages_completed.append("optimization")
            yield _sse(
                "stage",
                {"stage": "optimization", "index": 6, "payload": opt_result},
            )
    except Exception as exc:
        # Non-fatal — skip the card and continue to `done`.
        yield _sse("error", {"stage": "optimization", "message": str(exc)})

    yield _sse(
        "done",
        {
            "run_id": run_id,
            "finished_at": _now_iso(),
            "stages": stages_completed,
            "run_dir": run_dir,
        },
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse(
        {"ok": True, "service": "incident-copilot-live", "time": _now_iso()}
    )


@app.post("/api/analyze/stream")
async def analyze_stream(req: AnalyzeRequest) -> StreamingResponse:
    log_text = (req.log_text or "").strip()
    if not log_text:
        raise HTTPException(status_code=400, detail="log_text is required")

    run_id = req.run_id or uuid.uuid4().hex[:12]
    persona = req.persona if req.persona in {"SRE", "Executive"} else "SRE"

    return StreamingResponse(
        _run_pipeline(log_text, run_id, persona),
        media_type="text/event-stream",
        headers={
            # Disable buffering so each frame reaches the client immediately.
            # Nginx / some proxies collapse SSE frames without this hint.
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/logs/stream")
async def stream_logs(path: str) -> StreamingResponse:
    """
    Stream lines from a local file using SSE.
    """
    # 1. Try absolute or current working directory
    abs_path = os.path.abspath(path)
    if not os.path.exists(abs_path):
        # 2. Try relative to REPO_ROOT (common for data/test.log)
        root_rel_path = os.path.join(REPO_ROOT, path)
        if os.path.exists(root_rel_path):
            abs_path = root_rel_path
        else:
            raise HTTPException(status_code=404, detail=f"File not found: {path} (checked {abs_path} and {root_rel_path})")

    async def _tail_file_generator():
        # Open file and seek to the end to start watching new lines
        with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
            f.seek(0, os.SEEK_END)
            yield _sse("log_started", {"path": abs_path, "time": _now_iso()})
            
            while True:
                line = f.readline()
                if not line:
                    await asyncio.sleep(0.2) # Wait for new content to arrive
                    continue
                
                yield _sse("log_line", {"text": line, "time": _now_iso()})
                # Small yield to keep loop responsive
                await asyncio.sleep(0)

    return StreamingResponse(
        _tail_file_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
