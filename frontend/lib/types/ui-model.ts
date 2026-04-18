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
  tag?: "Critical" | "Warning" | "Supporting"
  // metric 기반 증거일 때 baseline / current / delta 표시. 문자열 그대로 UI에 실린다.
  baseline?: string
  current?: string
  delta?: string
}

export interface Action {
  id: string
  action: string
  urgency: "immediate" | "verify" | "followup"
  risk?: "none" | "low" | "medium" | "high"
  rationale?: string
}

export interface ExecutiveSummary {
  headline: string
  impact: string
  suspectedCause: string
  mitigations: string
  prevention: string
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
}
