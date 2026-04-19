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
  // 팀원 실제 포맷에서 추가로 내려오는 필드들.
  // Template ID 는 incident 고유 식별자로 최상위 incidentId 에 쓰인다.
  "Template ID"?: string
  // "2026-04-18T16:30:00" 또는 파싱 불가 시 "Unknown" 이 올 수 있음.
  "Standard ISO Time"?: string
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

// ===============================================================
// === 팀원 최종 실제 포맷 (data/*.json) 래퍼 ================
// ===============================================================
// 기능 1~5 가 각자 다른 툴로 나오기 때문에 팀원은 결과를 이렇게 묶어서 내려준다:
//   { scenario_name, triage, rca, action_plan, safety_evaluation, summary }
// 각 하위 블록의 안쪽은 기존 TeamIncidentOutput/TeamRootCauseAnalysis 와 호환 가능.

// rca 블록 — 기존 TeamRootCauseAnalysis 를 감싸는 shape
interface TeamRcaBlock {
  root_cause_analysis?: TeamRealRootCauseAnalysis
  [key: string]: unknown
}

// 실제 팀 결과에서 top_hypotheses 의 필드명이 약간 다름.
// - hypothesis (title 대신)
// - total_confidence (confidence 대신)
// - description (reasoning 대신)
// - breakdown 이 내부에 evidence_ids 까지 끼고 있음
// - recovery_workflow 블록에 trigger_id / approval_required / safety_level
interface TeamRealRootCauseAnalysis {
  top_hypotheses?: TeamRealHypothesis[]
  hitl_status?: "Awaiting Approval" | "Auto-Executable"
  analyzed_at?: string
  reasoning_context?: string
  [key: string]: unknown
}

interface TeamRealHypothesis {
  id?: string
  hypothesis?: string
  total_confidence?: number
  description?: string
  verification_steps?: string[]
  breakdown?: {
    "Log Quality"?: number
    "Time-Decay Deploy"?: number
    "Metric Anomaly"?: number
    "Causality Boost"?: number
    evidence_ids?: string[]
    [key: string]: unknown
  }
  recovery_workflow?: {
    trigger_id?: string
    approval_required?: boolean
    // 실제 값은 "High (Manual Approval)" 같이 괄호 주석이 붙은 문자열.
    safety_level?: string
    action_description?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

// 팀원 triage 블록 — TeamIncidentOutput 과 동일한 key 들을 가지지만 log_raw 를 추가로 갖는다.
interface TeamRealTriageBlock {
  "Triage Results"?: TeamTriageResults
  "Context Metadata"?: TeamMetadataBlock
  "Extracted Metadata"?: TeamMetadataBlock
  log_raw?: string
  "Input Log"?: string
  [key: string]: unknown
}

// action_plan 은 단일 runbook. 값이 안 나올 때는 { status: "NO_ACTION_MAPPED", message }.
interface TeamRealActionPlan {
  action_id?: string
  title?: string
  target?: string
  command?: string
  undo_command?: string
  blast_radius?: "Small" | "Medium" | "Large" | string
  reversibility?: string
  risk_score?: number
  parameters?: Record<string, unknown>

  // 매핑 실패시 백업 경로
  status?: string
  message?: string

  [key: string]: unknown
}

interface TeamRealSafetyEvaluation {
  decision?: string
  approval_required?: boolean
  risk_level?: string
  slack_payload?: Record<string, unknown>
  [key: string]: unknown
}

// === 팀원 feature3_evidence.json 배열 엔트리 ===
// 통합 포맷(data/{scenario}.json)에는 이런 풍부한 evidence 배열이 없다.
// feature-split 포맷은 category / delta_ratio / weakens_hypothesis / drilldown_url 등을
// 직접 내려주므로, 어댑터는 이 배열이 있으면 합성 경로 대신 직접 매핑한다.
interface TeamRealEvidenceItem {
  evidence_id?: string
  // "SUPPORT" | "CONTEXT" — 상위 분류. Critical/Warning/Supporting/Context 태그 결정에 쓰임.
  category?: "SUPPORT" | "CONTEXT" | string
  signal_name?: string
  content?: string
  // "Unknown" 이 자주 올라오므로 Date 변환 전에 반드시 가드.
  observed_at?: string
  delta_ratio?: number
  baseline_desc?: string
  policy_desc?: string
  drilldown_url?: string
  aggregation_info?: Record<string, unknown>
  // null / 가설 id 중 하나. null 이 아니면 해당 가설을 약화시키는 반대 근거.
  weakens_hypothesis?: string | null
  [key: string]: unknown
}

interface TeamRealOutput {
  scenario_name?: string
  triage?: TeamRealTriageBlock
  rca?: TeamRcaBlock
  action_plan?: TeamRealActionPlan
  safety_evaluation?: TeamRealSafetyEvaluation
  // 기능 5 출력 — SRE Technical Briefing 마크다운
  summary?: string

  // === feature-split 포맷에서만 오는 추가 블록들 ===
  // feature3_evidence.json 배열. 통합 포맷에는 없음.
  evidence?: TeamRealEvidenceItem[]
  // feature5_summary.json 의 executive_markdown 원문. 통합 포맷에는 없음.
  executive_markdown?: string

  [key: string]: unknown
}

export type {
  TeamIncidentOutput,
  TeamTriageResults,
  TeamMetadataBlock,
  TeamRootCauseAnalysis,
  TeamRealOutput,
  TeamRealRootCauseAnalysis,
  TeamRealHypothesis,
  TeamRealTriageBlock,
  TeamRealActionPlan,
  TeamRealSafetyEvaluation,
  TeamRealEvidenceItem,
}
