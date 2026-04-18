// mocks/ui/*.json을 lib/schema.ts의 incidentAnalysisSchema로 검증한다.
//
// 실행:
//   npx tsx scripts/validate-mocks.ts
//
// 종료 코드:
//   0  모든 mock이 스키마 통과
//   1  최소 하나 실패 (JSON 파싱 실패 또는 스키마 위반)

import { readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { incidentAnalysisSchema } from "@/lib/schema"

const MOCK_FILES = [
  "db-saturation.json",
  "hdfs-failure.json",
  "bgl-hardware.json",
] as const

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, "..")
const mocksDir = join(projectRoot, "mocks", "ui")

let failed = 0

for (const file of MOCK_FILES) {
  const filePath = join(mocksDir, file)
  const displayPath = relative(projectRoot, filePath)

  let raw: string
  try {
    raw = readFileSync(filePath, "utf-8")
  } catch (err) {
    failed++
    console.error(`✗ ${displayPath} — could not read file`)
    console.error(`  ${(err as Error).message}`)
    continue
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    failed++
    console.error(`✗ ${displayPath} — invalid JSON`)
    console.error(`  ${(err as Error).message}`)
    continue
  }

  const result = incidentAnalysisSchema.safeParse(parsed)
  if (result.success) {
    console.log(`✓ ${displayPath}`)
    continue
  }

  failed++
  console.error(`✗ ${displayPath} — schema validation failed`)
  for (const issue of result.error.issues) {
    const path = issue.path.length > 0 ? issue.path.join(".") : "<root>"
    console.error(`  ${path}: ${issue.message}`)
  }
}

if (failed > 0) {
  console.error(`\n✗ ${failed}/${MOCK_FILES.length} mock(s) failed`)
  process.exit(1)
}

console.log(`\n✓ all ${MOCK_FILES.length} mocks valid`)
