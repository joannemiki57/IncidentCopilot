import json
import sys
import os

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from incident_triage_poc import incident_triage, PersistenceTracker

def test_user_scenario():
    tracker = PersistenceTracker()
    log_msg = "081109 203615 148 INFO dfs.DataNode$PacketResponder: PacketResponder 1 for block blk_-1608999687919862906 terminating"
    
    # Simulate structured input or just raw
    # From the user's example, it seems like they are using structured columns from a HDFS dataset
    structured = {
        "component": "dfs.DataNode$PacketResponder",
        "level": "INFO",
        "event_id": "E10",
        "event_template": "PacketResponder <*> for block blk_<*> terminating",
        "timestamp": "203615"
    }
    
    result = incident_triage(log_msg, structured=structured, tracker=tracker)
    print(json.dumps(result, indent=4, ensure_ascii=False))

if __name__ == "__main__":
    test_user_scenario()
