// 팀원 feature6_optimization.json (원본 shape = TeamRealOptimization) 을
// UI 모델 Optimization 으로 변환한다.
//
// 방어 원칙:
// - 원본 필드가 하나라도 비어 있으면 `null` 반환 → 카드 자체가 렌더되지 않음
// - issue_type 은 enum 이 아니라 자유 문자열 → 그대로 흘려보냄 (UI 쪽에서 fallback 처리)
// - performance_delta.other_metrics 는 배열이지만 [] 이어도 정상 — UI 에서 grid 생략
// - other_metrics 내부 각 항목도 필수 필드 (name/before/after/gain) 하나라도 빠지면 드롭

import type {
  Optimization,
  OptimizationPerformanceDelta,
} from "@/lib/types"
import type { TeamRealOutput } from "@/lib/types"

export function adaptTeamOptimization(
  raw: TeamRealOutput
): Optimization | null {
  const block = raw.optimization
  if (!block) return null

  const targetLocation = asNonEmptyString(block.target_location)
  const issueType = asNonEmptyString(block.issue_type)
  const description = asNonEmptyString(block.description)
  const refactoringSuggestion = asNonEmptyString(block.refactoring_suggestion)

  // 최소 4개 문자열 필드 + performance_delta 가 전부 있어야 의미 있는 카드가 됨.
  if (
    !targetLocation ||
    !issueType ||
    !description ||
    !refactoringSuggestion ||
    !block.performance_delta
  ) {
    return null
  }

  const performanceDelta = adaptPerformanceDelta(block.performance_delta)
  if (!performanceDelta) return null

  return {
    targetLocation,
    issueType,
    description,
    refactoringSuggestion,
    performanceDelta,
  }
}

function adaptPerformanceDelta(
  raw: NonNullable<TeamRealOutput["optimization"]>["performance_delta"]
): OptimizationPerformanceDelta | null {
  if (!raw) return null

  const metric = asNonEmptyString(raw.metric)
  const current = asNonEmptyString(raw.current)
  const estimated = asNonEmptyString(raw.estimated)
  const impact = asNonEmptyString(raw.impact)

  if (!metric || !current || !estimated || !impact) return null

  const otherMetrics = Array.isArray(raw.other_metrics)
    ? raw.other_metrics
        .map((m) => {
          const name = asNonEmptyString(m?.name)
          const before = asNonEmptyString(m?.before)
          const after = asNonEmptyString(m?.after)
          const gain = asNonEmptyString(m?.gain)
          if (!name || !before || !after || !gain) return null
          return { name, before, after, gain }
        })
        .filter((m): m is NonNullable<typeof m> => m !== null)
    : []

  return {
    metric,
    current,
    estimated,
    impact,
    // 빈 배열이면 UI 에서 grid 자체를 숨기기 위해 필드 자체를 빼버린다.
    ...(otherMetrics.length > 0 ? { otherMetrics } : {}),
  }
}

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null
  const trimmed = v.trim()
  return trimmed.length > 0 ? v : null
}
