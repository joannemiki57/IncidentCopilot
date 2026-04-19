# Claude Design 경로 A — 단계별 실행 가이드

경로 A = **기존 `frontend/` 를 Claude Design 에 디자인 시스템으로 학습시킨 뒤, 새 화면만 뽑기**.
총 7 단계로 나뉘며 각 단계는 5~15분 소요.

---

## Step 0. 사전 체크 (2분)

1. 구독 플랜 확인 — Pro / Max / Team / Enterprise 중 하나. Enterprise 면 Owner 가
   Organization settings → Capabilities → "Claude Design" 을 켜놨는지 확인.
2. 최신 GitHub push 확인 — Claude Design 이 원격 리포를 직접 읽을 수도 있어서,
   지금 로컬에만 있는 feature6 작업분도 `main` 또는 feature 브랜치에 push 되어 있는 게 좋다.

```bash
cd /사용자_경로/IncidentCopilot
git status
git log --oneline -5
```

3. `frontend/` 폴더가 깔끔한지 — `.next/` · `node_modules/` 는 Claude Design 이
   무시하지만, 수작업 zip 업로드 시에는 둘 다 제외해야 업로드 용량이 줄어든다.

---

## Step 1. Claude Design 접속 & 워크스페이스 생성 (3분)

1. 브라우저에서 `https://claude.ai/design` 열기.
2. Claude 계정으로 로그인. 처음 접속이면 리서치 프리뷰 약관 수락 화면이 한 번 뜸.
3. 우측 상단 `New project` → 프로젝트 이름 `IncidentCopilot` 입력.
4. "What are you building?" 질문에
   `frontend/docs/claude-design-onboarding.md` 의 **§1 프로젝트 초기 프롬프트** 를
   복사해서 붙여넣고 `Continue`.

---

## Step 2. 코드베이스 연결 (5분)

Claude Design 이 "Connect your design sources" 를 물어봄. 선택지 3개 중 권장 순서:

### 옵션 A (권장) — GitHub 연결

1. `Connect GitHub` 클릭 → OAuth 권한 승인.
2. 리포 선택: `IncidentCopilot` (프라이빗이면 Anthropic org 에 접근 권한 부여 필요).
3. 브랜치 선택: 현재 작업 중인 브랜치 또는 `main`.
4. 루트 디렉터리: `incident-copilot/frontend` 로 지정 — 백엔드·데이터 폴더는 제외.

### 옵션 B — 폴더 업로드

GitHub 연결을 피하고 싶으면:

```bash
cd /사용자_경로/IncidentCopilot/incident-copilot/frontend
# node_modules, .next, .turbo 제외한 zip 생성
zip -r ../frontend-for-design.zip . \
  -x "node_modules/*" -x ".next/*" -x ".turbo/*" -x "*.log"
```

생성된 `frontend-for-design.zip` 을 드롭존에 끌어다 놓기.

### 옵션 C — 토큰 수동 입력

가장 빠르지만 컴포넌트 구조는 못 학습시킴. `frontend/docs/claude-design-onboarding.md`
의 **§2 디자인 시스템 고정값** 을 그대로 "Custom instructions" 에 붙여넣기.

---

## Step 3. 디자인 시스템 추출 확인 (10분)

Claude Design 이 자동으로 다음 3개 탭을 생성함:

- **Tokens** — oklch 색 · 간격 · radius · 그림자.
- **Typography** — Geist Sans / Mono, heading scale, label scale.
- **Components** — 14개 카드·shell 컴포넌트 썸네일.

### 검수 체크리스트

| 항목 | 기대값 | 틀렸다면 |
|---|---|---|
| `--primary` | `oklch(0.66 0.22 295)` | 팔레트 탭에서 직접 수정 |
| `--critical` / `--warning` / `--success` / `--info` 4개 semantic 토큰 | 모두 존재 | "Custom instructions" 에 §2.1 팔레트 재붙여넣기 |
| Card radius | 0.5rem (rounded-xl) | Tokens 탭에서 radius slider 조정 |
| Card padding | py-6 px-6 | Components → Card 편집 |
| Sidebar 색 | background 보다 어두움 (oklch 0.13) | Sidebar 컴포넌트 편집 |
| Mono 폰트 | Geist Mono | Typography → Monospace family 수정 |
| 배경 aurora | top-left purple + top-right magenta | "Apply to all screens" 토글 확인 |

컴포넌트 썸네일에서 `TriageCard` · `HypothesisCard` · `OptimizationCard` 가 **dark
surface + 좌측 severity rail** 로 렌더되는지 확인. 만약 플랫한 흰 카드로 나오면
Step 2 에서 `globals.css` 를 못 읽은 것이니 한 번 더 업로드하거나 프롬프트에
"Dark is the default theme — `:root` holds the dark palette, `.light` is the override" 를 추가.

---

## Step 4. "금지 규칙" 잠그기 (3분)

새 화면 생성 시 기존 카드를 변형해버리지 않도록 프로젝트 설정에 rule 을 건다.

1. 우측 상단 프로젝트 아이콘 → `Project settings` → `Custom rules`.
2. `claude-design-onboarding.md` 의 **§4 제외 / 금지** 블록을 통째로 붙여넣기.
3. Save.

이 단계가 실질적으로 "기존 UI 를 훼손하지 않는다" 는 안전장치예요.

---

## Step 5. 신규 화면 생성 — 3개 병렬 (20분)

Claude Design 은 한 프로젝트 안에서 screen 을 여러 개 생성할 수 있음. 세 개를
순차가 아니라 **동시에 3개 다 띄워두고** 각각 iterate 하는 게 효율적.

### 5-A. Historical incidents

1. `+ New screen` → 이름 `Historical incidents` → 템플릿은 `Blank`.
2. 프롬프트 입력창에 `§3.1 Historical incidents 페이지` 전문 붙여넣기.
3. 생성 후 확인 포인트:
   - Sidebar 의 "Historical" 엔트리가 active 상태인가 (좌측 rail 표시).
   - KPI 4-tile grid 가 P1 count 만 `--critical` 톤이고 나머지는 neutral 인가.
   - 테이블 row hover 시 `bg-muted/40` 이 살아있는가 (애니메이션 미리보기 hover).
4. 틀리면 inline comment 로 "Use `--critical` only for the P1 KPI tile,
   keep others neutral" 같이 짧게 지적.

### 5-B. Runbook detail modal

1. `+ New screen` → 이름 `Runbook modal` → 템플릿 `Modal / overlay`.
2. 프롬프트 `§3.2 Runbook detail 모달` 전문 붙여넣기.
3. 확인 포인트:
   - tabs 5개 (Steps / Rationale / Rollback / Evidence / History) 모두 생성됐는지.
   - `Trigger runbook` 버튼이 `hitlStatus` 에 따라 두 상태(enabled/disabled) 로 그려졌는지.
   - Steps 의 command 블록이 `bg-slate-900 text-slate-100` 다크 고정인가 (테마 토글에도 바뀌지 않아야 함).
4. 필요 시 knob 으로 modal 폭을 720→760 로 조정 가능.

### 5-C. Mobile on-call view

1. `+ New screen` → 이름 `Mobile on-call` → 템플릿 `Mobile 390×844`.
2. 프롬프트 `§3.3 Mobile on-call view` 전문 붙여넣기.
3. 확인 포인트:
   - 상단 P1 pill 이 filled (bg `--critical`, text white) 인가 — 여기만은 tint 가 아니라 solid.
   - Bottom action bar 가 safe-area 패딩으로 하단 home indicator 위에 떠 있는가.
   - "Acknowledge / Escalate / Resolve" 3 버튼이 각각 52px × full-width 인가.
4. 웹 캡처 도구로 `localhost:3000` 의 TriageCard 를 그대로 embed 해보고 싶으면
   `Add from web` → 로컬 dev 서버 주소 → 요소 클릭.

---

## Step 6. 피드백 루프 (짧게 여러 번, 15~30분)

각 화면에서 한 번에 모든 지적을 쏟지 말고 **3-4개씩 묶어서 iterate**. 지적 템플릿:

```
Fix these in order:
1. Use --warning (not --critical) for "Awaiting approval" bar.
2. Make the severity column 64px wide, center-aligned.
3. Swap the hypothesis confidence ring to inline linear progress when viewport < 640px.
```

inline comment 는 요소별로 점찍어 지적할 수 있고, knob 은 spacing/radius/color 만
실시간 변경 가능. 구조 변경(섹션 추가/삭제)은 항상 프롬프트로.

---

## Step 7. 코드로 옮기기 (1~2시간, 선택)

Claude Design 의 `Export → React + Tailwind` 를 누르면 프로젝트 전체가 tsx 로 내려옴.
하지만 **그대로 덮어쓰지 말 것** — 기존 `components/` 와 충돌할 수 있음. 권장 절차:

1. 새 브랜치 생성: `git checkout -b design/historical-incidents`.
2. Claude Design 에서 해당 화면만 선택해 export → `/tmp/history-page/` 같은 곳에 받기.
3. 생성된 `page.tsx` 를 먼저 **읽기만** 하고, 기존 컴포넌트(`TriageCard`, `EvidenceItem` 등)
   는 export 본 대신 현재 코드베이스 것으로 치환.
4. 새로 추가되는 것들만 `app/incidents/page.tsx` 와 `components/incidents/` 로 이식.
5. `./node_modules/.bin/tsc --noEmit` → `./node_modules/.bin/eslint` → `npm run dev`
   순서로 검증.
6. 브랜치 push → PR → 리뷰 → merge.

---

## 흔한 실패 패턴 & 대처

| 증상 | 원인 | 대처 |
|---|---|---|
| 생성된 화면이 라이트 테마로 나옴 | `:root` 가 dark 라는 걸 못 알아챔 | Custom rules 에 "Dark is the default, light is opt-in via `.light`" 명시 |
| `bg-slate-900` 코드 블록이 테마 토글에 따라 색이 바뀜 | 토큰화 돼버림 | "Code blocks are intentionally theme-agnostic, use raw slate-900" 로 rule 추가 |
| 새 카드가 `rounded-2xl` 로 너무 부드러움 | radius 토큰을 상속 안 함 | Tokens 탭 → radius 0.5rem fix → "Apply to all" |
| Lucide 이외 아이콘(Phosphor/Heroicons) 이 섞여 나옴 | 아이콘 라이브러리 자동 탐색 실패 | §4 에 "Only lucide-react icons" 재명시 |
| 새 화면이 데이터 shape 를 허구로 만듦 | TypeScript 타입을 못 읽음 | `lib/types/ui-model.ts` 를 Step 2 업로드에 반드시 포함 |

---

## 체크리스트 요약

- [ ] Step 0: 플랜 확인 + git push
- [ ] Step 1: `claude.ai/design` → `New project "IncidentCopilot"` → §1 프롬프트
- [ ] Step 2: GitHub 연결 또는 zip 업로드 (루트 = `incident-copilot/frontend`)
- [ ] Step 3: Tokens / Typography / Components 3개 탭 검수
- [ ] Step 4: Custom rules 에 §4 금지 규칙 붙여넣기
- [ ] Step 5-A: Historical incidents 생성
- [ ] Step 5-B: Runbook detail modal 생성
- [ ] Step 5-C: Mobile on-call view 생성
- [ ] Step 6: 각 화면 2-3 라운드 iterate
- [ ] Step 7: 준비되면 export → 새 브랜치 → tsc/eslint → PR
