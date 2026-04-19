// UI 모델(lib/types/ui-model.ts)의 zod 스키마.
// 팀원 원본 포맷은 계속 바뀌므로 스키마를 만들지 않는다.
// 검증은 항상 adapter를 통과해 UI 모델로 변환된 뒤에 실행한다.

import { z } from "zod"

// === Triage ===
export const persistenceStateSchema = z.enum([
  "Starting",
  "Ongoing",
  "Persistent",
  "Transient",
])

export const triagePersistenceSchema = z.object({
  duration: z.number(),
  count: z.number(),
  state: persistenceStateSchema,
})

export const triageResultSchema = z.object({
  service: z.string(),
  severity: z.enum(["P1", "P2", "P3", "P4"]),
  severityLabel: z.string(),
  userImpact: z.string(),
  impactDetail: z.string(),
  errorCategory: z.string(),
  confidence: z.number().min(0).max(1),

  // === 기능 1 확장 (all optional) ===
  compoundScenario: z.string().optional(),
  persistence: triagePersistenceSchema.optional(),
})

// === Metadata ===
export const incidentMetadataSchema = z.object({
  logTemplate: z.string(),
  identifiers: z.object({
    component: z.string().optional(),
    ipAddresses: z.array(z.string()).optional(),
    ports: z.array(z.string()).optional(),
  }),
  rawLogSample: z.string(),
})

// === Hypothesis ===
export const hypothesisBreakdownSchema = z.object({
  logQuality: z.number().min(0).max(1),
  timeDecayDeploy: z.number().min(0).max(1),
  metricAnomaly: z.number().min(0).max(1),
})

export const hitlStatusSchema = z.enum([
  "Awaiting Approval",
  "Auto-Executable",
])

export const hypothesisSchema = z.object({
  id: z.string(),
  title: z.string(),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string()),
  reasoning: z.string().optional(),

  // === 기능 2 확장 (all optional) ===
  breakdown: hypothesisBreakdownSchema.optional(),
  safetyLevel: z.enum(["High", "Low"]).optional(),
  hitlStatus: hitlStatusSchema.optional(),
  approvalRequired: z.boolean().optional(),
  triggerId: z.string().optional(),
})

// === Evidence ===
// Context / Conflicting 은 feature-split 포맷(feature3_evidence.json)에서 유도되는 신규 태그.
// UI 에 아직 대응되는 배지가 없을 수 있으므로 adapter 는 채우지만 렌더는 fallback 으로 처리.
export const evidenceTagSchema = z.enum([
  "Critical",
  "Warning",
  "Supporting",
  "Context",
  "Conflicting",
])

export const evidenceSchema = z.object({
  id: z.string(),
  text: z.string(),
  sourceLogLine: z.number().optional(),
  sourceLogSnippet: z.string().optional(),
  timestamp: z.string().optional(),

  // === 기능 2 확장 (all optional) ===
  tag: evidenceTagSchema.optional(),
  baseline: z.string().optional(),
  current: z.string().optional(),
  delta: z.string().optional(),
  sourceType: z.enum(["log", "metric", "event"]).optional(),
  drilldownUrl: z.string().optional(),
})

// === Action ===
export const actionSchema = z.object({
  id: z.string(),
  action: z.string(),
  urgency: z.enum(["immediate", "verify", "followup"]),
  risk: z.enum(["none", "low", "medium", "high"]).optional(),
  rationale: z.string().optional(),
  // 팀원 action_plan.reversibility 를 별도 필드로 노출 ("Full"/"Partial"/"Irreversible" 등).
  reversibility: z.string().optional(),
})

// === Executive summary ===
export const executiveSummarySchema = z.object({
  headline: z.string(),
  impact: z.string(),
  suspectedCause: z.string(),
  mitigations: z.string(),
  prevention: z.string(),
})

// === Optimization (feature 6) ===
// issueType 은 enum 으로 안 막는다 — 백엔드가 새 안티패턴을 내려도 500 안 나게.
export const optimizationOtherMetricSchema = z.object({
  name: z.string(),
  before: z.string(),
  after: z.string(),
  gain: z.string(),
})

export const optimizationPerformanceDeltaSchema = z.object({
  metric: z.string(),
  current: z.string(),
  estimated: z.string(),
  impact: z.string(),
  otherMetrics: z.array(optimizationOtherMetricSchema).optional(),
})

export const optimizationSchema = z.object({
  targetLocation: z.string(),
  issueType: z.string(),
  description: z.string(),
  refactoringSuggestion: z.string(),
  performanceDelta: optimizationPerformanceDeltaSchema,
})

// === Top-level ===
export const incidentAnalysisSchema = z.object({
  incidentId: z.string(),
  timestamp: z.string(),
  sourceDataset: z.string(),
  triage: triageResultSchema,
  metadata: incidentMetadataSchema,
  hypotheses: z.array(hypothesisSchema).optional(),
  evidence: z.array(evidenceSchema).optional(),
  actionPlan: z.array(actionSchema).optional(),
  executiveSummary: executiveSummarySchema.optional(),

  // === 기능 2/4 확장 (all optional) ===
  hitlStatus: hitlStatusSchema.optional(),
  analyzedAt: z.string().optional(),

  // === 기능 5 확장 (all optional) ===
  // feature5_summary.json 의 executive_markdown 원문.
  executiveMarkdown: z.string().optional(),

  // === 기능 6 확장 (all optional) ===
  // feature6_optimization.json 파싱 결과. 없으면 OptimizationCard 가 렌더되지 않음.
  optimization: optimizationSchema.optional(),
})
