// 팀원의 기능 2 (root_cause_analysis.top_hypotheses) → UI Hypothesis[] 변환.
//
// breakdown 이 object 로 올 수도 있고, 팀 포맷이 아직 고정되지 않아서
// "0.4 * logQuality + 0.3 * timeDecayDeploy + 0.3 * metricAnomaly" 같은
// 수식 문자열로 올 수도 있어서 두 경우 모두 파싱한다.

import type { Hypothesis, TeamIncidentOutput } from "../types"

type RawHypothesis = NonNullable<
  NonNullable<TeamIncidentOutput["root_cause_analysis"]>["top_hypotheses"]
>[number]

export function adaptTeamHypotheses(raw: TeamIncidentOutput): Hypothesis[] {
  const list = raw.root_cause_analysis?.top_hypotheses
  if (!Array.isArray(list)) return []

  return list
    .map((h, index) => adaptSingleHypothesis(h, index))
    .filter((h): h is Hypothesis => h !== null)
}

function adaptSingleHypothesis(
  raw: RawHypothesis,
  index: number
): Hypothesis | null {
  const title = typeof raw.title === "string" ? raw.title : undefined
  if (!title) {
    // title 없는 가설은 UI에 쓸 수 없으므로 버린다.
    return null
  }

  const base: Hypothesis = {
    id: typeof raw.id === "string" ? raw.id : `h${index + 1}`,
    title,
    confidence: clamp01(
      typeof raw.confidence === "number" ? raw.confidence : 0.5
    ),
    evidenceIds: Array.isArray(raw.evidence_ids)
      ? raw.evidence_ids.filter((x): x is string => typeof x === "string")
      : [],
  }

  if (typeof raw.reasoning === "string" && raw.reasoning.length > 0) {
    base.reasoning = raw.reasoning
  }

  const breakdown = parseBreakdown(raw.breakdown)
  if (breakdown) {
    base.breakdown = breakdown
  }

  if (raw.safety_level === "High" || raw.safety_level === "Low") {
    base.safetyLevel = raw.safety_level
  }

  if (
    raw.hitl_status === "Awaiting Approval" ||
    raw.hitl_status === "Auto-Executable"
  ) {
    base.hitlStatus = raw.hitl_status
  }

  if (typeof raw.approval_required === "boolean") {
    base.approvalRequired = raw.approval_required
  }

  if (typeof raw.trigger_id === "string" && raw.trigger_id.length > 0) {
    base.triggerId = raw.trigger_id
  }

  return base
}

// breakdown 파서.
// 수식 문자열: "0.4 * logQuality + 0.3 * timeDecayDeploy + 0.3 * metricAnomaly"
// object: { logQuality: 0.4, timeDecayDeploy: 0.3, metricAnomaly: 0.3 }
// 둘 중 하나든 아니든, 3개 가중치를 모두 얻어내지 못하면 undefined.
export function parseBreakdown(
  raw: unknown
): Hypothesis["breakdown"] | undefined {
  if (!raw) return undefined

  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>
    const logQuality = toNumber(obj.logQuality)
    const timeDecayDeploy = toNumber(obj.timeDecayDeploy)
    const metricAnomaly = toNumber(obj.metricAnomaly)
    if (
      logQuality !== undefined &&
      timeDecayDeploy !== undefined &&
      metricAnomaly !== undefined
    ) {
      return { logQuality, timeDecayDeploy, metricAnomaly }
    }
    return undefined
  }

  if (typeof raw === "string") {
    return parseBreakdownFormula(raw)
  }

  return undefined
}

// "0.4 * logQuality + 0.3 * timeDecayDeploy + 0.3 * metricAnomaly" 같은 수식에서
// 각 계수 3개를 뽑는다. 계수 누락 / 다른 이름이 섞여있어도 안전하게 fallback.
export function parseBreakdownFormula(
  formula: string
): Hypothesis["breakdown"] | undefined {
  const NAMES = ["logQuality", "timeDecayDeploy", "metricAnomaly"] as const
  const result: Record<(typeof NAMES)[number], number | undefined> = {
    logQuality: undefined,
    timeDecayDeploy: undefined,
    metricAnomaly: undefined,
  }

  for (const name of NAMES) {
    // number * name  또는  name * number  형태 둘 다 매칭.
    const pattern = new RegExp(
      `(\\d+(?:\\.\\d+)?)\\s*\\*\\s*${name}|${name}\\s*\\*\\s*(\\d+(?:\\.\\d+)?)`
    )
    const match = formula.match(pattern)
    if (match) {
      const val = parseFloat(match[1] ?? match[2] ?? "")
      if (!Number.isNaN(val)) result[name] = clamp01(val)
    }
  }

  if (
    result.logQuality !== undefined &&
    result.timeDecayDeploy !== undefined &&
    result.metricAnomaly !== undefined
  ) {
    return {
      logQuality: result.logQuality,
      timeDecayDeploy: result.timeDecayDeploy,
      metricAnomaly: result.metricAnomaly,
    }
  }

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
