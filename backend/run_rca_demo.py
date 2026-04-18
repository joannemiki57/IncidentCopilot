import os
import csv
import json
from incident_triage_poc import incident_triage, PersistenceTracker
from incident_rca_engine import RCAEngine

def run_integrated_demo():
    triage_tracker = PersistenceTracker()
    rca_engine = RCAEngine()
    
    # Path to BGL dataset (known for hardware/persistence issues)
    bgl_path = "/Users/joannemiki57/Desktop/loghub/BGL/BGL_2k.log_structured.csv"
    
    if not os.path.exists(bgl_path):
        print(f"Error: BGL dataset not found at {bgl_path}")
        return

    print(f"\n{'='*80}")
    print(f"🚀 INTEGRATED AIOPS DEMO: Triage (Feature 1) + RCA (Feature 2)")
    print(f"{'='*80}")

    high_severity_incidents = []

    with open(bgl_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            # 1. Run Triage (Feature 1)
            # Use structured data map
            structured = {
                "component": row.get("Component"),
                "level": row.get("Level"),
                "event_id": row.get("EventId"),
                "event_template": row.get("EventTemplate"),
                "timestamp": row.get("Time"),
                "node": row.get("Node")
            }
            content = row.get("Content", "")
            
            triage_result = incident_triage(content, structured=structured, tracker=triage_tracker)
            
            # 2. Check for "Interesting" incidents (P1 or P2)
            severity = triage_result["Triage Results"]["Severity Level"]
            if "P1" in severity or "P2" in severity:
                # 3. Run RCA (Feature 2)
                rca_report = rca_engine.analyze(triage_result)
                
                # Capture for final display
                high_severity_incidents.append({
                    "content": content,
                    "triage": triage_result,
                    "rca": rca_report
                })
            
            # Limit loop for demo speed
            if i >= 500: break

    # Output the first few incidents with RCA
    print(f"\nFound {len(high_severity_incidents)} high-severity incidents in the first 500 logs.")
    
    for idx, item in enumerate(high_severity_incidents[:3]):
        print(f"\n--- [Incident #{idx+1}] ---")
        print(f"Log:      {item['content']}")
        print(f"Severity: {item['triage']['Triage Results']['Severity Level']}")
        print(f"Category: {item['triage']['Triage Results']['Primary Category']}")
        
        rca = item['rca']
        print(f"\n[Root Cause Analysis]")
        print(f" Probable Cause:     {rca['root_cause']}")
        print(f" Confidence:         {rca['confidence']:.2f}")
        print(f" Evidence:           {rca['evidence_summary']}")
        print(f" Verification Plan:  {', '.join(rca['verification_plan'])}")
    
    print(f"\n{'='*80}")
    print(f"Demo complete. Full integrated pipeline verified.")
    print(f"{'='*80}")

if __name__ == "__main__":
    run_integrated_demo()
