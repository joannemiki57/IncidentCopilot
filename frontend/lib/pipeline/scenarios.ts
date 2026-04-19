// 시나리오 키 / 파일 맵 / 사람이 읽는 라벨을 한 군데로 모아둔다.
// route.ts 와 scripts/smoke-real-data.ts 가 공통으로 사용한다.
//
// 두 가지 포맷이 공존한다:
//   - 통합 포맷   : data/{scenario}.json 하나에 모든 단계가 합쳐져 있다.
//                   db-saturation / hdfs-failure / bgl-hardware 가 여기에 해당.
//   - feature-split: data/feature{1..5}.json 으로 쪼개진 실제 파이프라인 출력.
//                   "latest" 시나리오 키로 노출한다.

export const SCENARIO_FILES = {
  "db-saturation": "db-saturation.json",
  "hdfs-failure": "hdfs-failure.json",
  "bgl-hardware": "bgl-hardware.json",
} as const

// 통합 포맷 시나리오 키. SCENARIO_FILES 의 키와 1:1.
export type IntegratedScenarioKey = keyof typeof SCENARIO_FILES

// feature-split 포맷 전용 시나리오 키 ("latest" 한 개).
export type FeatureSplitScenarioKey = "latest"

// 라우트와 UI가 취급하는 모든 시나리오 키의 합집합.
export type ScenarioKey = IntegratedScenarioKey | FeatureSplitScenarioKey

export const SCENARIO_KEYS = [
  ...(Object.keys(SCENARIO_FILES) as IntegratedScenarioKey[]),
  "latest" as const,
] as ScenarioKey[]

export const DEFAULT_SCENARIO: ScenarioKey = "db-saturation"

// 시나리오 키 → UI 에 노출할 사람이 읽는 데이터셋 라벨.
// 팀원 data/ 에는 이 정보가 명시적으로 없어서 시나리오 키로부터 맵핑.
export const DATASET_LABELS: Record<ScenarioKey, string> = {
  "db-saturation": "synthetic",
  "hdfs-failure": "HDFS",
  "bgl-hardware": "BGL",
  // feature-split 은 실제 파이프라인 최신 출력. 현재는 HDFS 시나리오 기반.
  latest: "HDFS Pipeline Output",
}

export function resolveScenario(hint: unknown): ScenarioKey {
  if (typeof hint !== "string") return DEFAULT_SCENARIO
  if (hint === "latest") return "latest"
  if (hint in SCENARIO_FILES) return hint as IntegratedScenarioKey
  return DEFAULT_SCENARIO
}

// "latest" 인지 타입 가드. feature-split 로더로 분기할 때 쓴다.
export function isFeatureSplitScenario(
  key: ScenarioKey
): key is FeatureSplitScenarioKey {
  return key === "latest"
}
