// Runtime smoke test: for each scenario key, run loader → adapter pipeline →
// schema validation, and print the compact UI model.
//
//   cd frontend && npx tsx scripts/smoke-real-data.ts
//
// Exit code 1 if any scenario fails schema validation.
//
// 로딩 로직은 lib/adapters/loader.ts, 조립 로직은 lib/pipeline/assemble-incident.ts 에 있고,
// 라우트와 동일한 함수를 그대로 불러 쓴다 — 스모크에서 통과하면 프로덕션 라우트도 통과한다.

import { loadFromFeatureFiles, loadIntegrated } from "../lib/adapters/loader"
import { assembleFromRealOutput } from "../lib/pipeline/assemble-incident"
import {
  isFeatureSplitScenario,
  SCENARIO_KEYS,
  type ScenarioKey,
} from "../lib/pipeline/scenarios"
import { incidentAnalysisSchema } from "../lib/schema"
import type { TeamRealOutput } from "../lib/types"

async function loadFor(scenario: ScenarioKey): Promise<TeamRealOutput> {
  if (isFeatureSplitScenario(scenario)) return loadFromFeatureFiles()
  return loadIntegrated(scenario)
}

async function run(): Promise<void> {
  let anyFailed = false

  for (const scenario of SCENARIO_KEYS) {
    let raw: TeamRealOutput
    try {
      raw = await loadFor(scenario)
    } catch (err) {
      console.error(`✗ ${scenario}: load failed`)
      console.error(`   ${err instanceof Error ? err.message : err}`)
      anyFailed = true
      continue
    }

    const result = assembleFromRealOutput(scenario, raw)

    const validated = incidentAnalysisSchema.safeParse(result)
    if (!validated.success) {
      console.error(`✗ ${scenario}: schema validation failed`)
      for (const issue of validated.error.issues) {
        console.error(
          `   - ${issue.path.length > 0 ? issue.path.join(".") : "<root>"}: ${issue.message}`
        )
      }
      anyFailed = true
      continue
    }

    console.log(`✓ ${scenario}`)
    console.log(
      `   top fields   : incidentId="${result.incidentId}" timestamp="${result.timestamp}" sourceDataset="${result.sourceDataset}"`
    )
    console.log(
      `   triage       : ${result.triage.service} | ${result.triage.severity} · ${result.triage.severityLabel} | ${Math.round(
        result.triage.confidence * 100
      )}%${result.triage.compoundScenario ? " | compound ✓" : ""}`
    )
    console.log(
      `   hypotheses   : ${(result.hypotheses ?? []).length} — top: "${
        result.hypotheses?.[0]?.title ?? "-"
      }" (${Math.round((result.hypotheses?.[0]?.confidence ?? 0) * 100)}%)`
    )
    const top = result.hypotheses?.[0]
    if (top?.breakdown) {
      console.log(
        `   breakdown    : logQ=${top.breakdown.logQuality} tDeploy=${top.breakdown.timeDecayDeploy} metric=${top.breakdown.metricAnomaly}`
      )
    }
    console.log(
      `   evidence     : ${(result.evidence ?? []).length} — ${
        (result.evidence ?? [])
          .map((e) => `${e.id}${e.tag ? `[${e.tag}]` : ""}`)
          .join(", ") || "-"
      }`
    )
    console.log(
      `   actions      : ${(result.actionPlan ?? []).length} — top: "${
        result.actionPlan?.[0]?.action ?? "-"
      }" (${result.actionPlan?.[0]?.urgency ?? "-"}/${result.actionPlan?.[0]?.risk ?? "-"})${
        result.actionPlan?.[0]?.reversibility
          ? ` | reversibility=${result.actionPlan[0].reversibility}`
          : ""
      }`
    )
    console.log(
      `   hitl         : ${result.hitlStatus ?? "-"}  analyzedAt: ${result.analyzedAt ?? "-"}`
    )
    console.log(
      `   summary head : ${result.executiveSummary?.headline.slice(0, 80) ?? "-"}`
    )
    if (result.executiveMarkdown) {
      console.log(
        `   exec md      : ${result.executiveMarkdown.slice(0, 80).replace(/\n/g, " ⏎ ")}${
          result.executiveMarkdown.length > 80 ? "…" : ""
        }`
      )
    }
    console.log("")
  }

  if (anyFailed) {
    process.exit(1)
  }
}

run().catch((err) => {
  console.error("smoke-real-data crashed:", err)
  process.exit(1)
})
