import json
from datetime import datetime

class EvidenceItem:
    """Standardized schema for v3.1 (Causal Audit Layer)."""
    def __init__(self, evidence_id, category, signal_name, content, observed_at, 
                 delta_ratio=1.0, baseline_desc="N/A", policy_desc="N/A",
                 drilldown_url="N/A", aggregation_info=None,
                 weakens_hypothesis=None):
        self.evidence_id = evidence_id
        self.category = category  # SUPPORT, WEAKEN, CONTEXT
        self.signal_name = signal_name
        self.content = content
        self.observed_at = observed_at
        self.delta_ratio = delta_ratio
        self.baseline_desc = baseline_desc
        self.policy_desc = policy_desc
        self.drilldown_url = drilldown_url
        self.aggregation_info = aggregation_info or {}
        self.weakens_hypothesis = weakens_hypothesis  # Name of hypothesis this signal weakens

class EvidenceNormalizer:
    """v3.1 Normalizer with hypothesis-aware categorization."""
    def normalize(self, triage_result, context, top_hypotheses=None):
        evidence_graph = []
        incident_time = triage_result.get("Extracted Metadata", {}).get("Standardized Timestamp", "Unknown")
        
        def get_time_str(iso_str):
            try:
                if "T" in iso_str: return iso_str.split("T")[1][:8]
                return iso_str[-8:]
            except: return "??:??:??"

        # 1. Metrics
        metrics = context.get("metrics_data", {})
        for m_name, data in metrics.items():
            current = data.get("current", 0)
            baseline = data.get("baseline", 1)
            limit = data.get("limit")
            window = data.get("baseline_window", "24h trailing avg")
            policy = data.get("policy", "Deviation from normal baseline")
            ratio = current / baseline if baseline > 0 else 1.0
            
            signal_human = m_name.replace('_', ' ').replace('.', ' ').title()
            
            if limit and current >= limit:
                content = f"{signal_human} exceeded configured limit ({current}/{limit})"
                category = "SUPPORT"
                weakens = None
            elif 0.8 <= ratio <= 1.2:
                content = f"{signal_human} remained near baseline ({ratio:.1f}x)"
                # Healthy signal: weakens specific hypothesis, not the leader
                weakens = self._infer_weakened_hypothesis(m_name, top_hypotheses)
                category = "WEAKEN" if weakens else "CONTEXT"
            elif ratio > 1.2:
                verb = "rose"
                content = f"{signal_human} {verb} {ratio:.1f}x"
                category = "SUPPORT"
                weakens = None
            else:
                verb = "dropped to"
                content = f"{signal_human} {verb} {ratio:.1f}x"
                category = "CONTEXT"
                weakens = None

            evidence_graph.append(EvidenceItem(
                evidence_id=f"METRIC-{m_name.upper().replace('.', '_')}",
                category=category,
                signal_name=m_name,
                content=content,
                observed_at=get_time_str(data.get("timestamp", incident_time)),
                delta_ratio=ratio,
                baseline_desc=window,
                policy_desc=policy,
                drilldown_url=f"grafana://metrics?query={m_name}&orgId=1&from=now-1h",
                weakens_hypothesis=weakens
            ))

        # 2. Deployment
        if context.get("recent_deploy"):
            ts = context.get("deploy_timestamp", "Unknown")
            metadata = context.get("deploy_metadata", {})
            
            if metadata.get("is_config_change"):
                # Config change deployment: SUPPORTS deploy-regression hypothesis
                change_type = metadata.get('change_type', 'configuration')
                content = f"Deployment with {change_type} changes detected"
                category = "SUPPORT"
                policy = f"Change risk assessment: {change_type} modification"
            else:
                content = "Deployment activity detected (binary release)"
                category = "CONTEXT"
                policy = "Environmental change monitoring"

            evidence_graph.append(EvidenceItem(
                evidence_id="EVENT-DEPLOY-RECENT",
                category=category,
                signal_name="deployment",
                content=content,
                observed_at=get_time_str(ts),
                policy_desc=policy,
                drilldown_url="spinnaker://deploys/recent?diff=true"
            ))

        # 3. Logs
        log_raw = triage_result.get("log_raw", "")
        log_raw_lower = log_raw.lower()
        persistence = triage_result.get("Triage Results", {}).get("Persistence", {})
        tmpl_id = triage_result.get("Extracted Metadata", {}).get("Template ID", "UNKNOWN")
        affected = triage_result.get("Triage Results", {}).get("Affected Service", "Unknown")
        
        # Entity detection
        subject = "Service connection"
        if any(x in log_raw_lower for x in ["jdbc", "pool", "sql", "db", "database"]):
            subject = "Internal DB connection"
        elif any(x in log_raw_lower for x in ["api", "http", "url", "outbound"]):
            subject = "Outbound API connection"

        count = persistence.get("count", 1)
        first_seen = get_time_str(persistence.get("first_seen", incident_time))
        
        evidence_graph.append(EvidenceItem(
            evidence_id=f"LOG-{tmpl_id}",
            category="SUPPORT",
            signal_name="error_log",
            content=f"{subject} failure: '{log_raw[:50]}...'",
            observed_at=get_time_str(incident_time),
            policy_desc="Error signal threshold monitoring",
            drilldown_url=f"kibana://logs/viewer?template_id={tmpl_id}&time=now-15m",
            aggregation_info={
                "count": count,
                "first_seen": first_seen,
                "impact_service": affected
            }
        ))

        return evidence_graph

    def _infer_weakened_hypothesis(self, metric_name, top_hypotheses):
        """Determines which specific hypothesis a healthy metric weakens."""
        if not top_hypotheses:
            return None
        
        weakness_map = {
            "cpu": ["Database Connection Pool Exhaustion", "Infrastructure Gray Failure"],
            "memory": ["Java Heap OutOfMemory"],
            "io": ["Infrastructure Gray Failure"],
            "disk": ["Infrastructure Gray Failure"],
        }
        
        for keyword, candidate_names in weakness_map.items():
            if keyword in metric_name.lower():
                for h in top_hypotheses:
                    if h.get("hypothesis") in candidate_names:
                        return h["hypothesis"]
                # Fallback: generic weakening description
                return f"Resource-based hypotheses (normal {keyword})"
        return None

class PersonaRenderer:
    """v3.1 Causal Audit Rendering with strict formatting."""
    def render_executive(self, data):
        status_emoji = "🔴" if "P1" in data['severity'] or "P2" in data['severity'] else "🟡"
        return f"""# Incident Executive Summary
**Status**: {status_emoji} {data['hitl_status']}
**Priority**: {data['severity']}

## Impact Profile
- **Service**: {data['service']}
- **User Experience**: {data['impact']}
- **Confirmed At**: {data['analyzed_at']}

## Resolution Summary
- **Leading Hypothesis**: {data['root_cause']}
- **Action**: Recovery trigger `{data['workflow'].get('trigger_id', 'N/A')}` is **{data['hitl_status']}**.
"""

    def render_sre(self, data):
        # 1. Hypothesis Separation Analysis
        top_1 = data['top_hypotheses'][0]
        top_2 = data['top_hypotheses'][1] if len(data['top_hypotheses']) > 1 else None
        
        gap = (top_1['total_confidence'] - top_2['total_confidence']) if top_2 else 1.0
        gap_pts = int(gap * 100)
        if gap > 0.30:
            gap_desc = "Clear (Leading candidate is well-separated)"
        elif gap > 0.15:
            gap_desc = "Moderate (Consider alternative before acting)"
        else:
            gap_desc = "Ambiguous (Competing candidates — manual triage required)"

        hypo_rows = []
        for i, h in enumerate(data['top_hypotheses'], 1):
            conf = self._get_qualitative_confidence(h.get("total_confidence", 0))
            score = int(h.get("total_confidence", 0) * 100)
            marker = " ← Leading" if i == 1 else ""
            hypo_rows.append(f"{i}. **{h['hypothesis']}** — {conf} (Score: {score}/100){marker}")
        
        ranking_section = "\n".join(hypo_rows)

        # 2. Grouped Evidence with consistent formatting
        support_items = [item for item in data['timeline'] if item.category == "SUPPORT"]
        weaken_items = [item for item in data['timeline'] if item.category == "WEAKEN"]
        context_items = [item for item in data['timeline'] if item.category == "CONTEXT"]

        support_section = "\n".join([self._fmt_item(i) for i in support_items]) or "No direct supportive evidence."
        
        if weaken_items:
            weaken_section = "\n".join([self._fmt_item(i) for i in weaken_items])
        else:
            weaken_section = "No weakening signals detected. Leading hypothesis is unchallenged."
        
        context_section = "\n".join([self._fmt_item(i) for i in context_items]) or "No additional context."

        # 3. Guardrails
        guardline = ""
        is_blocked = (len(weaken_items) > 0) or (gap <= 0.15)
        if is_blocked:
            reasons = []
            if weaken_items:
                reasons.append(f"{len(weaken_items)} unresolved weakening signal(s)")
            if gap <= 0.15:
                reasons.append(f"hypothesis separation is only {gap_pts} points (threshold: 15)")
            reason_str = " and ".join(reasons)
            guardline = f"""
> [!CAUTION]
> **GUARDRAIL ALERT**: Automatic remediation is BLOCKED.
> Reason: {reason_str}.
> Required: Manual blast radius assessment before executing `{data['workflow'].get('trigger_id', 'N/A')}`.
"""

        return f"""# 🛠️ SRE Technical Briefing (Causal Audit)
**Incident**: {data['incident_id']} | **Analyzed At**: {data['analyzed_at']}

## 📊 Hypothesis Ranking
**Separation**: {gap_pts} points — {gap_desc}
{ranking_section}

## 🎯 Core Supportive Evidence
{support_section}

## ⚖️ Conflicting / Weakening Signals
{weaken_section}

## 🌐 Contextual Signals
{context_section}

## ⚡ Recovery Plan & Guardrails
- **Recovery Trigger**: `{data['workflow'].get('trigger_id', 'N/A')}`
- **Approval Required**: {is_blocked or data['workflow'].get('approval_required', True)}
- **Evidence Base**: {len(data['timeline'])} signals analyzed.
{guardline}

---
*Decision Support Layer (v3.1 - Causal Audit)*
"""

    def _fmt_item(self, item):
        """Consistent evidence rendering for all tiers."""
        row = f"[{item.observed_at}] **{item.content}**"
        
        # Log aggregation metadata
        if item.aggregation_info and item.aggregation_info.get("count", 0) > 1:
            agg = item.aggregation_info
            row += f"\n   - *Occurrences*: {agg['count']}x | First seen: {agg.get('first_seen', 'N/A')} | Service: {agg.get('impact_service', 'N/A')}"
        
        # Weakening target
        if item.weakens_hypothesis:
            row += f"\n   - *Impact*: Weakens **{item.weakens_hypothesis}** (signal is within normal range)"
        
        # Consistent fields
        row += f"\n   - *Baseline*: {item.baseline_desc} | *Policy*: {item.policy_desc}"
        row += f"\n   - *Drilldown*: [{item.evidence_id}]({item.drilldown_url})"
        return row

    def _get_qualitative_confidence(self, score):
        if score >= 0.85: return "High"
        if score >= 0.65: return "Medium"
        return "Low"

class ExecutiveSummaryEngine:
    def __init__(self):
        self.normalizer = EvidenceNormalizer()
        self.renderer = PersonaRenderer()

    def generate(self, triage_report, rca_report, external_context=None, persona="SRE"):
        ctx = external_context or {}
        rca = rca_report.get("root_cause_analysis", {})
        top_hypotheses = rca.get("top_hypotheses", [])
        
        # Pass hypotheses into normalizer so it can do hypothesis-aware categorization
        evidence_graph = self.normalizer.normalize(triage_report, ctx, top_hypotheses)
        
        data = {
            "incident_id": triage_report.get("Extracted Metadata", {}).get("Template ID", "N/A"),
            "service": triage_report.get("Triage Results", {}).get("Affected Service", "Unknown"),
            "severity": triage_report.get("Triage Results", {}).get("Severity Level", "N/A"),
            "impact": triage_report.get("Triage Results", {}).get("User Impact", "N/A"),
            "root_cause": top_hypotheses[0].get("hypothesis", "Under Investigation") if top_hypotheses else "N/A",
            "top_hypotheses": top_hypotheses,
            "hitl_status": rca.get("hitl_status", "Checking"),
            "workflow": top_hypotheses[0].get("recovery_workflow", {}) if top_hypotheses else {},
            "timeline": evidence_graph,
            "analyzed_at": rca.get("analyzed_at", "N/A")
        }

        if persona == "Executive":
            return self.renderer.render_executive(data)
        return self.renderer.render_sre(data)
