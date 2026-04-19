# Claude Design — IncidentCopilot 온보딩 브리프

이 문서는 `claude.ai/design` 에 IncidentCopilot 프론트엔드를 연결할 때
**그대로 복사·붙여넣기** 할 수 있도록 짠 브리프예요. 세 부분으로 나뉩니다.

1. 프로젝트 초기 프롬프트 (Claude Design 의 "Describe your project" 에 붙일 것)
2. 디자인 시스템 고정값 (팔레트·타이포·카드 리듬 — 필요 시 "Custom instructions" 에 붙일 것)
3. 신규 화면 3종 프롬프트 (Historical incidents / Runbook detail modal / Mobile on-call view)

---

## 1. 프로젝트 초기 프롬프트

> Build a design system and new screens for **IncidentCopilot**, a Datadog/Grafana-inspired
> incident response console. The product takes raw logs in, runs a 6-stage AI pipeline
> (Triage → Hypothesis → Evidence → Action Plan → Executive Summary → Code Optimization),
> and shows each stage as a dense, observability-grade card. The existing frontend is
> Next.js 16 + React 19 + Tailwind v4 + shadcn/ui (new-york-v4) with a dark-default theme.
> Aesthetic reference points: Datadog, Grafana, Linear. Type rhythm is compact; information
> density is favored over whitespace; color is semantic, not decorative.
>
> The site is an on-call triage dashboard — audiences are SREs and engineers under load,
> so every screen should read fast at a glance and degrade gracefully on narrow viewports.

## 2. 디자인 시스템 고정값

### 2.1 팔레트 (oklch — 그대로 등록)

Dark (default):

```
--background          oklch(0.17 0.025 275)   /* deep navy-purple surface */
--foreground          oklch(0.96 0.01  260)
--card                oklch(0.22 0.028 275)   /* one notch brighter than bg */
--card-foreground     oklch(0.96 0.01  260)
--primary             oklch(0.66 0.22  295)   /* Datadog-signature purple */
--primary-foreground  oklch(0.14 0.02  275)
--secondary           oklch(0.28 0.03  275)
--muted               oklch(0.26 0.025 275)
--muted-foreground    oklch(0.72 0.02  265)
--accent              oklch(0.32 0.05  215)   /* cyan accent */
--border              oklch(1    0    0 / 10%)
--ring                oklch(0.70 0.20  295)

--critical  oklch(0.66 0.23  25)    /* P1 / destructive */
--warning   oklch(0.76 0.17  75)    /* P2 / N+1 / caution */
--success   oklch(0.72 0.17 160)    /* auto-executable / green badge */
--info      oklch(0.75 0.14 210)    /* informational chips */

--chart-1   oklch(0.66 0.22 295)    /* primary purple */
--chart-2   oklch(0.75 0.15 200)    /* cyan */
--chart-3   oklch(0.70 0.22 340)    /* magenta */
--chart-4   oklch(0.78 0.16  80)    /* amber */
--chart-5   oklch(0.72 0.18 155)    /* green */

--sidebar             oklch(0.13 0.02 275)   /* deeper than background */
```

Light mode override: same primary (0.55 0.22 295), paper white card, neutral border.

배경은 단색이 아니라 **두 개의 radial aurora** — top-left 에 `--primary` 를 18% 섞은
1200×800px, top-right 에 `--chart-3` 를 12% 섞은 900×600px. 라이트 모드에서는 끈다.

### 2.2 타이포·리듬

- Font: Geist Sans (sans) + Geist Mono (mono). ID·타임스탬프·로그는 반드시 mono.
- Heading scale: h1 2xl semibold, card title base semibold, section label **10px uppercase tracking [0.14em] text-muted-foreground mb-1.5**.
- Card radius: `--radius 0.5rem` → Card 는 `rounded-xl`.
- Card padding: `py-6 px-6`, 섹션 간 `space-y-4` 또는 `gap-3`.
- 페이지 그리드: `max-w-[1400px]`, 카드 간 `gap-6`. lg 에서 5열 혹은 2열 스플릿.
- 배지 공통: `rounded-md border px-2 py-0.5 text-[11px] font-medium`, 배경은 `[--color-*]/15`, 테두리 `[--color-*]/40`, 텍스트 `[--color-*]`.

### 2.3 컴포넌트 인벤토리 (현재 존재)

Shell:
- `AppShell` — flex min-h-dvh, 좌측 고정 Sidebar + 우측 sticky topbar(status pill · incident id · dataset · ⌘K · notification dot).
- `Sidebar` — brand header, SCENARIOS nav (Sparkles/Database/HardDrive/Radar icon), active rail indicator, "latest" 에 live dot, 하단 ThemeToggle.
- `ThemeToggle` — `useSyncExternalStore` 로 `<html>` 의 `.light` class 구독. localStorage key `incident-copilot:theme`.

Incident 카드:
- `TriageCard` — severity rail (`P1` → `--critical` / `P2` → `--warning` / ...), compound scenario 배너, persistence chip.
- `HypothesisRanking` + `HypothesisCard` — confidence bar, breakdown(logQuality/timeDecayDeploy/metricAnomaly), HITL/safety badge.
- `EvidenceList` + `EvidenceItem` — 태그별 left border 컬러 (Critical/Warning/Supporting/Context/Conflicting), source type icon(log/metric/event), drilldown link.
- `ActionPlan` — urgency(immediate/verify/followup) + risk(none/low/medium/high) 배지, reversibility mono tag.
- `ExecutiveSummary` — HITL 배지(`ShieldCheck`/`CheckCircle2`), Copy/Send to Slack 버튼.
- `OptimizationCard` — 주황 issue type 배지, mono target location, bg-slate-900 코드 블록, 큰 숫자 `current → estimated`, 초록 impact 배지, 보조 메트릭 2열 grid.

Shared:
- `LogInput` — Terminal/Play icon, 라인/문자 카운터, 에러 표시.
- `LoadingState` — 카드별 skeleton placeholder.

shadcn 원시:
- `alert` · `badge` · `button` · `card` · `dropdown-menu` · `progress` · `separator` · `textarea`.

### 2.4 데이터 shape (새 화면이 이 모양을 유지해야 함)

```ts
interface IncidentAnalysis {
  incidentId: string        // "831827d0ca33" 등
  timestamp: string         // ISO
  sourceDataset: string     // "HDFS Pipeline Output" | "BGL" | "synthetic" ...
  triage: TriageResult      // severity P1..P4 · severityLabel · service · confidence 0..1
  metadata: IncidentMetadata
  hypotheses?: Hypothesis[] // 0..N, 각 confidence 0..1 + breakdown
  evidence?: Evidence[]     // tag: Critical|Warning|Supporting|Context|Conflicting
  actionPlan?: Action[]     // urgency + risk + reversibility
  executiveSummary?: ExecutiveSummary
  hitlStatus?: "Awaiting Approval" | "Auto-Executable"
  analyzedAt?: string
  executiveMarkdown?: string
  optimization?: Optimization  // feature6: N+1 Query + before/after + delta
}
```

---

## 3. 신규 화면 프롬프트 3종

### 3.1 Historical incidents 페이지

> Design a **Historical incidents** page for IncidentCopilot. URL is `/incidents`.
> It lists past incidents so an on-call can scroll through the last 30 days and
> drill into any of them. Keep the existing AppShell — same Sidebar with the
> "Historical" entry active, same topbar.
>
> Layout, left to right:
> - **Filter rail** (280px, sticky, card surface) — severity checkbox (P1-P4 with
>   colored dots), source dataset multi-select, date range preset (24h / 7d / 30d / custom),
>   HITL status pill group (Awaiting Approval / Auto-Executable / Auto-Resolved),
>   service free-text search, reset button.
> - **Results pane** — top strip with KPI tiles in a 4-col grid: Total incidents,
>   P1 count (critical red), Mean time to triage (purple), Auto-resolved % (green).
>   Below it, a dense incidents table with these columns: `severity pill` |
>   `timestamp (mono, relative + absolute on hover)` | `service` | `headline`
>   (truncate at 80 chars, tooltip full) | `hypotheses count` | `HITL badge` |
>   `actions taken` | `chevron →`. Row height 44px, zebra via `bg-muted/20` on
>   odd rows, hover `bg-muted/40`. Severity cells use the same severity rail
>   color as TriageCard's left border.
>
> Empty state: centered icon (`Inbox` from lucide-react), "No incidents match
> these filters", Reset button.
>
> Loading state: 10 skeleton rows matching the table grid.
>
> Right-hand mini timeline (optional, 80px wide): vertical axis = time, dots
> colored by severity, clicking scrolls to row.

### 3.2 Runbook detail 모달

> Design a **Runbook detail modal** that opens when a user clicks an Action in
> `ActionPlan`. It replaces the current inline rationale with a full playbook view.
>
> Modal: 720px wide, max-h-[85vh], rounded-xl, card surface with 1px border,
> backdrop dim via `bg-background/70 backdrop-blur-sm`. Close via `X` top-right
> and Esc key.
>
> Header row: urgency badge + risk badge + reversibility mono chip, then the
> action title as h2 (text-xl semibold). Right side: `Trigger runbook` primary
> button if `hitlStatus === "Auto-Executable"`, else a disabled button with
> `ShieldCheck` icon + tooltip "Awaiting Approval" in `--critical` tint.
>
> Body tabs (shadcn pattern, underline active): **Steps** · **Rationale** ·
> **Rollback plan** · **Evidence used** · **History**.
> - Steps: numbered list, each step has a checkbox (manual tick), command block
>   in mono `bg-slate-900 text-slate-100` when the step is a shell command,
>   inline code for arguments. Estimated duration chip on the right.
> - Rationale: prose, quoted evidence ids chip-linked back to EvidenceList.
> - Rollback plan: mirror of Steps but with red-tinted left border.
> - Evidence used: horizontally scrollable strip of EvidenceItem cards
>   (reuse existing tag colors).
> - History: timeline of prior runs of this runbook — who triggered,
>   success/fail badge, duration, link to incident.
>
> Footer: muted text "Last edited {relative} by {author}", right side
> secondary button `Edit playbook` and primary `Trigger runbook`.
>
> Keep all colors from the existing semantic palette — don't introduce new hues.

### 3.3 Mobile on-call view

> Design a **Mobile on-call view** for IncidentCopilot at viewport 390×844
> (iPhone 14). This is the screen an engineer sees the moment their pager
> fires — it must be readable, thumb-friendly, and cut 80% of desktop density.
>
> Top: compact status bar — `P1` severity pill (filled `--critical` background,
> white text, extra bold), service name on the right, incident id mono small
> in the second line. If `hitlStatus === "Awaiting Approval"` show a full-width
> amber bar below with `ShieldCheck` icon and "Awaiting approval — tap to review".
>
> Primary content: a single vertical scroll, sections in this order, each with
> a 12px collapse chevron on the right:
> 1. **Impact** (always expanded) — one-liner + affected user count chip.
> 2. **Top hypothesis** (always expanded) — title + confidence ring (48px)
>    + "Why" collapsible that shows breakdown.
> 3. **Act now** — 2-3 primary action buttons stacked full-width, 52px tall,
>    each with urgency color, risk badge on the right, tap opens runbook detail
>    as a bottom sheet (85% height).
> 4. **Evidence** — vertical list of EvidenceItem cards, max 5 visible, "See
>    all (N)" link at the end.
> 5. **Executive summary** — headline + 4 collapsible subsections.
>
> Bottom docked action bar (sticky, 72px, safe-area padding): `Acknowledge`
> (secondary), `Escalate` (warning), `Resolve` (success). Each 48px tall.
>
> Typography: reduce h1 to text-lg, body to text-sm, labels to text-[11px].
> Tap targets ≥ 44px. Keep mono for ids/timestamps.
> Same dark theme default, same radial aurora (scaled down).

---

## 4. 제외 / 금지

- `TriageCard` · `HypothesisCard` · `EvidenceItem` · `ActionPlan` · `ExecutiveSummary` · `OptimizationCard` 는 **시각적 변형 금지**. 새 화면에서는 "기존 컴포넌트를 그대로 embed" 한다는 조건으로 배치만 바꾼다.
- 새 색상 hue 추가 금지. 필요하면 기존 토큰을 `/15` `/40` 등 opacity 로 변주.
- shadcn 이 아닌 외부 UI 라이브러리 금지 (Radix 기반 shadcn 만).
- Figma 플러그인 아이콘 사용 금지 — Lucide react 만 (Inbox, Filter, ChevronRight, ShieldCheck, CheckCircle2, Terminal, Play, Sparkles, Zap, Database, HardDrive, Radar).
