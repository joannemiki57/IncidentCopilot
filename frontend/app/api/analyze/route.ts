// /api/analyze
//
// 두 가지 입력 포맷을 모두 지원한다:
//   1) 통합 포맷  (data/{scenario}.json) — scenarioHint: db-saturation / hdfs-failure / bgl-hardware
//   2) feature-split (data/feature1..5.json) — scenarioHint: "latest"
//
// 어느 쪽이든 loader 가 통일된 TeamRealOutput 구조로 정규화해 주고, 이후 조립 로직은 동일.
// 실제 파일 읽기/조립이 실패하면 mocks/ui/*.json 으로 폴백한다
// (latest 에는 대응되는 mock 이 없으므로 fallback 시 hdfs-failure mock 으로 내려준다).
//
// 조립 로직 자체는 lib/pipeline/assemble-incident.ts 에 있으며,
// 라우트와 scripts/smoke-real-data.ts 가 같은 구현을 공유한다.

import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { NextRequest, NextResponse } from "next/server"

import { loadFromFeatureFiles, loadIntegrated } from "@/lib/adapters/loader"
import {
  assembleFromRealOutput,
  looksLikeTeamRealOutput,
} from "@/lib/pipeline/assemble-incident"
import {
  isFeatureSplitScenario,
  resolveScenario,
  SCENARIO_FILES,
  SCENARIO_KEYS,
  type IntegratedScenarioKey,
  type ScenarioKey,
} from "@/lib/pipeline/scenarios"
import { incidentAnalysisSchema } from "@/lib/schema"
import type { TeamRealOutput } from "@/lib/types"

const ARTIFICIAL_DELAY_MS = 1500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// mocks/ui/ 폴백용. feature-split 시나리오("latest") 는 전용 mock 이 없어서 hdfs-failure 로 대체.
function resolveMockPath(scenario: ScenarioKey): string {
  const integratedKey: IntegratedScenarioKey = isFeatureSplitScenario(scenario)
    ? "hdfs-failure"
    : scenario
  return join(process.cwd(), "mocks", "ui", SCENARIO_FILES[integratedKey])
}

async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, "utf-8")
  return JSON.parse(text) as unknown
}

// scenario 키에 맞는 raw TeamRealOutput 을 로드한다.
// 통합 포맷이면 단일 파일, feature-split 이면 5 개 파일 병합.
async function loadRealRaw(
  scenario: ScenarioKey
): Promise<TeamRealOutput> {
  if (isFeatureSplitScenario(scenario)) {
    return loadFromFeatureFiles()
  }
  return loadIntegrated(scenario)
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/analyze",
    method: "POST",
    scenarios: SCENARIO_KEYS,
  })
}

export async function POST(req: NextRequest) {
  const rawBody: unknown = await req.json().catch(() => ({}))
  // 과거 호환: scenarioId / scenarioHint 둘 다 수용. 같은 의미.
  const body = rawBody as { scenarioHint?: unknown; scenarioId?: unknown; logText?: string }
  let hint = body.scenarioHint ?? body.scenarioId
  
  // --- 0) 실시간 분석 요청 처리 (Python API 브릿지) ---
  if (body.logText && body.logText.trim().length > 0) {
    hint = "latest" // 실시간 분석 결과는 항상 feature-split(latest) 경로로 저장됨
    try {
      const pyResp = await fetch("http://localhost:8000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_text: body.logText }),
      })
      if (!pyResp.ok) {
        console.error("[api/analyze] Python backend failed", await pyResp.text())
      }
    } catch (err) {
      console.error("[api/analyze] Failed to reach Python backend", err)
    }
  } else {
    // 실시간 로그가 아닌 샘플 시나리오 로딩 시에는 기존대로 인위적 지연 추가
    await sleep(ARTIFICIAL_DELAY_MS)
  }

  const scenario = resolveScenario(hint)

  // --- 1) 실제 팀원 데이터 시도 ---
  let realRaw: TeamRealOutput | undefined
  let realReadError: string | null = null
  try {
    realRaw = await loadRealRaw(scenario)
  } catch (err) {
    realReadError = err instanceof Error ? err.message : String(err)
  }

  if (realRaw && looksLikeTeamRealOutput(realRaw)) {
    const assembled = assembleFromRealOutput(scenario, realRaw)
    const validated = incidentAnalysisSchema.safeParse(assembled)
    if (validated.success) {
      return NextResponse.json(validated.data)
    }
    // 실제 데이터가 있는데 조립 결과가 스키마 실패. 디버깅용으로 상세 로그를 남기고
    // 폴백을 시도 — 운영에서 UI가 죽는 것보단 mock 으로라도 렌더하는 게 낫다.
    console.error("[api/analyze] real-data schema validation failed", {
      scenario,
      issues: validated.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    })
  } else if (realReadError) {
    console.warn("[api/analyze] real-data read failed, falling back", {
      scenario,
      error: realReadError,
    })
  }

  // --- 2) 폴백: mocks/ui (이미 UI 모델 모양) ---
  const mockPath = resolveMockPath(scenario)
  let mockRaw: unknown
  try {
    mockRaw = await readJson(mockPath)
  } catch (err) {
    return NextResponse.json(
      {
        error: "both_real_and_mock_read_failed",
        scenario,
        realError: realReadError,
        mockError: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }

  const validatedMock = incidentAnalysisSchema.safeParse(mockRaw)
  if (!validatedMock.success) {
    return NextResponse.json(
      {
        error: "mock_schema_validation_failed",
        scenario,
        issues: validatedMock.error.issues.map((issue) => ({
          path: issue.path.length > 0 ? issue.path.join(".") : "<root>",
          message: issue.message,
        })),
      },
      { status: 500 }
    )
  }

  return NextResponse.json(validatedMock.data)
}
