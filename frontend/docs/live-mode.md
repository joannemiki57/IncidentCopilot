# Live mode — 로컬 실행 가이드

Paste-your-own-logs 모드. textarea 에 로그를 붙여넣고 **Analyze** 를 누르면
FastAPI 백엔드가 6 단계 파이프라인을 돌리면서 SSE 로 stage 이벤트를 푸시하고,
프론트는 stage 가 도착할 때마다 카드를 하나씩 채워 넣는다.

> Demo mode (사이드바의 "DB saturation / HDFS DataNode / BGL hardware" 3 개)
> 는 프리컴파일된 JSON fixture 를 그대로 로드하므로 백엔드 없이도 동작한다.
> 실시간 파이프라인은 textarea + Analyze 버튼 경로에서만 발생한다.

---

## 아키텍처 한 장 요약

```
 browser                Next.js (nodejs runtime)         FastAPI (uvicorn)
┌──────────┐  POST    ┌──────────────────────────┐     ┌──────────────────┐
│ LogInput │ ───────▶ │ /api/analyze/stream      │ ──▶ │ /api/analyze/str │
│ Play btn │          │ (proxy, pipes SSE bytes) │     │ run_pipeline()   │
└──────────┘          └──────────────────────────┘     └──────────────────┘
     ▲                           │                              │
     │   SSE frames              │    stage/done/error          │
     │ (triage / rca / evidence  │◀─────────────────────────────┘
     │  / action_plan / summary  │
     │  / optimization / done)   │
     └───────────────────────────┘
 store.analyzeStream()
  • parses SSE via ReadableStream + TextDecoder
  • mergeStageIntoRaw(raw, stage, payload)
  • assembleFromRealOutput("latest", raw) → setState.analysisResult
  • completedStages 업데이트 → LogInput footer progress dots
```

---

## 처음 한 번 세팅

```bash
# 1) Python 백엔드 의존성 설치
cd incident-copilot/backend
pip install -r requirements.txt --break-system-packages
#   (시스템 pip 을 쓰는 경우만 --break-system-packages 필요. venv 쓰면 생략)

# 2) 프런트 의존성은 기존 npm install 그대로
cd ../frontend
npm install
```

---

## 두 프로세스 실행

두 개 터미널 탭을 띄운다.

**탭 A — 백엔드 (FastAPI / uvicorn):**

```bash
cd incident-copilot/backend
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
# (포트는 자유. 바꾸면 아래 INCIDENT_COPILOT_BACKEND_URL 도 맞춰 주자)
```

`/health` 에 200 이 떨어지면 정상:

```bash
curl -s http://localhost:8000/health
# {"status":"ok","service":"IncidentCopilot Live","version":"0.1.0"}
```

**탭 B — 프론트 (Next.js dev):**

```bash
cd incident-copilot/frontend
# 필요하면 백엔드 URL override. 기본값 http://localhost:8000.
export INCIDENT_COPILOT_BACKEND_URL=http://localhost:8000
npm run dev
```

브라우저에서 `http://localhost:3000` 을 열고, 기본 textarea 에 로그를 붙여넣은 뒤
**Analyze** 를 누르면 LogInput 푸터에 **Triage → RCA → Evidence → Action → Summary →
Optim** 칩이 순차적으로 채워지고, 각 카드는 해당 stage 도착 시점에 스켈레톤 → 실데이터
로 스왑된다.

---

## 환경 변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `INCIDENT_COPILOT_BACKEND_URL` | `http://localhost:8000` | Next.js proxy (`/api/analyze/stream`) 가 forward 할 FastAPI 루트. 끝 슬래시는 자동 제거. |

프론트 쪽 runtime 은 `app/api/analyze/stream/route.ts` 에서 `runtime = "nodejs"`,
`dynamic = "force-dynamic"` 으로 고정되어 있다. Edge 로 옮기면 SSE keep-alive 가
꼬이므로 그대로 둘 것.

---

## 스트림이 내려주는 이벤트

FastAPI `backend/server.py :: _run_pipeline` 은 정해진 순서로 다음 SSE 프레임을 yield 한다.
프론트 store (`lib/store.ts :: mergeStageIntoRaw`) 는 이 shape 에 1:1 로 맞춰
`TeamRealOutput` 을 누적한다 — 백엔드에서 필드명을 바꾸면 어댑터까지 연쇄로 갱신 필요.

```
event: stage
data: { "stage": "triage",       "index": 1, "payload": { "Triage Results": {...}, "Context Metadata": {...}, "log_raw": "..." } }

event: stage
data: { "stage": "rca",          "index": 2, "payload": { "root_cause_analysis": {...} } }

event: stage
data: { "stage": "evidence",     "index": 3, "payload": [ { "evidence_id": "...", "category": "SUPPORT", ... } ] }

event: stage
data: { "stage": "action_plan",  "index": 4, "payload": { "plan": {...}, "safety_evaluation": {...} } }

event: stage
data: { "stage": "summary",      "index": 5, "payload": { "sre_markdown": "...", "executive_markdown": "..." } }

event: stage
data: { "stage": "optimization", "index": 6, "payload": { "target_location": "...", ... } }   # 또는 null

event: done
data: { "run_id": "<uuid>", "finished_at": "2026-04-19T12:34:56+00:00", "stages": ["triage","rca",...] }
```

에러는 그대로 내려온다:

```
event: error
data: { "stage": "rca", "message": "…" }
```

프론트는 `error` 이벤트를 받으면 `error` 스토어 필드에 메시지를 박고 스트림을
끊는다. Next.js proxy 가 upstream 연결 자체에 실패하면 동일한 shape 의 에러
프레임을 200 + `text/event-stream` 으로 리턴하므로 UI 는 2xx 경로 하나만
신경 쓰면 된다.

---

## 감사 로그 (audit artifacts)

스트림과 별개로 백엔드는 stage 마다 JSON 을 아래 경로에 떨군다 — 재현/회귀 테스트용.

```
data/live/<run_id>/feature1_triage.json
data/live/<run_id>/feature2_rca.json
data/live/<run_id>/feature3_evidence.json
data/live/<run_id>/feature4_action.json
data/live/<run_id>/feature5_summary.json
data/live/<run_id>/feature6_optimization.json   # 없을 수도 있음
```

이 폴더는 `.gitignore` 에 `data/live/` 로 걸려 있어 커밋되지 않는다. 디버깅이
끝나면 `rm -rf data/live/<run_id>` 로 지우면 됨.

---

## 자주 터지는 함정

| 증상 | 원인 | 대처 |
|---|---|---|
| Analyze 눌러도 "Cannot reach FastAPI at …" | uvicorn 안 떠 있음 | 탭 A 가 죽었는지 확인. 포트 바꿨으면 `INCIDENT_COPILOT_BACKEND_URL` 갱신. |
| 카드가 전부 스켈레톤인 채로 멈춤 | 백엔드가 stage 중 하나에서 예외 | 탭 A 로그 확인. `event: error` 가 떴으면 프론트 상단에도 메시지 노출됨. |
| 첫 번째 stage 부터 indexeded chunk 가 깨져서 옴 | reverse-proxy 가 SSE 를 버퍼링 | `X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform` 헤더가 죽지 않았는지 확인. nginx 쓰면 `proxy_buffering off;` 필요. |
| `duplex: "half"` 관련 타입 에러 | Node 18 미만 | Node 20 LTS 이상 권장. Next.js 16 은 어차피 요구. |
| 두 번째 Analyze 호출 시 이전 데이터가 남음 | `analyzeStream` 첫 줄에서 `analysisResult: null` 로 초기화되므로 문제가 아님. 남아 보이면 브라우저 캐시. | hard reload. |

---

## 수동 curl 로 스트림 흐름 확인

프론트를 띄우지 않고도 파이프라인이 살아있는지 빠르게 볼 수 있다.

```bash
curl -N \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"log_text":"2026-04-19 02:17:27 ERROR dfs.DataNode$PacketResponder: PacketResponder for block blk_123 terminates with error: Connection refused"}' \
  http://localhost:8000/api/analyze/stream
```

`event: stage` 라인이 6 번(최대), `event: done` 이 마지막에 한 번 내려오면 정상.
