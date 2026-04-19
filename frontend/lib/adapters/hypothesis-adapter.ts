// 팀원의 최종 실제 포맷 (data/*.json) → UI Hypothesis[] 변환.
//
// 실제 경로: raw.rca.root_cause_analysis.top_hypotheses[]
// 주요 필드 매핑:
//   hypothesis.hypothesis         → title
//   hypothesis.total_confidence   → confidence
//   hypothesis.description        → reasoning
//   hypothesis.id                 → id
//   hypothesis.breakdown          → breakdown + evidenceIds
//     - "Log Quality", "Time-Decay Deploy", "Metric Anomaly" 세 키만 UI 에 반영
//     - "Causality Boost" 는 UI 확장 전까지는 버림
//     - breakdown.evidence_ids    → evidenceIds
//   hypothesis.recovery_workflow.trigger_id         → triggerId
//   hypothesis.recovery_workflow.safety_level       → safetyLevel ("High (...)"/ "Low (...)" 괄호 앞부분만)
//   hypothesis.recovery_workflow.approval_required  → approvalRequired
//   root.hitl_status (상위)                          → hypothesis 레벨에도 복사

import type { Hypothesis, TeamRealHypothesis, TeamRealOutput } from "../types"

export function adaptTeamHypotheses(raw: TeamRealOutput): Hypothesis[] {
  const list = raw.rca?.root_cause_analysis?.top_hypotheses
  if (!Array.isArray(list)) return []

  // top-level hitl_status 를 가설 레벨에도 복사해서 UI 에서 일관되게 뱃지를 그릴 수 있게 한다.
  const parentHitl = raw.rca?.root_cause_analysis?.hitl_status

  return list
    .map((h, index) => adaptSingleHypothesis(h, index, parentHitl))
    .filter((h): h is Hypothesis => h !== null)
}

function adaptSingleHypothesis(
  raw: TeamRealHypothesis,
  index: number,
  parentHitl: "Awaiting Approval" | "Auto-Executable" | undefined
): Hypothesis | null {
  const title = typeof raw.hypothesis === "string" ? raw.hypothesis : undefined
  if (!title) {
    // title(=hypothesis) 없는 가설은 UI에 쓸 수 없으므로 버린다.
    return null
  }

  const breakdown = parseBreakdown(raw.breakdown)

  const base: Hypothesis = {
    id: typeof raw.id === "string" ? raw.id : `h${index + 1}`,
    title,
    confidence: clamp01(
      typeof raw.total_confidence === "number" ? raw.total_confidence : 0.5
    ),
    evidenceIds: extractEvidenceIds(raw.breakdown),
  }

  if (typeof raw.description === "string" && raw.description.length > 0) {
    base.reasoning = raw.description
  }

  if (breakdown) {
    base.breakdown = breakdown
  }

  const safetyLevel = normalizeSafetyLevel(raw.recovery_workflow?.safety_level)
  if (safetyLevel) {
    base.safetyLevel = safetyLevel
  }

  if (typeof raw.recovery_workflow?.approval_required === "boolean") {
    base.approvalRequired = raw.recovery_workflow.approval_required
  }

  if (
    typeof raw.recovery_workflow?.trigger_id === "string" &&
    raw.recovery_workflow.trigger_id.length > 0
  ) {
    base.triggerId = raw.recovery_workflow.trigger_id
  }

  // top-level HITL status 를 가설에도 내려준다.
  if (
    parentHitl === "Awaiting Approval" ||
    parentHitl === "Auto-Executable"
  ) {
    base.hitlStatus = parentHitl
  }

  return base
}

// 실제 breakdown 은 snake-case / 공백 포함 키 이름을 쓴다.
// UI 모델이 카멜케이스 3개만 받으므로 여기서 매핑 + clamp.
export function parseBreakdown(
  raw: TeamRealHypothesis["breakdown"]
): Hypothesis["breakdown"] | undefined {
  if (!raw || typeof raw !== "object") return undefined

  const logQuality = toNumber(raw["Log Quality"])
  const timeDecayDeploy = toNumber(raw["Time-Decay Deploy"])
  const metricAnomaly = toNumber(raw["Metric Anomaly"])

  // 3 개 중 하나라도 모자라면 UI breakdown 자체를 그리지 않는다 (혼란 방지).
  if (
    logQuality === undefined ||
    timeDecayDeploy === undefined ||
    metricAnomaly === undefined
  ) {
    return undefined
  }

  return { logQuality, timeDecayDeploy, metricAnomaly }
}

function extractEvidenceIds(
  raw: TeamRealHypothesis["breakdown"]
): string[] {
  if (!raw || typeof raw !== "object") return []
  const ids = raw.evidence_ids
  if (!Array.isArray(ids)) return []
  return ids.filter((x): x is string => typeof x === "string")
}

// "High (Manual Approval)" / "Low (Auto)" 형태에서 앞의 High/Low 만 뽑아온다.
function normalizeSafetyLevel(
  raw: string | undefined
): "High" | "Low" | undefined {
  if (typeof raw !== "string") return undefined
  const trimmed = raw.trim()
  if (trimmed.startsWith("High")) return "High"
  if (trimmed.startsWith("Low")) return "Low"
  return undefined
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return clamp01(v)
  return undefined
}

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
