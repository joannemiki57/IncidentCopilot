import json
from datetime import datetime
from incident_code_optimizer import CodeOptimizationEngine

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
        incident_time = triage_result.get("Context Metadata", {}).get("Standard ISO Time", "Unknown")
        
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
            ratio = current / baseline if isinstance(baseline, (int, float)) and baseline > 0 else None
            
            signal_human = m_name.replace('_', ' ').replace('.', ' ').title()
            
            if limit and current >= limit:
                content = f"{signal_human} exceeded configured limit ({current}/{limit})"
                category = "SUPPORT"
                weakens = None
            elif ratio is None:
                content = f"{signal_human} baseline unavailable"
                category = "CONTEXT"
                weakens = None
            elif 0.8 <= ratio <= 1.2:
                content = f"{signal_human} remained near baseline ({ratio:.1f}x)"
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
                delta_ratio=ratio if ratio is not None else 0.0,
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
        log_raw = (triage_result.get("log_raw") or "").strip()
        log_raw_lower = log_raw.lower()
        persistence = triage_result.get("Triage Results", {}).get("Persistence", {})
        tmpl_id = triage_result.get("Context Metadata", {}).get("Template ID", "UNKNOWN")
        affected = triage_result.get("Triage Results", {}).get("Affected Service", "Unknown")
        
        if log_raw:
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
    """v3.1 Causal Audit Rendering with strict formatting and business timeline."""
    
    ACTION_ITEM_MAP = {
        "Database": [
            "Scale up DB connection pool wait-timeout settings",
            "Audit slow queries during partition windows",
            "Implement circuit breaker for DB intensive services"
        ],
        "Network": [
            "Review BGP/VPC routing table for gray failure isolation",
            "Increase HTTP client retries with exponential backoff",
            "Review network adapter firmware/driver consistency"
        ],
        "Deploy": [
            "Add Canary stage with automated metric rollback",
            "Enforce config-change validation in pre-deploy CI",
            "Integrate deployment markers with Grafana dashboards"
        ],
        "Hardware": [
            "Schedule proactive node decommissioning for R20-M0 cluster",
            "Increase memory ECC error threshold alerts",
            "Audit power supply stability for specific rack units"
        ]
    }

    REVENUE_WEIGHTS = {
        "payment": 500, # $500/min
        "checkout": 300,
        "order": 200,
        "gateway": 150,
        "auth": 100
    }

    def render_executive(self, data):
        # Emoji Optimization: Use Blue for Automated success to avoid panic
        is_auto = "AUTO-EXECUTED" in data['hitl_status'] or "AUTO-RECOVERING" in data['hitl_status']
        if is_auto:
            status_emoji = "🔵" 
        else:
            status_emoji = "🔴" if "P1" in data['severity'] or "P2" in data['severity'] else "🟡"
            
        trigger_id = data['workflow'].get('trigger_id', 'N/A')
        mttr = self._estimate_mttr(trigger_id)
        
        # Consistent Timeline: Base next update on analyzed_at
        next_update = self._get_next_update_time(data['analyzed_at'])
        
        # Business Impact: Revenue Loss
        revenue_loss = self._estimate_revenue_impact(data['service'], mttr)

        return f"""# Incident Executive Summary
**Status**: {status_emoji} {data['hitl_status']}
**Priority**: {data['severity']}

## Impact Profile
- **Service**: {data['service']}
- **User Experience**: {data['impact']}
- **Confirmed At**: {data['analyzed_at']}
- **Estimated Revenue Impact**: {revenue_loss}

## Timeline & Communication
- **Estimated Recovery (MTTR)**: ~{mttr} mins
- **Next Status Update**: {next_update} (Expected in 30m)

## Resolution Summary
- **Leading Hypothesis**: {data['root_cause']}
- **Action**: Recovery trigger `{trigger_id}` is **{data['hitl_status']}**.
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
            qual = "High" if h.get("total_confidence", 0) >= 0.85 else "Medium" if h.get("total_confidence", 0) >= 0.65 else "Low"
            score = int(h.get("total_confidence", 0) * 100)
            marker = " ← Leading" if i == 1 else ""
            hypo_rows.append(f"{i}. **{h['hypothesis']}** — {qual} (Score: {score}/100){marker}")
        
        ranking_section = "\n".join(hypo_rows)

        # 2. Grouped Evidence
        support_items = [item for item in data['timeline'] if item.category == "SUPPORT"]
        weaken_items = [item for item in data['timeline'] if item.category == "WEAKEN"]
        context_items = [item for item in data['timeline'] if item.category == "CONTEXT"]

        support_section = "\n".join([self._fmt_item(i) for i in support_items]) or "No direct supportive evidence."
        weaken_section = "\n".join([self._fmt_item(i) for i in weaken_items]) if weaken_items else "No weakening signals detected."
        
        # 3. Guardrails
        is_blocked = (len(weaken_items) > 0) or (gap <= 0.15)
        guardline = ""
        if is_blocked:
            reasons = []
            if weaken_items: reasons.append(f"{len(weaken_items)} weakening signal(s)")
            if gap <= 0.15: reasons.append(f"separation is only {gap_pts} pts")
            guardline = f"\n> [!CAUTION]\n> **GUARDRAIL ALERT**: Auto-remediation BLOCKED due to {', '.join(reasons)}.\n"

        # 4. Action Items (Postmortem Starter)
        action_items = self._derive_action_items(data['root_cause'])
        
        # Feature 6 Integration: Optimization Note
        optimization_note = ""
        if data.get("optimization_brief"):
            opt = data["optimization_brief"]
            optimization_note = f"\n> [!TIP]\n> **AI OPTIMIZATION**: {opt['issue_type']} detected in `{opt['target_location']}`. Already registered in optimization backlog.\n"

        action_section = "\n".join([f"- [ ] {item}" for item in action_items])

        # 5. AI Code Optimization Briefing (Feature 6)
        optimization_section = ""
        if data.get("optimization_brief"):
            opt = data["optimization_brief"]
            delta = opt["performance_delta"]
            other_m = "\n".join([f"- {m['name']}: {m['before']} → {m['after']} ({m['gain']} gain)" for m in delta.get("other_metrics", [])])
            
            optimization_section = f"""
## 🧠 AI Code Optimization Briefing
- **Target**: `{opt['target_location']}`
- **Pattern**: {opt['issue_type']} - {opt['description']}

### 📈 Predicted Performance Impact
| Metric | Current | Estimated | Impact |
| :--- | :--- | :--- | :--- |
| {delta['metric']} | {delta['current']} | {delta['estimated']} | {delta['impact']} |

**Secondary Improvements**:
{other_m}

### 💻 Refactoring Suggestion
```java
{opt['refactoring_suggestion']}
```
"""

        report = f"""# 🛠️ SRE Technical Briefing (Causal Audit)
**Incident**: {data['incident_id']} | **Analyzed At**: {data['analyzed_at']}

{guardline}{optimization_note}
## 📊 Hypothesis Ranking
**Separation**: {gap_pts} points — {gap_desc}
{ranking_section}

## 🎯 Core Supportive Evidence
{support_section}

## ⚖️ Conflicting / Weakening Signals
{weaken_section}

## ⚡ Recovery Plan & Guardrails
- **Recovery Trigger**: `{data['workflow'].get('trigger_id', 'N/A')}`
- **Approval Required**: {is_blocked or data['workflow'].get('approval_required', True)}

{optimization_section}

## 🧠 Proposed Postmortem Action Items (Draft)
{action_section}

---
*Decision Support Layer (v3.1 - Causal Audit)*
"""
        return report

    def _estimate_mttr(self, trigger_id):
        if "RESTART" in trigger_id: return 5
        if "FAILOVER" in trigger_id or "SWITCH" in trigger_id: return 10
        if "ROLLBACK" in trigger_id: return 15
        return 20

    def _get_next_update_time(self, base_time_str):
        # Fix: Parse base_time_str if available, otherwise use now
        from datetime import datetime, timedelta
        try:
            # Handle various ISO formats
            clean_ts = base_time_str.split(".")[0].replace("Z", "")
            base_dt = datetime.strptime(clean_ts, "%Y-%m-%dT%H:%M:%S")
        except:
            base_dt = datetime.now()
        
        return (base_dt + timedelta(minutes=30)).strftime("%H:%M:%S UTC")

    def _estimate_revenue_impact(self, service, duration_mins):
        weight = 50 # Default $50/min
        for key, val in self.REVENUE_WEIGHTS.items():
            if key.lower() in service.lower():
                weight = val
                break
        total = weight * duration_mins
        return f"${total:,} (Estimated for {duration_mins}m outage)"

    def _derive_action_items(self, root_cause):
        for key, items in self.ACTION_ITEM_MAP.items():
            if key.lower() in root_cause.lower():
                return items
        return ["Conduct deep-dive log analysis", "Review service instrumentation", "Update SRE runbook"]

    def _fmt_item(self, item):
        row = f"[{item.observed_at}] **{item.content}**"
        if item.aggregation_info and item.aggregation_info.get("count", 0) > 1:
            agg = item.aggregation_info
            row += f"\n   - *Occurrences*: {agg['count']}x | Service: {agg.get('impact_service', 'N/A')}"
        if item.weakens_hypothesis:
            row += f"\n   - *Impact*: Weakens **{item.weakens_hypothesis}**"
        row += f"\n   - *Baseline*: {item.baseline_desc} | *Drilldown*: [{item.evidence_id}]({item.drilldown_url})"
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
        
        # Feature 6: AI Code Optimization
        opt_brief = None
        if persona == "SRE" or True: # Generate anyway for reporting
            optimizer = CodeOptimizationEngine()
            opt_brief = optimizer.analyze(rca_report, triage_report, ctx)

        # Pass hypotheses into normalizer so it can do hypothesis-aware categorization
        evidence_graph = self.normalizer.normalize(triage_report, ctx, top_hypotheses)

        data = {
            "incident_id": triage_report.get("Context Metadata", {}).get("Template ID", "N/A"),
            "service": triage_report.get("Triage Results", {}).get("Affected Service", "Unknown"),
            "severity": triage_report.get("Triage Results", {}).get("Severity Level", "N/A"),
            "impact": triage_report.get("Triage Results", {}).get("User Impact", "N/A"),
            "root_cause": top_hypotheses[0].get("hypothesis", "Under Investigation") if top_hypotheses else "N/A",
            "top_hypotheses": top_hypotheses,
            "hitl_status": rca.get("hitl_status", "Checking"),
            "workflow": top_hypotheses[0].get("recovery_workflow", {}) if top_hypotheses else {},
            "timeline": evidence_graph,
            "analyzed_at": rca.get("analyzed_at", "N/A"),
            "optimization_brief": opt_brief
        }

        if persona == "Executive":
            return self.renderer.render_executive(data)
        return self.renderer.render_sre(data)
