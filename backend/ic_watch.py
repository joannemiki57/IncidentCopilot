import time
import os
import subprocess
import sys
import datetime
import argparse

def main():
    parser = argparse.ArgumentParser(description="IncidentCopilot Log Watcher")
    parser.add_argument("logfile", nargs="?", default="data/live_stream.log", help="Path to the log file to monitor (default: data/live_stream.log)")
    args = parser.parse_args()

    LOG_FILE = args.logfile

    # Ensure the log file exists
    if not os.path.exists(LOG_FILE):
        print(f"❌ Log file '{LOG_FILE}' does not exist. Creating it...")
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        open(LOG_FILE, 'w').close()

    print(f"👀 [IncidentCopilot] Monitoring '{LOG_FILE}'... Waiting for incident logs.")
    print("(This simulated terminal watcher will notify on urgent errors and save full analysis to file)\n")

    with open(LOG_FILE, 'r') as f:
        # Go to end of file
        f.seek(0, 2)
        while True:
            line = f.readline()
            if not line:
                time.sleep(0.5)
                # For the sake of this demo, if the file is deleted or we want to exit
                if not os.path.exists(LOG_FILE): break
                continue
            
            if "ERROR" in line or "FATAL" in line:
                # Generate timestamp for unique filename
                timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                analysis_file = f"analysis_{timestamp}.md"
                
                # Short summary for terminal notification
                log_summary = line.strip()[:100] + "..." if len(line.strip()) > 100 else line.strip()
                print(f"\n🚨 [긴급 알림] 에러 로그 감지: {log_summary}")
                print(f"📄 전체 분석 결과: {analysis_file} 파일 참고")
                print("--- 자동 분석 진행 중 ---\n")
                
                # Run analysis and save to file
                try:
                    with open(analysis_file, "w") as outfile:
                        subprocess.run([sys.executable, "backend/copilot_cli.py", line.strip()], stdout=outfile, stderr=outfile, text=True)
                    print(f"\n✅ 분석 완료. 파일: {analysis_file}")
                except Exception as e:
                    print(f"\n❌ 분석 실패: {e}")
                
                print("✨ 모니터링 재개...\n")
                sys.stdout.flush()

if __name__ == "__main__":
    main()
