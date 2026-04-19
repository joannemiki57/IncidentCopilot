// 팀원 data/ 폴더에는 두 가지 모양의 결과가 공존한다:
//
// (A) 통합 포맷  : data/{scenario}.json
//     - 하나의 JSON 에 scenario_name / triage / rca / action_plan / safety_evaluation / summary 가 전부 들어있음.
//     - 기존 3개 샘플 시나리오 (db-saturation / hdfs-failure / bgl-hardware) 가 여기에 해당.
//
// (B) feature-split 포맷: data/feature1_triage.json .. feature5_summary.json
//     - 실제 파이프라인 5단계가 각자 파일로 쪼개져 있다.
//     - 알맹이(triage / rca 내부 구조) 는 통합 포맷과 동일. 래퍼만 다르다.
//     - feature3 은 풍부한 evidence 배열(CONTEXT / weakens_hypothesis 포함)을 직접 제공.
//     - feature5 는 sre_markdown + executive_markdown 두 종류 마크다운.
//
// 이 모듈의 책임:
//   - 두 포맷을 동일한 TeamRealOutput 구조로 정규화해서 반환.
//   - 정규화된 결과는 기존 어댑터들이 그대로 소비할 수 있어야 한다 (시그니처 변경 금지).
//   - 파일 읽기 / JSON 파싱 실패는 호출자에게 예외로 전파 (라우트에서 폴백 결정).
//
// 주의:
//   - data/logs/feature*.json 은 data/feature*.json 의 중복본이므로 loader 는 data/ 만 읽는다.
//   - feature-split 포맷엔 scenario_name 이 없어서 "latest" 로 하드코딩한다.

import { readFile } from "node:fs/promises"
import { join } from "node:path"

import type {
  TeamRealActionPlan,
  TeamRealEvidenceItem,
  TeamRealOptimization,
  TeamRealOutput,
  TeamRealRootCauseAnalysis,
  TeamRealSafetyEvaluation,
  TeamRealTriageBlock,
} from "../types"
import {
  SCENARIO_FILES,
  type IntegratedScenarioKey,
} from "../pipeline/scenarios"

// feature-split 각 파일의 파일명. data/ 기준 상대경로로 사용.
const FEATURE_FILES = {
  triage: "feature1_triage.json",
  rca: "feature2_rca.json",
  evidence: "feature3_evidence.json",
  actionPlan: "feature4_action_plan.json",
  summary: "feature5_summary.json",
  // feature6 은 백엔드 초기 버전에선 feature5 SRE 마크다운에 inline embed 되던 블록이었는데,
  // 별도 파일로 분리됐다. 파일이 아직 안 내려오는 환경도 있을 수 있어 loader 가 방어적으로 읽는다.
  optimization: "feature6_optimization.json",
} as const

// data/feature6_optimization.json 을 조용히 읽는다.
// 파일이 아예 없거나 JSON 파싱에 실패하면 undefined 반환 → 카드 자체가 렌더되지 않음.
// (기능 1~5 와 달리 feature6 은 파이프라인 필수 출력이 아니라 선택 블록이라 이 정책이 적절.)
export async function loadOptimizationFileOptional(): Promise<
  TeamRealOptimization | undefined
> {
  const path = join(dataDir(), FEATURE_FILES.optimization)
  try {
    return await readJson<TeamRealOptimization>(path)
  } catch (err) {
    // ENOENT / JSON parse 모두 여기로. 로그만 남기고 undefined.
    const code = (err as NodeJS.ErrnoException)?.code
    if (code !== "ENOENT") {
      console.warn(
        `[loader] optional feature6 read failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
    return undefined
  }
}

// frontend/ 에서 한 단계 위로 올라가면 incident-copilot/data/ 디렉터리.
// route.ts 는 process.cwd() 가 frontend/ 이고, 스크립트에서 쓸 때도 동일.
function dataDir(): string {
  return join(process.cwd(), "..", "data")
}

async function readJson<T = unknown>(path: string): Promise<T> {
  const text = await readFile(path, "utf-8")
  return JSON.parse(text) as T
}

// ==================================================================
// (A) 통합 포맷 로더 — 기존 라우트 경로.
// ==================================================================

export async function loadIntegrated(
  scenario: IntegratedScenarioKey
): Promise<TeamRealOutput> {
  const filename = SCENARIO_FILES[scenario]
  const path = join(dataDir(), filename)
  // 통합 포맷 파일에 optimization 이 inline 으로 들어있을 수도 있고,
  // 별도 파일로 분리됐을 수도 있다. 파일 내부가 우선, 없으면 feature6 파일로 보강.
  const base = await readJson<TeamRealOutput>(path)
  if (!base.optimization) {
    const extra = await loadOptimizationFileOptional()
    if (extra) base.optimization = extra
  }
  return base
}

// ==================================================================
// (B) feature-split 로더 — feature1..5 를 한 TeamRealOutput 으로 합친다.
// ==================================================================

// feature4 래퍼: { plan, safety_evaluation } → plan 쪽만 풀어서 action_plan 슬롯에 넣는다.
interface Feature4Wrapper {
  plan?: TeamRealActionPlan
  safety_evaluation?: TeamRealSafetyEvaluation
  [key: string]: unknown
}

// feature5 래퍼: { sre_markdown, executive_markdown }.
// 기존 executive-summary-adapter 는 raw.summary 를 읽으므로 sre_markdown 을 summary 에 꽂아 호환.
interface Feature5Wrapper {
  sre_markdown?: string
  executive_markdown?: string
  [key: string]: unknown
}

// feature2 래퍼: { root_cause_analysis: {...} } — 이미 TeamRcaBlock 과 호환되는 구조.
interface Feature2Wrapper {
  root_cause_analysis?: TeamRealRootCauseAnalysis
  [key: string]: unknown
}

export async function loadFromFeatureFiles(): Promise<TeamRealOutput> {
  const base = dataDir()

  // 병렬 로드로 지연 최소화. 한 파일이라도 실패하면 Promise.all 이 reject → 상위에서 폴백.
  // feature6 은 optional 이라 따로 try/catch 로 감싼 loadOptimizationFileOptional 로 읽는다.
  const [triage, rca, evidence, actionPlanWrapper, summaryWrapper, optimization] =
    await Promise.all([
      readJson<TeamRealTriageBlock>(join(base, FEATURE_FILES.triage)),
      readJson<Feature2Wrapper>(join(base, FEATURE_FILES.rca)),
      readJson<TeamRealEvidenceItem[]>(join(base, FEATURE_FILES.evidence)),
      readJson<Feature4Wrapper>(join(base, FEATURE_FILES.actionPlan)),
      readJson<Feature5Wrapper>(join(base, FEATURE_FILES.summary)),
      loadOptimizationFileOptional(),
    ])

  const merged: TeamRealOutput = {
    // feature-split 파일들엔 scenario_name 이 없어서 고정값으로 태그.
    // 라우트는 이 값을 쓰지 않고 시나리오 키로부터 DATASET_LABELS 을 뽑는다.
    scenario_name: "latest",
    triage,
    rca: {
      root_cause_analysis: rca.root_cause_analysis,
    },
    action_plan: actionPlanWrapper.plan,
    safety_evaluation: actionPlanWrapper.safety_evaluation,
    // 기존 executive-summary-adapter 는 raw.summary 를 마크다운으로 읽으므로
    // sre_markdown 을 summary 슬롯에 매핑해 호환성을 유지한다.
    summary:
      typeof summaryWrapper.sre_markdown === "string"
        ? summaryWrapper.sre_markdown
        : undefined,
    // feature-split 전용 필드.
    evidence: Array.isArray(evidence) ? evidence : undefined,
    executive_markdown:
      typeof summaryWrapper.executive_markdown === "string"
        ? summaryWrapper.executive_markdown
        : undefined,
    // feature6_optimization.json 이 없으면 undefined 로 조용히 흘려보낸다.
    optimization,
  }

  return merged
}
