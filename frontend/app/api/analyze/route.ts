import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { NextRequest, NextResponse } from "next/server"

import { incidentAnalysisSchema } from "@/lib/schema"

// scenarioHint → mock file mapping. The keys of this map are the allowed scenarioHints.
const SCENARIO_FILES = {
  "db-saturation": "db-saturation.json",
  "hdfs-failure": "hdfs-failure.json",
  "bgl-hardware": "bgl-hardware.json",
} as const

type ScenarioKey = keyof typeof SCENARIO_FILES

const DEFAULT_SCENARIO: ScenarioKey = "db-saturation"
const ARTIFICIAL_DELAY_MS = 1500

function resolveScenario(hint: unknown): ScenarioKey {
  if (typeof hint === "string" && hint in SCENARIO_FILES) {
    return hint as ScenarioKey
  }
  return DEFAULT_SCENARIO
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/analyze",
    method: "POST",
    scenarios: Object.keys(SCENARIO_FILES),
  })
}

export async function POST(req: NextRequest) {
  // Lenient body parsing: continue with fallback scenarioHint even if the body is malformed.
  const rawBody: unknown = await req.json().catch(() => ({}))
  const scenarioHint = (rawBody as { scenarioHint?: unknown })?.scenarioHint
  const scenario = resolveScenario(scenarioHint)

  // Artificial delay to simulate an LLM call.
  await sleep(ARTIFICIAL_DELAY_MS)

  const filePath = join(
    process.cwd(),
    "mocks",
    "ui",
    SCENARIO_FILES[scenario]
  )

  let fileRaw: string
  try {
    fileRaw = await readFile(filePath, "utf-8")
  } catch (err) {
    return NextResponse.json(
      {
        error: "mock_read_failed",
        scenario,
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(fileRaw)
  } catch (err) {
    return NextResponse.json(
      {
        error: "mock_json_parse_failed",
        scenario,
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }

  const validated = incidentAnalysisSchema.safeParse(parsedJson)
  if (!validated.success) {
    return NextResponse.json(
      {
        error: "mock_schema_validation_failed",
        scenario,
        issues: validated.error.issues.map((issue) => ({
          path: issue.path.length > 0 ? issue.path.join(".") : "<root>",
          message: issue.message,
        })),
      },
      { status: 500 }
    )
  }

  return NextResponse.json(validated.data)
}
