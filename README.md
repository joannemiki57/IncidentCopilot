# Incident Copilot

로그를 붙여 넣으면 **트리아지 → 가설·RCA → 근거 → 액션 플랜 → 요약 → 코드 최적화 제안**까지 한 번에 따라갈 수 있는 인시던트 대응용 웹 콘솔입니다. Next.js 프론트엔드와 Python(FastAPI) 백엔드로 구성되어 있으며, 실시간 분석은 **Server-Sent Events(SSE)** 로 단계별로 스트리밍됩니다.

## 주요 기능

| 단계 | 설명 |
|------|------|
| **Triage** | 로그 기반 초기 분류·심각도 |
| **Hypothesis / RCA** | 원인 가설 순위 및 근본 원인 분석 |
| **Evidence** | 근거 항목 정리 |
| **Action plan** | HITL 게이트가 있는 실행 가능한 런북 |
| **Executive summary** | 역할(SRE / Executive 등)에 맞는 요약 |
| **Optimization** | 관련 코드·설정에 대한 최적화 힌트 |

데모·통합 시나리오용 JSON은 `data/`·`frontend/mocks/` 에 있으며, 라이브 실행 시 단계별 산출물은 `data/live/<run_id>/` 에도 기록됩니다.

## 사전 요구 사항

- **Node.js** 20+ (프론트엔드)
- **Python** 3.10+ (백엔드)

## 빠른 시작

### 1. 백엔드 (FastAPI, SSE)

```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

- 스트리밍 엔드포인트: `POST /api/analyze/stream`
- 헬스체크: `GET /health`

### 2. 프론트엔드 (Next.js)

별도 터미널에서:

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 엽니다. 기본적으로 Next의 `/api/analyze/stream` 이 로컬 백엔드 `http://localhost:8000` 으로 프록시합니다.

### 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `INCIDENT_COPILOT_BACKEND_URL` | FastAPI 베이스 URL (Next 서버 사이드 프록시용) | `http://localhost:8000` |

배포 시 백엔드 URL만 맞추면 동일 출처로 SSE를 유지할 수 있습니다.

## 저장소 구조

```
backend/          # 엔진 모듈 + FastAPI server (라이브 SSE)
frontend/         # Next.js 16 앱, UI·어댑터·API 라우트
data/             # 시나리오·피처별 JSON 샘플
prompts/          # 프롬프트 관련 자료
```

## 스크립트 (프론트엔드)

- `npm run build` — 프로덕션 빌드
- `npm run lint` — ESLint

## 라이선스

이 저장소에 별도 라이선스 파일이 없습니다. 사용·배포 전 조직 정책에 맞게 확인하세요.
