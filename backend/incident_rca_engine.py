import json
import re
from datetime import datetime

# ── Hypothesis Templates ──────────────────────────────────────────────────
HYPOTHESIS_TEMPLATES = {
    "Resource_Exhaustion": [
        {
            "id": "H_RES_1",
            "title": "Database Connection Pool Exhaustion",
            "log_signals": ["connection pool", "exhausted", "timeout", "acquire jdbc"],
            "required_metrics": ["db.active_connections", "db.pool.waiting"],
            "recovery_trigger_id": "RESTART_DB_POOL",
            "description": "Application session leak or sudden load spike overwhelming the DB pool."
        },
        {
            "id": "H_RES_2",
            "title": "Java Heap OutOfMemory (OOM)",
            "log_signals": ["OutOfMemoryError", "GC overhead", "heap space"],
            "required_metrics": ["jvm.memory.heap.usage"],
            "recovery_trigger_id": "RESTART_SERVICE_OOM",
            "description": "JVM heap memory limit reached."
        }
    ],
    "Network_Error": [
        {
            "id": "H_NET_1",
            "title": "Upstream Service Degradation",
            "log_signals": ["connection refused", "503", "gateway timeout", "upstream timeout", "dependency failure"],
            "required_metrics": ["upstream.latency", "network.egress.error_rate"],
            "recovery_trigger_id": "SWITCH_STANDBY_API",
            "description": "External upstream dependency is slow or unreachable, causing caller-side resource starvation."
        },
        {
            "id": "H_NET_2",
            "title": "Deploy-Induced Configuration Regression",
            "log_signals": ["timeout", "connection refused", "configuration", "pool"],
            "required_metrics": ["deploy.error_rate_delta"],
            "recovery_trigger_id": "ROLLBACK_DEPLOY",
            "description": "Recent deployment changed timeout/pool/retry settings, degrading service resilience."
        },
        {
            "id": "H_NET_3",
            "title": "SSL/TLS Certificate Expiration",
            "log_signals": ["handshake failed", "expired", "certificate_unknown"],
            "required_metrics": ["ssl.cert.days_to_expire"],
            "recovery_trigger_id": "RENEW_SSL_CERT",
            "description": "Authentication failure due to expired or invalid SSL certificates."
        }
    ],
    "Hardware_Error": [
        {
            "id": "H_HW_2",
            "title": "Infrastructure Gray Failure (Node Slowdown)",
            "log_signals": ["machine check", "i/o wait", "slow response"],
            "required_metrics": ["node.cpu.iowait", "node.disk.latency"],
            "recovery_trigger_id": "DRAIN_NODE",
            "description": "Partial failure where a node is alive but performing extremely slowly due to I/O bottlenecks."
        }
    ],
    "Software_Glitch": [
        {
            "id": "H_SW_2",
            "title": "API Backward Compatibility Conflict",
            "log_signals": ["400 bad request", "invalid schema", "missing field"],
            "required_metrics": ["api.error.400_rate"],
            "recovery_trigger_id": "ROLLBACK_API_SCHEMA",
            "description": "Recent schema change is incompatible with legacy client versions."
        }
    ]
}

# ── Advanced Hybrid RCA Engine ───────────────────────────────────────────
class AdvancedRCAEngine:
    # Priority of Causality: Network/Infrastructure faults often 'cause' App faults.
    # Lower rank means higher priority (more likely to be the root).
    CAUSAL_HIERARCHY = {
        "Network_Error": 1,
        "Hardware_Error": 2,
        "Resource_Exhaustion": 3,
        "Database_Error": 3,
        "Software_Glitch": 4,
        "Authentication_Failure": 4
    }

    def __init__(self, hypothesis_pool=HYPOTHESIS_TEMPLATES):
        self.pool = hypothesis_pool

    def analyze(self, triage_result, external_context=None):
        ctx = external_context or {}
        triage = triage_result.get("Triage Results", {})
        metadata = triage_result.get("Context Metadata", {})
        
        primary_cat = triage.get("Primary Category")
        scenario = triage.get("Compound Scenario")
        identifiers = metadata.get("Identifiers", {})
        
        # Step 1: Hypothesis Pool Loading
        hypotheses = list(self.pool.get(primary_cat, []))
        # Also load adjacent categories for compound scenarios
        adjacent_cats = {"Network_Error": ["Resource_Exhaustion"], 
                         "Resource_Exhaustion": ["Network_Error"],
                         "Software_Glitch": ["Network_Error"]}
        for adj in adjacent_cats.get(primary_cat, []):
            hypotheses.extend(self.pool.get(adj, []))
        # Fallback: if still empty, merge all detected categories
        if not hypotheses:
            for cat in triage.get("Detected Categories", {}).keys():
                hypotheses.extend(self.pool.get(cat, []))
        # Deduplicate by id
        seen_ids = set()
        unique = []
        for h in hypotheses:
            if h["id"] not in seen_ids:
                seen_ids.add(h["id"])
                unique.append(h)
        hypotheses = unique


        scored_hypotheses = []

        # Step 2 & 3: Evidence Gathering & Scoring
        for h in hypotheses:
            score_report = self._calculate_hybrid_score(h, triage_result, ctx)
            scored_hypotheses.append({
                "hypothesis": h["title"],
                "total_confidence": float(score_report["total"]),
                "breakdown": score_report["breakdown"],
                "id": h["id"],
                "description": h["description"],
                "recovery_trigger_id": h["recovery_trigger_id"],
                "verification_steps": h.get("verification_steps", ["Verify log correlation."])
            })

        # Apply Priority of Causality (Hierarchy Re-ranking)
        self._resolve_causality(scored_hypotheses, primary_cat)

        # Step 4: Step-by-Step Reasoning (LLM-Ready)
        scored_hypotheses.sort(key=lambda x: x["total_confidence"], reverse=True)
        top_hypotheses = scored_hypotheses[:3]

        # Determine HITL (Human-in-the-Loop) Requirements based on Severity
        sev_str = triage.get("Severity Level", "P4")
        is_high_severity = any(p in sev_str for p in ["P1", "P2"])
        
        # Enrich Top Hypotheses with Safety Metadata
        for h in top_hypotheses:
            h["recovery_workflow"] = {
                "trigger_id": h.pop("recovery_trigger_id"),
                "approval_required": is_high_severity,
                "safety_level": "High (Manual Approval)" if is_high_severity else "Low (Automatic)",
                "action_description": f"Execute {h['hypothesis']} automated recovery SOP."
            }

        reasoning_context = self._generate_reasoning(top_hypotheses, triage, ctx)

        return {
            "root_cause_analysis": {
                "top_hypotheses": top_hypotheses,
                "hitl_status": "Awaiting Approval" if is_high_severity else "Auto-Executable",
                "analyzed_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                "reasoning_context": reasoning_context
            }
        }

    def _calculate_hybrid_score(self, h, result, ctx):
        log_content = result.get("log_raw", "").lower()
        if not log_content:
            log_content = result.get("Context Metadata", {}).get("Log Template", "").lower()

        # 1. Log Match (40%) - Robust check
        log_match = any(sig.lower() in log_content for sig in h["log_signals"])
        log_score = 0.4 if log_match else 0.0

        # 2. Time-Decay Deployment Boost (30%)
        deploy_score = 0.0
        if ctx.get("recent_deploy"):
            # Check if hypothesis relates to Software/API changes
            is_sw_related = h["id"].startswith("H_SW") or "API" in h["title"]
            
            # Simulated Time Decay: Higher boost if deploy_time_delta is provided
            # e.g., delta < 15 mins -> 0.3, delta < 60 mins -> 0.15
            delta = ctx.get("deploy_time_delta_mins", 30)
            if delta <= 15:
                base_boost = 0.3
            elif delta <= 60:
                base_boost = 0.15
            else:
                base_boost = 0.05
            
            deploy_score = base_boost if is_sw_related else base_boost * 0.5

        # 3. Metric Anomaly Score (30%)
        metric_score = 0.0
        anomalies = ctx.get("metric_anomalies", [])
        if h.get("required_metrics"):
            match = any(m in anomalies for m in h["required_metrics"])
            if match: metric_score = 0.3
        
        # Gray Failure Special Case: boost if node variance is detected
        if h["id"] == "H_HW_2" and ctx.get("node_variance_detected"):
            metric_score = 0.3

        # Collect Evidence IDs for UI Mapping
        evidence_ids = []
        if log_match:
            # Synthetic ID based on Template ID or log type
            tmpl_id = result.get("Context Metadata", {}).get("Template ID", "LOG-999")
            evidence_ids.append(f"LOG-{tmpl_id}")
        
        if metric_score > 0:
            for m in (h.get("required_metrics") or []):
                if m in anomalies:
                    evidence_ids.append(f"METRIC-{m}")
        
        if ctx.get("recent_deploy"):
            evidence_ids.append("EVENT-RECENT-DEPLOY")

        total = round(log_score + deploy_score + metric_score, 2)
        
        return {
            "total": total,
            "breakdown": {
                "Log Quality": round(log_score, 2),
                "Time-Decay Deploy": round(deploy_score, 2),
                "Metric Anomaly": round(metric_score, 2),
                "evidence_ids": evidence_ids
            }
        }

    def _resolve_causality(self, hypotheses, primary_cat):
        """
        Adjusts Confidence Scores based on the Causal Hierarchy.
        If the primary category is a 'Lower Layer' (e.g. Network), 
        it gives a 10% boost to emphasize it as the root.
        """
        rank = self.CAUSAL_HIERARCHY.get(primary_cat, 5)
        if rank <= 2: # Network or Hardware
            for h in hypotheses:
                h["total_confidence"] = min(h["total_confidence"] + 0.1, 0.99)
                h["breakdown"]["Causality Boost"] = 0.1

    def _generate_reasoning(self, top_3, triage, ctx):
        if not top_3: return "No clear causal pattern identified."
        
        primary = top_3[0]
        reason = f"Ranked 1: '{primary['hypothesis']}' ({int(primary['total_confidence']*100)}% conf). "
        
        bits = []
        if primary['breakdown'].get('Log Quality'): bits.append("Log signatures matched")
        if primary['breakdown'].get('Time-Decay Deploy'): bits.append(f"Highly correlated with recent deployment (<{ctx.get('deploy_time_delta_mins','?')} mins ago)")
        if primary['breakdown'].get('Metric Anomaly'): bits.append("Cross-verified with system metrics")
        if primary['breakdown'].get('Causality Boost'): bits.append("Prioritized as Infrastructure Layer issue")
        
        if bits: 
            reason += "Reasoning: Found " + ", ".join(bits) + "."
        return reason

if __name__ == "__main__":
    # DEMO: Priority of Causality (Network > App)
    engine = AdvancedRCAEngine()
    
    # Context: Both a log error and a recent deploy
    mock_triage = {
        "log_raw": "Connection Refused: Failed to handshake with API",
        "Triage Results": {
            "Primary Category": "Network_Error",
            "Detected Categories": {"Network_Error": 0.9}
        }
    }
    context = {
        "recent_deploy": True,
        "deploy_time_delta_mins": 5, # Very recent!
        "metric_anomalies": ["network.egress.error_rate"]
    }
    
    print("\n[Hybrid RCA: External API Outage Scenario]")
    print(json.dumps(engine.analyze(mock_triage, context), indent=4))
