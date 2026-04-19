// 팀원 실제 출력(TeamRealOutput) → UI IncidentAnalysis 조립 파이프라인.
//
// route.ts 와 scripts/smoke-real-data.ts 가 공통으로 사용한다.
// 여기서는 네트워크/파일시스템을 건드리지 않는 "순수 함수" 만 둔다.
//
// 입력 TeamRealOutput 은 loader 가 이미 정규화한 결과 — 통합 포맷이든 feature-split 이든
// 여기서는 동일한 모양이라 구분할 필요 없다.

import type { ScenarioKey } from "./scenarios"
import {
  adaptTeamActionPlan,
  adaptTeamEvidence,
  adaptTeamExecutiveSummary,
  adaptTeamHypotheses,
  adaptTeamMetadata,
  adaptTeamOptimization,
  adaptTeamTriage,
} from "../adapters"
import type { IncidentAnalysis, TeamRealOutput } from "../types"
import { DATASET_LABELS } from "./scenarios"

export function assembleFromRealOutput(
  scenario: ScenarioKey,
  raw: TeamRealOutput
): IncidentAnalysis {
  const triage = adaptTeamTriage(raw)
  const metadata = adaptTeamMetadata(raw)
  const hypotheses = adaptTeamHypotheses(raw)
  const evidence = adaptTeamEvidence(raw)
  const actionPlan = adaptTeamActionPlan(raw)
  const executiveSummary = adaptTeamExecutiveSummary(raw, triage, hypotheses)
  const optimization = adaptTeamOptimization(raw)

  const rca = raw.rca?.root_cause_analysis
  const hitl = rca?.hitl_status
  const analyzedAt = rca?.analyzed_at

  // incidentId 우선순위: Context Metadata.Template ID > scenario fallback.
  const ctxMeta = raw.triage?.["Context Metadata"]
  const templateId = ctxMeta?.["Template ID"]
  const incidentId =
    typeof templateId === "string" && templateId.length > 0
      ? templateId
      : `inc-${scenario}`

  // timestamp 우선순위: Context Metadata."Standard ISO Time" (단, "Unknown" 은 버림)
  //                     > analyzed_at > now().
  const standardIsoTime = ctxMeta?.["Standard ISO Time"]
  const isValidIso =
    typeof standardIsoTime === "string" &&
    standardIsoTime.length > 0 &&
    standardIsoTime !== "Unknown"
  const timestamp = isValidIso
    ? standardIsoTime
    : typeof analyzedAt === "string" && analyzedAt.length > 0
    ? analyzedAt
    : new Date().toISOString()

  const result: IncidentAnalysis = {
    incidentId,
    timestamp,
    sourceDataset: DATASET_LABELS[scenario],
    triage,
    metadata,
    hypotheses: hypotheses.length > 0 ? hypotheses : undefined,
    evidence: evidence.length > 0 ? evidence : undefined,
    actionPlan: actionPlan.length > 0 ? actionPlan : undefined,
    executiveSummary,
  }

  if (hitl === "Awaiting Approval" || hitl === "Auto-Executable") {
    result.hitlStatus = hitl
  }
  if (typeof analyzedAt === "string" && analyzedAt.length > 0) {
    result.analyzedAt = analyzedAt
  }
  // feature-split 포맷에서만 내려오는 executive_markdown 을 그대로 통과시킨다.
  // UI 가 알아서 렌더 (현재는 보관만, 후속 작업에서 시각화).
  if (
    typeof raw.executive_markdown === "string" &&
    raw.executive_markdown.length > 0
  ) {
    result.executiveMarkdown = raw.executive_markdown
  }
  // feature6 최적화 블록: adapter 가 유효성 검사 통과한 경우에만 붙인다.
  // null 이면 OptimizationCard 자체가 렌더되지 않음.
  if (optimization) {
    result.optimization = optimization
  }

  return result
}

// 팀원 실제 포맷인지 간단 확인. scenario_name / triage / rca 중 하나만 있어도 수용.
export function looksLikeTeamRealOutput(raw: unknown): raw is TeamRealOutput {
  if (!raw || typeof raw !== "object") return false
  const o = raw as Record<string, unknown>
  return "rca" in o || "triage" in o || "scenario_name" in o
}
