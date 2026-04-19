import time
import random
import os
import sys
from datetime import datetime

# 감시할 파일 경로 (data/test.log)
LOG_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "test.log"))

# 에러 시나리오 목록 — AI 분석을 트리거할 에러들
ERROR_SCENARIOS = [
    "ERROR: Database connection pool exhausted. 0 active connections available.",
    "FATAL: Connection refused from payment-gateway.timeout: 5000ms.",
    "ERROR: Memory leak detected in JVM heap space. Usage > 95%.",
    "CRITICAL: Disk full on /var/lib/mysql. Cannot write transaction log."
]

def generate_logs():
    print(f"🚀 Mock Log Generator started!")
    print(f"📁 Target file: {LOG_FILE}")
    print(f"💡 The dashboard will auto-analyze when an ERROR appears (every ~15s).")
    print("-" * 50)
    
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    
    # 기존 로그 초기화
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.write(f"--- Log session started at {datetime.now().isoformat()} ---\n")

    counter = 0
    try:
        while True:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            # 5번의 INFO 로그 후 1번의 ERROR 로그 생성 (약 15초 주기)
            if counter % 5 == 4:
                log_line = f"{timestamp} {random.choice(ERROR_SCENARIOS)}"
            else:
                log_line = f"{timestamp} INFO: Service health check heartbeat (status: OK)"
                
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(log_line + "\n")
                # flush to ensure the watcher sees it immediately
                f.flush()
                
            print(f"[{timestamp}] Added: {log_line}")
            
            counter += 1
            time.sleep(3)
    except KeyboardInterrupt:
        print("\n👋 Log generator stopped.")
        sys.exit(0)

if __name__ == "__main__":
    generate_logs()
