// 팀원의 기능 1/2 output을 수용하는 flexible한 타입.
// 실제 포맷은 팀에서 계속 확장되므로 모든 필드를 optional로,
// 미래 필드는 [key: string]: unknown으로 흡수한다.
//
// 이 타입이 절대로 틀리지 않게 하려면 "본 적 있는 모든 필드를 optional로 적고,
// 그 외는 index signature로 받아내는" 패턴을 유지한다. 어댑터 쪽에서만
// 실제 값에 대해 방어적으로 파싱한다.

// === 기능 1: Triage Results 블록 ===
interface TeamTriageResults {
  "Affected Service"?: string
  "Severity Level"?: string
  "User Impact"?: string
  "Impact Details"?: string
  "Error Category"?: string
  "Confidence Score"?: number

  // --- 기능 1 확장 ---
  // multi-label / hierarchical error 분류
  "Primary Category"?: string
  "Detected Categories"?: string[]
  // 동일 에러의 지속성. duration / count / state 어느 쪽이든 올 수 있다고 가정.
  Persistence?: {
    duration?: number
    count?: number
    state?: "Starting" | "Ongoing" | "Persistent" | "Transient"
    [key: string]: unknown
  }
  // compound scenario 설명 문자열
  "Compound Scenario"?: string

  [key: string]: unknown
}

// === 기능 1: 메타데이터 블록 ===
// 기존 "Extracted Metadata" 외에 최신 포맷에서는 "Context Metadata" 키를 쓰는 경우가 있음.
// 둘 다 허용. 어댑터에서 앞의 것 우선으로 merge.
interface TeamMetadataBlock {
  "Log Template"?: string
  Identifiers?: {
    component?: string
    ip_addresses?: string[]
    ports?: string[]
    [key: string]: unknown
  }
  "Standardized Timestamp"?: string
  [key: string]: unknown
}

// === 기능 2: root_cause_analysis 블록 ===
// 가설 + 증거 + 판단 근거를 팀이 묶어서 내려준다.
// top_hypotheses 는 순서대로 1순위, 2순위 ... 의미.
interface TeamRootCauseAnalysis {
  top_hypotheses?: Array<{
    id?: string
    title?: string
    confidence?: number
    evidence_ids?: string[]
    reasoning?: string

    // breakdown 은 "0.4 * logQuality + 0.3 * timeDecayDeploy + 0.3 * metricAnomaly" 같은
    // 수식 문자열로 올 수도 있고, 이미 object 로 올 수도 있어서 둘 다 수용.
    breakdown?:
      | string
      | {
          logQuality?: number
          timeDecayDeploy?: number
          metricAnomaly?: number
          [key: string]: unknown
        }

    safety_level?: "High" | "Low"
    hitl_status?: "Awaiting Approval" | "Auto-Executable"
    approval_required?: boolean
    trigger_id?: string

    [key: string]: unknown
  }>
  evidence?: Array<{
    id?: string
    // 팀 포맷에서 [Critical] / [Warning] / [Supporting] 접두어가 text 앞에 붙어 있다.
    text?: string
    source_log_line?: number
    source_log_snippet?: string
    timestamp?: string
    baseline?: string
    current?: string
    delta?: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

interface TeamIncidentOutput {
  "Input Log"?: string
  "Triage Results"?: TeamTriageResults

  // 같은 의미의 메타데이터 블록이 두 가지 이름으로 올 수 있음.
  "Extracted Metadata"?: TeamMetadataBlock
  "Context Metadata"?: TeamMetadataBlock

  // 기능 2 출력 (있으면 root_cause_analysis 로 내려옴)
  root_cause_analysis?: TeamRootCauseAnalysis

  // 전체 incident 레벨 HITL gating
  hitl_status?: "Awaiting Approval" | "Auto-Executable"
  analyzed_at?: string

  [key: string]: unknown
}

export type {
  TeamIncidentOutput,
  TeamTriageResults,
  TeamMetadataBlock,
  TeamRootCauseAnalysis,
}
