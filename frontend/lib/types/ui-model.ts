// === LOCKED === 팀원 기능 1 기반, 구조 변경 금지 (기존 필드만)
// 하지만 기능 1/2 확장 대응을 위해 optional 필드는 추가 가능하다.
export interface TriageResult {
  service: string
  severity: "P1" | "P2" | "P3" | "P4"
  severityLabel: string
  userImpact: string
  impactDetail: string
  errorCategory: string
  confidence: number

  // === 기능 1 확장 (all optional) ===
  // 예: "Scenario 4: Retry Storm (transient network delay ⇒ client retries flood ⇒ server overwhelmed)"
  compoundScenario?: string
  // 동일 에러의 지속성 / 누적 특성. 값은 팀원 원본 "Persistence" 블록에서 유도.
  persistence?: {
    duration: number
    count: number
    state: "Starting" | "Ongoing" | "Persistent" | "Transient"
  }
}

export interface IncidentMetadata {
  logTemplate: string
  identifiers: {
    component?: string
    ipAddresses?: string[]
    ports?: string[]
  }
  rawLogSample: string
}

// === DRAFT === UI 작업용 초안, 변경 가능
export interface Hypothesis {
  id: string
  title: string
  confidence: number
  evidenceIds: string[]
  reasoning?: string

  // === 기능 2 확장 (all optional) ===
  // confidence 를 구성하는 하위 점수 breakdown. 합이 대체로 1 근처.
  breakdown?: {
    logQuality: number
    timeDecayDeploy: number
    metricAnomaly: number
  }
  // 이 가설을 근거로 자동 실행을 허용할 수 있는 수준
  safetyLevel?: "High" | "Low"
  // Human-in-the-loop 게이트 상태 (기능 4/5 연결)
  hitlStatus?: "Awaiting Approval" | "Auto-Executable"
  // 자동 실행 전 사람 승인이 필요한지
  approvalRequired?: boolean
  // 기능 4 (runbook trigger) 로 넘길 때 사용하는 id
  triggerId?: string
}

export interface Evidence {
  id: string
  text: string
  sourceLogLine?: number
  sourceLogSnippet?: string
  timestamp?: string

  // === 기능 2 확장 (all optional) ===
  // 팀원 raw 포맷의 [Critical] / [Warning] / [Supporting] 접두어에서 뽑는다.
  // feature-split 포맷에서는 category+delta_ratio+weakens_hypothesis 조합으로 유도:
  //   SUPPORT & delta>=10 → Critical, SUPPORT & delta>=2 → Warning, SUPPORT → Supporting,
  //   CONTEXT → Context, weakens_hypothesis !== null → Conflicting.
  // UI 에 Context/Conflicting 표시가 아직 없다면 태그만 들어가고 스타일은 fallback.
  tag?: "Critical" | "Warning" | "Supporting" | "Context" | "Conflicting"
  // metric 기반 증거일 때 baseline / current / delta 표시. 문자열 그대로 UI에 실린다.
  baseline?: string
  current?: string
  delta?: string
  // 팀원 실제 포맷에서 evidence_id 접두어로 구분되는 원천 타입 (LOG-/METRIC-/EVENT-).
  // 아이콘 / 배지 차등 렌더에 쓰기 위한 force-taxonomy.
  sourceType?: "log" | "metric" | "event"
  // 드릴다운 링크 (grafana:// kibana:// 등). feature3_evidence 에서 직접 전달됨.
  drilldownUrl?: string
}

export interface Action {
  id: string
  action: string
  urgency: "immediate" | "verify" | "followup"
  risk?: "none" | "low" | "medium" | "high"
  rationale?: string

  // === 기능 4 확장 (all optional) ===
  // 팀원 action_plan.reversibility 그대로 ("Full" / "Partial" / "Irreversible" 등).
  // rationale 내부에도 요약 문구로 들어가지만, 별도 필드로 노출해 UI 가 배지 등에서 직접 쓸 수 있게 한다.
  reversibility?: string
}

export interface ExecutiveSummary {
  headline: string
  impact: string
  suspectedCause: string
  mitigations: string
  prevention: string
}

// === 기능 6: AI-driven Code Optimization ===
// 팀원 feature6_optimization.json 출력. 사고 대응 이후 "코드 레벨에서 어떻게
// 고쳐야 같은 사고가 재발 안 하는지"를 정량 델타 + 코드 스니펫으로 제안.
// 기존 actionPlan (런북 레벨) 과 분리된 별도 도메인이라 독립 카드로 노출한다.
export interface OptimizationPerformanceDelta {
  metric: string
  current: string
  estimated: string
  // "79.2% reduction" 같은 표현 그대로. UI 는 이 문자열을 배지로 쓴다.
  impact: string
  // 보조 지표들 (DB Queries, CPU Usage 등) — 패턴에 따라 0~N개. 비면 grid 자체 생략.
  otherMetrics?: Array<{
    name: string
    before: string
    after: string
    gain: string
  }>
}

export interface Optimization {
  // 예: "DatabaseServiceService.java -> getDetails()"
  targetLocation: string
  // "N+1 Query" | "Memory Leak" | "Heavy Computing" | "Generic Inefficiency" | 기타.
  // enum 으로 안 막는 이유: 백엔드가 새로운 안티패턴을 추가해도 프론트가 터지지 않도록.
  issueType: string
  description: string
  // 개행 포함 코드 스니펫 원문. 주석 (// ...) 과 실제 코드가 섞여 내려옴.
  refactoringSuggestion: string
  performanceDelta: OptimizationPerformanceDelta
}

// === TBD === Track B 실험 후 확정
// - hypothesis.confidence 타입 (number vs enum) 미확정
// - evidence와 hypothesis 연결 방식 확정 필요

// 최상위 타입
export interface IncidentAnalysis {
  incidentId: string
  timestamp: string
  sourceDataset: string
  triage: TriageResult
  metadata: IncidentMetadata
  hypotheses?: Hypothesis[]
  evidence?: Evidence[]
  actionPlan?: Action[]
  executiveSummary?: ExecutiveSummary

  // === 기능 2/4 확장 (all optional) ===
  // 전체 분석의 HITL 상태. 가설별 hitlStatus 의 집계 / override.
  hitlStatus?: "Awaiting Approval" | "Auto-Executable"
  // 분석이 돌아간 시점 (incident 발생 시점과 분리).
  analyzedAt?: string

  // === 기능 5 확장 (all optional) ===
  // 팀원 feature5_summary.json 의 executive_markdown 원문. executiveSummary 와 달리
  // 사람이 읽는 이그제큐티브용 요약. UI 가 rendering 방식을 자유롭게 선택하도록 원문 그대로 전달.
  executiveMarkdown?: string

  // === 기능 6 확장 (all optional) ===
  // 팀원 feature6_optimization.json 의 파싱 결과. 없으면 OptimizationCard 자체가 렌더되지 않음.
  optimization?: Optimization
}
