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
export const evidenceTagSchema = z.enum(["Critical", "Warning", "Supporting"])

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
})

// === Action ===
export const actionSchema = z.object({
  id: z.string(),
  action: z.string(),
  urgency: z.enum(["immediate", "verify", "followup"]),
  risk: z.enum(["none", "low", "medium", "high"]).optional(),
  rationale: z.string().optional(),
})

// === Executive summary ===
export const executiveSummarySchema = z.object({
  headline: z.string(),
  impact: z.string(),
  suspectedCause: z.string(),
  mitigations: z.string(),
  prevention: z.string(),
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
})
