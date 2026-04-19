import json
import hashlib
import re
from datetime import datetime
import time
import os
from collections import Counter

def parse_timestamp(log_message: str):
    """
    Extracts and standardizes the timestamp.
    Returns: (timestamp_raw, timestamp_iso, epoch_float)
    """
    timestamp_str = None
    standardized = None
    epoch = 0.0
    
    # Format 1: 2026-04-18 10:15:30
    match1 = re.search(r'\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}', log_message)
    if match1:
        timestamp_str = match1.group(0)
        standardized = timestamp_str.replace(" ", "T")
        try:
            dt = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
            epoch = dt.timestamp()
        except: pass
        return timestamp_str, standardized, epoch
    
    # Format 2 (BGL Format): 2005-06-03-15.42.50.363779
    match_bgl = re.search(r'(\d{4}-\d{2}-\d{2})-(\d{2})\.(\d{2})\.(\d{2})\.(\d+)', log_message)
    if match_bgl:
        timestamp_str = match_bgl.group(0)
        standardized = f"{match_bgl.group(1)}T{match_bgl.group(2)}:{match_bgl.group(3)}:{match_bgl.group(4)}"
        try:
            # Add microsecond parsing for BGL
            dt = datetime.strptime(standardized + "." + match_bgl.group(5), "%Y-%m-%dT%H:%M:%S.%f")
            epoch = dt.timestamp()
        except: pass
        return timestamp_str, standardized, epoch

    # Format 3: [Thu Apr 18 11:20:10 2026]
    match2 = re.search(r'\[([A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\s\d{2}:\d{2}:\d{2}\s\d{4})\]', log_message)
    if match2:
        timestamp_str = match2.group(0)
        inner_str = match2.group(1)
        try:
            dt = datetime.strptime(inner_str, "%a %b %d %H:%M:%S %Y")
            standardized = dt.strftime("%Y-%m-%dT%H:%M:%S")
            epoch = dt.timestamp()
        except ValueError:
            pass
        return timestamp_str, standardized, epoch

    # Format 4 (Thunderbird Format/Syslog): Nov 9 12:01:01
    match3 = re.search(r'[A-Za-z]{3}\s+\d{1,2}\s\d{2}:\d{2}:\d{2}', log_message)
    if match3:
        timestamp_str = match3.group(0)
        year_match = re.search(r'(\d{4})\.\d{2}\.\d{2}', log_message)
        year = year_match.group(1) if year_match else "2026"
        try:
            normalized_ts = re.sub(r'\s+', ' ', timestamp_str)
            dt = datetime.strptime(f"{year} {normalized_ts}", "%Y %b %d %H:%M:%S")
            standardized = dt.strftime("%Y-%m-%dT%H:%M:%S")
            epoch = dt.timestamp()
        except ValueError:
            pass
        return timestamp_str, standardized, epoch

    return "", "Unknown", 0.0

def to_epoch(ts_str: str) -> float:
    """Helper to convert various CSV timestamp formats to epoch float."""
    if not ts_str or ts_str == "Unknown": return 0.0
    # Try common formats found in loghub CSVs
    formats = [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d-%H.%M.%S.%f",
        "%H:%M:%S", # HDFS Time only
        "%Y.%m.%d", # HDFS Date only
        "%Y.%m.%d-%H.%M.%S.%f",
    ]
    # For HDFS (Time only), it won't be accurate for day rollover, but good for delta
    for fmt in formats:
        try:
            dt = datetime.strptime(ts_str, fmt)
            # If only time is provided, use a base date to get a valid timestamp
            if fmt == "%H:%M:%S":
                return dt.hour * 3600 + dt.minute * 60 + dt.second
            return dt.timestamp()
        except: continue
    return 0.0

class PersistenceTracker:
    """Tracks the lifetime of error incidents based on Template IDs."""
    def __init__(self, persistence_threshold=300, session_timeout=1800):
        self.active_incidents = {} # {template_id: {first_seen, last_seen, count}}
        self.threshold = persistence_threshold
        self.timeout = session_timeout

    def track(self, template_id, current_epoch):
        if not template_id or current_epoch == 0.0:
            return {"duration": 0, "count": 1, "state": "Transient"}

        if template_id in self.active_incidents:
            incident = self.active_incidents[template_id]
            # Check for session timeout (reset if gap is too large)
            if current_epoch - incident["last_seen"] > self.timeout:
                self.active_incidents[template_id] = {
                    "first_seen": current_epoch,
                    "last_seen": current_epoch,
                    "count": 1
                }
            else:
                incident["last_seen"] = current_epoch
                incident["count"] += 1
        else:
            self.active_incidents[template_id] = {
                "first_seen": current_epoch,
                "last_seen": current_epoch,
                "count": 1
            }

        incident = self.active_incidents[template_id]
        duration = incident["last_seen"] - incident["first_seen"]
        
        state = "Starting" if incident["count"] == 1 else "Ongoing"
        if duration >= self.threshold:
            state = "Persistent"
            
        return {
            "duration": round(duration, 2),
            "count": incident["count"],
            "state": state
        }

def extract_metrics(log_message: str) -> list:
    """
    Extracts performance metrics (numbers paired with units like ms, %, MB) from the log.
    These are treated as structured 'Metric' rather than plain numbers to be masked.
    (e.g., '500ms' -> {"value": 500, "unit": "ms"})
    """
    # Supported metric units — order matters: longer units must come first to avoid partial match
    unit_pattern = r'(\d+(?:\.\d+)?)\s*(ms|MB|GB|KB|%|\bs\b)'
    matches = re.findall(unit_pattern, log_message, re.IGNORECASE)
    metrics = []
    for value_str, unit in matches:
        metrics.append({"value": float(value_str), "unit": unit.lower()})
    return metrics

def extract_metadata(log_message: str):
    """
    Extracts indicators like IPs, ports, predefined component keywords,
    and structured performance metrics.
    """
    # Extract IP Addresses
    ips = re.findall(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', log_message)
    
    # Extract Ports safely
    ports = re.findall(r'port\s(\d+)', log_message.lower())

    identifiers = {}
    if ips:
        identifiers["ip_addresses"] = ips
    if ports:
        identifiers["ports"] = ports
        
    # Identifiers common to HDFS, BGL, Thunderbird
    if "connection pool" in log_message.lower():
        identifiers["component"] = "connection pool"
    if "dfs.DataNode" in log_message:
        identifiers["component"] = "dfs.DataNode"
    if "RAS KERNEL" in log_message:
        identifiers["component"] = "RAS KERNEL"
    if "ganglia" in log_message.lower():
        identifiers["component"] = "ganglia datasource"

    # Extract structured performance metrics (e.g., 500ms, 80%, 2GB)
    metrics = extract_metrics(log_message)
    if metrics:
        identifiers["metrics"] = metrics

    return identifiers

def template_log(log_message: str, timestamp_str: str):
    """
    Replaces variable components (timestamp, IPs, numbers) with {*} or {IP} template tokens.
    Also generates a SHA-256 hash of the resulting template for frequency-based anomaly detection.
    Returns a tuple: (template_string, template_hash)
    """
    template = log_message
    if timestamp_str:
        # Remove timestamp entirely from the log message template
        template = template.replace(timestamp_str, "").strip()

    # Step 1: Mask metric values (e.g., 500ms -> {*}ms) BEFORE general number masking
    # so the unit remains visible in the template
    template = re.sub(r'\d+(?:\.\d+)?(?=\s*(?:ms|MB|GB|KB|%|\bs\b))', '{*}', template, flags=re.IGNORECASE)

    # Step 2: Mask IPs
    template = re.sub(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', '{IP}', template)

    # Step 3: Mask remaining pure numbers
    template = re.sub(r'(?<!\d|\.)\b\d+\b(?!\.\d)', '{*}', template)
    
    # Step 4: Optional cleanup for empty brackets
    template = re.sub(r'\[\]', '', template).strip()

    # Step 5: Generate a stable SHA-256 hash for this template pattern
    # This hash is the key for frequency-based anomaly detection:
    # if the same hash appears 10x more than usual, it signals a spike.
    template_hash = hashlib.sha256(template.encode('utf-8')).hexdigest()[:12]

    return template, template_hash


# ── Triage Engine Configuration ─────────────────────────────────────────────
# Each category has:
#   - "default_severity": the P-level this category maps to when it's primary
#   - "signals": list of (keyword_or_regex, score, is_regex) tuples
#       is_regex=True  → matched with re.search (word-boundary safe)
#       is_regex=False → matched with plain substring (for multi-word phrases)
#
# FIX #1 (Rule-Judgment Separation):
#   Severity is now derived FROM the category's default_severity,
#   NOT from a separate hardcoded keyword list.
#
# FIX #2 (Substring False Positives):
#   Single-word keywords use \b word boundaries via regex to avoid
#   matching paths like /var/log/fatal_handler/.

CATEGORY_CONFIG: dict[str, dict] = {
    "Resource_Exhaustion": {
        "default_severity": "P1 (Critical)",
        "signals": [
            ("connection pool", 0.95, False), ("exhausted", 0.95, True),
            ("out of memory", 0.95, False), (r"\boom\b", 0.90, True),
            ("cpu full", 0.88, False), ("memory full", 0.88, False),
        ],
    },
    "Hardware_Error": {
        "default_severity": "P2 (High)",
        "signals": [
            ("parity error", 0.90, False), ("machine check", 0.90, False),
            ("hardware failure", 0.90, False), ("uncorrectable", 0.88, True),
            (r"\becc\b", 0.80, True), (r"\bdimm\b", 0.80, True),
        ],
    },
    "Database_Error": {
        "default_severity": "P2 (High)",
        "signals": [
            ("connection limit", 0.92, False), ("deadlock", 0.92, True),
            ("max connections", 0.90, False), ("db error", 0.88, False),
            ("sql error", 0.85, False),
        ],
    },
    "Service_Down": {
        "default_severity": "P1 (Critical)",
        "signals": [
            ("service down", 0.95, False), ("unavailable", 0.90, True),
            (r"\b503\b", 0.88, True), ("service unavailable", 0.92, False),
        ],
    },
    "Network_Error": {
        "default_severity": "P2 (High)",
        "signals": [
            ("connection refused", 0.90, False), (r"\btimeout\b", 0.85, True),
            ("timed out", 0.85, False), (r"\brefused\b", 0.82, True),
            ("packet loss", 0.88, False), (r"\bunreachable\b", 0.88, True),
            (r"\bdeferred\b", 0.80, True), ("handshake failed", 0.88, False), 
            ("expired", 0.85, True),
        ],
    },
    "Traffic_Spike": {
        "default_severity": "P2 (High)",
        "signals": [
            (r"\bretry\b", 0.80, True), (r"\bstorm\b", 0.88, True),
            (r"\bflood\b", 0.85, True), (r"\bspike\b", 0.82, True),
            (r"\boverload\b", 0.85, True), ("too many requests", 0.90, False),
        ],
    },
    "Software_Glitch": {
        "default_severity": "P2 (High)",
        "signals": [
            (r"\bsegfault\b", 0.90, True), (r"\bzombie\b", 0.85, True),
            ("process killed", 0.88, False), (r"\bexception\b", 0.80, True),
            ("core dump", 0.90, False), ("null pointer", 0.88, False),
        ],
    },
    "Authentication_Failure": {
        "default_severity": "P2 (High)",
        "signals": [
            ("invalid user", 0.98, False), ("authentication failure", 0.98, False),
            (r"\bpassword\b", 0.85, True), (r"\bunauthorized\b", 0.92, True),
        ],
    },
    "Performance_Degradation": {
        "default_severity": "P3 (Medium)",
        "signals": [
            (r"\bslow\b", 0.70, True), (r"\blatency\b", 0.75, True),
            (r"\bdegraded\b", 0.80, True),
        ],
    },
    "Network/Config_Warning": {
        "default_severity": "P3 (Medium)",
        "signals": [
            ("not answer", 0.85, False), ("no free leases", 0.85, False),
            ("unknown lease", 0.80, False), ("unable to qualify", 0.75, False),
        ],
    },
    "System_Info/Routine": {
        "default_severity": "P4 (Low)",
        "signals": [
            ("synchronized to", 0.90, False), ("no topology change", 0.90, False),
            ("no configuration change", 0.90, False), ("session opened", 0.85, False),
            ("session closed", 0.85, False),
        ],
    },
    "System_Info": {
        "default_severity": "P4 (Low)",
        "signals": [
            (r"\binfo\b", 0.60, True),
        ],
    },
}

# Compound scenario: if BOTH primary AND secondary categories are detected,
# escalate to the given severity and attach a causal scenario label.
COMPOUND_SCENARIOS: list[tuple[set, set, str, str]] = [
    ({"Resource_Exhaustion"}, {"Network_Error"},
     "Scenario 1: Resource Exhaustion → Network Failure "
     "(CPU/Memory full ⇒ packets dropped ⇒ timeout)", "P1 (Critical)"),

    ({"Database_Error"}, {"Service_Down"},
     "Scenario 2: DB Bottleneck → Service Denial "
     "(DB connections exhausted ⇒ WAS cannot accept requests ⇒ system-wide outage)", "P1 (Critical)"),

    ({"Hardware_Error"}, {"Software_Glitch"},
     "Scenario 3: Zombie Process → System Shutdown "
     "(HW node fault ⇒ abnormal process termination ⇒ cascading load)", "P1 (Critical)"),

    ({"Network_Error"}, {"Traffic_Spike"},
     "Scenario 4: Retry Storm "
     "(transient network delay ⇒ client retries flood ⇒ server overwhelmed)", "P1 (Critical)"),
]

# ── FIX #3 (Context Blindness): Negation Guard ──────────────────────────────
# If a keyword match is preceded by a negation phrase, that match is suppressed.
NEGATION_PATTERNS = re.compile(
    r'(?:^|[\s;,])'           # start of string or whitespace/delimiter
    r'(?:no|not|none|never|'  # negation words
    r'without|0 out of|'      # contextual negators
    r'no longer|'             # additional negation phrase
    r'corrected|recovered|resolved)'  # resolution indicators
    r'\s+',                   # gap
    re.IGNORECASE
)

def _is_negated(log_lower: str, keyword: str) -> bool:
    """
    Check if a keyword's occurrence is preceded by a negation phrase.
    If so, the match should be suppressed (the error was resolved/absent).
    e.g., "error corrected" → True (negated), "fatal error" → False
    """
    idx = log_lower.find(keyword.lower().replace(r'\b', ''))
    if idx < 0:
        return False
    # Check the 30-char window before the keyword for negation context
    window_start = max(0, idx - 30)
    preceding = log_lower[window_start:idx]
    if NEGATION_PATTERNS.search(preceding):
        return True
    # Also check for trailing "corrected", "resolved" within 20 chars AFTER
    trailing = log_lower[idx:idx + len(keyword) + 20]
    if re.search(r'\b(?:corrected|recovered|resolved|cleared)\b', trailing):
        return True
    return False


# ── Scoring Engine ──────────────────────────────────────────────────────────
def _score_categories(log_lower: str) -> dict[str, float]:
    """
    Score every category by summing up matched signal scores.
    Uses word-boundary regex (FIX #2) and negation guard (FIX #3).
    """
    scores: dict[str, float] = {}
    for cat, config in CATEGORY_CONFIG.items():
        total = 0.0
        for pattern, score, is_regex in config["signals"]:
            if is_regex:
                match = re.search(pattern, log_lower, re.IGNORECASE)
                if match:
                    # Extract the matched text for negation check
                    matched_text = match.group(0)
                    if not _is_negated(log_lower, matched_text):
                        total += score
            else:
                if pattern in log_lower:
                    if not _is_negated(log_lower, pattern):
                        total += score
        if total > 0:
            scores[cat] = round(min(total, 0.99), 4)   # cap at 0.99
    return scores


# ── Severity Priority Order (for escalation comparison) ─────────────────────
_SEVERITY_RANK = {"P1 (Critical)": 4, "P2 (High)": 3, "P3 (Medium)": 2, "P4 (Low)": 1}

def _higher_severity(a: str, b: str) -> str:
    """Return whichever severity is more urgent."""
    return a if _SEVERITY_RANK.get(a, 0) >= _SEVERITY_RANK.get(b, 0) else b


def incident_triage(log_message: str, structured: dict = None, tracker: PersistenceTracker = None) -> dict:
    """
    Triage a log entry. Two modes:
    1. Raw mode: incident_triage("raw log string")
    2. Structured mode: incident_triage(content, structured={...})
    
    Now supports stateful persistence tracking via the 'tracker' argument.
    """
    s = structured or {}
    log_lower = log_message.lower()
    epoch = 0.0

    # ── 1. Affected Service Identification ────────────────────────────────
    # In structured mode, use the CSV Component column for more accurate mapping
    service = "Unknown System"
    component = s.get("component", "").lower()

    if component:
        # Structured mode: map CSV component → service
        COMPONENT_SERVICE_MAP = [
            ("HDFS",                              ["dfs.", "datanode", "namenode", "packetresponder", "fsnamesystem"]),
            ("Apache Web Server",                 ["apache", "httpd"]),
            ("Database Service",                  ["db", "sql", "mysql", "postgres"]),
            ("Authentication/Security Service",   ["pam_unix", "sshd", "auth"]),
            ("Supercomputer Kernel/Node (BGL)",   ["kernel"]),
            ("Linux/Network Services",            ["ntpd", "crond", "dhcpd", "sendmail", "ganglia",
                                                   "gmetad", "ib_sm", "snmpd", "xinetd"]),
        ]
        for svc_name, keys in COMPONENT_SERVICE_MAP:
            if any(k in component for k in keys):
                service = svc_name
                break
    else:
        # Fallback: raw mode keyword search
        SERVICE_MAP = [
            ("HDFS",                              ["hdfs", "datanode", "namenode", "dfs"]),
            ("Apache Web Server",                 ["apache", "http", "web"]),
            ("Database Service",                  ["db", "sql", "database", "connection pool"]),
            ("Authentication/Security Service",   ["ssh", "auth", "password", "pam_unix"]),
            ("Supercomputer Kernel/Node (BGL)",   ["ras kernel", "bgl"]),
            ("Linux/Network Services",            ["ntpd", "crond", "dhcpd", "sendmail", "ganglia"]),
        ]
        for svc_name, keywords in SERVICE_MAP:
            if any(kw in log_lower for kw in keywords):
                service = svc_name
                break

    # ── 2. Multi-Signal Category Scoring ──────────────────────────────────
    scores = _score_categories(log_lower)
    detected_categories = sorted(scores, key=scores.get, reverse=True)

    primary_category  = detected_categories[0] if detected_categories else "Unknown_Error"
    primary_confidence = scores.get(primary_category, 0.50)

    # ── 3. Compound Scenario Detection  ───────────────────────────────────
    detected_set = set(detected_categories)
    compound_scenario = None
    compound_severity  = None

    for primary_cats, secondary_cats, label, esc_severity in COMPOUND_SCENARIOS:
        if primary_cats & detected_set and secondary_cats & detected_set:
            compound_scenario = label
            compound_severity  = esc_severity
            break

    # ── 4. Severity Determination (derived from category config) ──────────
    if primary_category in CATEGORY_CONFIG:
        base_severity = CATEGORY_CONFIG[primary_category]["default_severity"]
    else:
        base_severity = "P4 (Low)"

    for cat in detected_categories:
        if cat in CATEGORY_CONFIG:
            cat_severity = CATEGORY_CONFIG[cat]["default_severity"]
            base_severity = _higher_severity(base_severity, cat_severity)

    if compound_severity:
        severity = _higher_severity(base_severity, compound_severity)
    else:
        severity = base_severity

    # ── 5. Persistence Tracking ───────────────────────────────────────────
    # Identify Template ID first
    if s:
        event_id = s.get("event_id", "")
        log_tmpl = s.get("event_template", "")
        tmpl_id = event_id if event_id else hashlib.sha256(log_tmpl.encode()).hexdigest()[:12]
        epoch = to_epoch(s.get("timestamp", s.get("date", "Unknown")))
    else:
        timestamp_raw, timestamp_iso, epoch = parse_timestamp(log_message)
        log_tmpl, tmpl_id = template_log(log_message, timestamp_raw)

    persistence = {"duration": 0, "count": 1, "state": "Transient"}
    if tracker and tmpl_id:
        persistence = tracker.track(tmpl_id, epoch)
        
    # Escalate if persistent (e.g., P2 -> P1, P3 -> P2)
    # But only if it's an actual error (Primary Category isn't System_Info)
    if persistence["state"] == "Persistent" and primary_category not in ["System_Info", "System_Info/Routine"]:
        escalated = severity
        if "P2" in severity: escalated = "P1 (Critical)"
        elif "P3" in severity: escalated = "P2 (High)"
        elif "P4" in severity: escalated = "P3 (Medium)"
        severity = _higher_severity(severity, escalated)

    IMPACT_MAP = {
        "P1": "Critical Outage",
        "P2": "Degraded Performance/Errors",
        "P3": "Minor Degradation",
        "P4": "No Impact",
    }
    user_impact = IMPACT_MAP.get(severity[:2], "No Impact")

    # ── 6. Metadata / Template / Timestamp ────────────────────────────────
    if s:
        # Structured CSV provides these directly — no regex parsing needed
        timestamp_iso = s.get("timestamp", s.get("date", "Unknown"))
        identifiers = extract_metadata(log_message)
        # Enrich identifiers with CSV fields
        csv_component = s.get("component", "")
        if csv_component:
            identifiers["component"] = csv_component
        csv_node = s.get("node", "")
        if csv_node:
            identifiers["node"] = csv_node
        csv_level = s.get("level", "")
        if csv_level:
            identifiers["log_level"] = csv_level
    else:
        # Raw mode: parse everything ourselves
        identifiers = extract_metadata(log_message)

    # ── Assemble Output ────────────────────────────────────────────────────
    result = {
        "log_raw": log_message,
        "Triage Results": {
            "Affected Service":  service,
            "Severity Level":    severity,
            "User Impact":       user_impact,
            "Primary Category":  primary_category,
            "Detected Categories": {cat: scores[cat] for cat in detected_categories},
            "Confidence Score":  primary_confidence,
            "Persistence":       persistence,
            "Compound Scenario": compound_scenario
        },
        "Context Metadata": {
            "Log Template":          log_tmpl,
            "Template ID":           tmpl_id,
            "Identifiers":           identifiers,
            "Standard ISO Time":      timestamp_iso,
        },
    }

    return result


if __name__ == "__main__":
    import csv

    # ── Dataset Registry ────────────────────────────────────────────────────
    # Each entry maps to a structured CSV and specifies which columns to use.
    DATASETS = [
        {
            "name": "HDFS",
            "csv_path": "HDFS/HDFS_2k.log_structured.csv",
            "field_map": {
                "content":        "Content",
                "component":      "Component",
                "level":          "Level",
                "event_id":       "EventId",
                "event_template": "EventTemplate",
                "timestamp":      "Time",
                "date":           "Date",
            },
        },
        {
            "name": "BGL",
            "csv_path": "BGL/BGL_2k.log_structured.csv",
            "field_map": {
                "content":        "Content",
                "component":      "Component",
                "level":          "Level",
                "event_id":       "EventId",
                "event_template": "EventTemplate",
                "timestamp":      "Time",
                "date":           "Date",
                "node":           "Node",
                "label":          "Label",
            },
        },
        {
            "name": "Thunderbird",
            "csv_path": "Thunderbird/Thunderbird_2k.log_structured.csv",
            "field_map": {
                "content":        "Content",
                "component":      "Component",
                "event_id":       "EventId",
                "event_template": "EventTemplate",
                "timestamp":      "Time",
                "date":           "Date",
                "label":          "Label",
            },
        },
    ]

    base_dir = "/Users/joannemiki57/Desktop/loghub"

    for ds in DATASETS:
        csv_path = os.path.join(base_dir, ds["csv_path"])

        if not os.path.exists(csv_path):
            print(f"Error: Could not find {csv_path}")
            continue

        print(f"\n{'='*65}")
        print(f"=== [{ds['name']}] Structured CSV: {ds['csv_path']} ===")
        print(f"{'='*65}")

        category_counter = Counter()
        severity_counter = Counter()
        compound_counter = Counter()
        persistence_tracker = PersistenceTracker()
        total_rows = 0

        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader):
                total_rows += 1
                fmap = ds["field_map"]

                # Build structured dict from CSV columns
                structured = {}
                for our_key, csv_col in fmap.items():
                    if csv_col in row:
                        structured[our_key] = row[csv_col]

                content = row.get(fmap["content"], "")

                # Call triage in *structured mode* with tracker
                result = incident_triage(content, structured=structured, tracker=persistence_tracker)

                triage = result["Triage Results"]
                category_counter[triage["Primary Category"]] += 1
                severity_counter[triage["Severity Level"]] += 1
                if "Compound_Scenario" in triage:
                    compound_counter[triage["Compound_Scenario"]] += 1

                # Print first 2 samples per dataset
                if i < 2:
                    print(f"\n--- [Sample {i+1}] ---")
                    print(f"  Content:   {content[:80]}")
                    print(f"  Component: {structured.get('component', 'N/A')}")
                    print(f"  Level:     {structured.get('level', 'N/A')}")
                    print(f"  EventId:   {structured.get('event_id', 'N/A')}")
                    print(json.dumps(result, indent=4, ensure_ascii=False))

        print(f"\n{'─'*65}")
        print(f"Executive Analysis Summary — {ds['name']}")
        print(f"Total Logs Analyzed: {total_rows}")
        print(f"\n[Severity Distribution]")
        for sev, count in severity_counter.most_common():
            pct = count / total_rows * 100
            print(f"   - {sev}: {count} ({pct:.1f}%)")

        print("\n[Error Categories]")
        for cat, count in category_counter.most_common():
            pct = count / total_rows * 100
            print(f"   - {cat}: {count} ({pct:.1f}%)")

        if compound_counter:
            print("\n[Compound Scenarios Detected]")
            for sc, count in compound_counter.most_common():
                print(f"   - {sc}: {count} hits")

        # Report persistence stats
        persistent_count = sum(1 for inc in persistence_tracker.active_incidents.values() 
                               if inc["last_seen"] - inc["first_seen"] >= persistence_tracker.threshold)
        if persistent_count:
            print(f"\n[Persistence Report]")
            print(f"   - {persistent_count} unique error patterns became PERSISTENT (> 5 mins)")
        
        print(f"{'─'*65}")
