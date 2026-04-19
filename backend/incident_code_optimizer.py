import json
import re

class CodeOptimizationEngine:
    """Feature 6: AI Driven Code Optimization Engine.
       Handles pattern recognition, delta performance calculation, and refactoring generation.
    """

    ANTI_PATTERNS = {
        "N+1 Query": {
            "description": "Executing DB queries inside a loop instead of batch loading.",
            "formula": "T_current = (N * RTT) + (N * Q_time), T_optimized = (1 * RTT) + (Batch_Q_time)",
            "log_signals": ["repeated query", "n+1", "connection pool wait"]
        },
        "Memory Leak": {
            "description": "Resources (DB connections, Streams, Cache) not being closed/released.",
            "formula": "Risk_current = High (OOM), Risk_optimized = Low (Lifecycle managed)",
            "log_signals": ["memory leak", "oom", "unclosed connection"]
        },
        "Heavy Computing": {
            "description": "Inefficient algorithm with high complexity ($O(n^2)$ or higher).",
            "formula": "T_current = O(n^2), T_optimized = O(n log n)",
            "log_signals": ["slow response", "cpu spike", "expensive calculation"]
        }
    }

    def analyze(self, rca_result, triage_result, metrics_context):
        """Analyzes RCA and logs to prescribe code optimizations."""
        top_h = rca_result.get("root_cause_analysis", {}).get("top_hypotheses", [])
        if not top_h:
             return None

        # 1. Identification (Context Mapping)
        h_title = top_h[0].get("hypothesis", "")
        log_content = triage_result.get("Context Metadata", {}).get("Log Template", "").lower()
        log_raw = triage_result.get("log_raw", "").lower() or log_content

        # Determine Anti-Pattern
        pattern_type = "Generic Inefficiency"
        if any(x in log_raw for x in ["sql", "query", "queries", "n+1", "select"]):
            pattern_type = "N+1 Query"
        elif any(x in log_raw for x in ["memory", "oom", "heap", "leak"]):
            pattern_type = "Memory Leak"
        elif any(x in log_raw for x in ["heavy", "slow", "complexity", "algorithm"]):
            pattern_type = "Heavy Computing"

        pattern_meta = self.ANTI_PATTERNS.get(pattern_type, {})
        
        # 2. Delta Calculation (The Brain)
        # Try to find N in the log if persistence count is low
        persistence_count = triage_result.get("Triage Results", {}).get("Persistence", {}).get("count", 1)
        n_count = persistence_count
        if n_count <= 1:
            match = re.search(r'(\d+)\s+(?:repeated|queries|times|calls)', log_raw)
            if match:
                n_count = int(match.group(1))
            else:
                n_count = 100 # Default assumption for N+1 if detected
        performance_report = self._calculate_delta(pattern_type, n_count, metrics_context)

        # 3. Refactoring Recommendation
        refactoring = self._generate_refactor(pattern_type, triage_result)

        return {
            "target_location": refactoring["location"],
            "issue_type": pattern_type,
            "description": pattern_meta.get("description", "Code requires optimization."),
            "refactoring_suggestion": refactoring["code"],
            "performance_delta": performance_report
        }

    def _calculate_delta(self, pattern_type, n, context):
        """Mathematical estimation of improvement."""
        # Use baseline metrics if available
        metrics = context.get("metrics_data", {})
        curr_latency = metrics.get("upstream.latency", {}).get("current", 1250)
        
        if pattern_type == "N+1 Query":
            # Current: N roundtrips
            # Optimized: 1 batch roundtrip (~20% of current if N is large)
            est_latency = curr_latency * (0.2 + (0.8 / n)) if n > 0 else curr_latency * 0.2
            est_latency = max(min(est_latency, curr_latency * 0.5), 200) # Ensure it's better than current
            
            improvement = ((curr_latency - est_latency) / curr_latency) * 100
            
            return {
                "metric": "Average Response Time",
                "current": f"{curr_latency}ms",
                "estimated": f"{int(est_latency)}ms",
                "impact": f"{improvement:.1f}% reduction",
                "other_metrics": [
                    {"name": "DB Queries", "before": f"{n+1}", "after": "2", "gain": f"{int((1 - 2/(n+1))*100)}%"},
                    {"name": "CPU Usage", "before": "45%", "after": "12%", "gain": "33%p"}
                ]
            }
        
        # Fallback default
        return {
            "metric": "Execution Efficiency",
            "current": "Low",
            "estimated": "High",
            "impact": "Significant"
        }

    def _generate_refactor(self, pattern_type, triage):
        """Generates the code fix suggestion."""
        service = triage.get("Triage Results", {}).get("Affected Service", "UnknownService")
        # CamelCase naming convention
        class_name = "".join(x.capitalize() for x in service.lower().replace("-", " ").split())
        
        if pattern_type == "N+1 Query":
            return {
                "location": f"{class_name}Service.java -> getDetails()",
                "code": f"// Optimized with Eager Loading (JOIN/IN clause)\nList<Entity> results = repository.findAllByIdIn(ids);"
            }
        
        return {
            "location": f"{class_name}Handler.java",
            "code": "// Refactor following best practices for performance."
        }
