// 팀원의 기능 2 evidence → UI Evidence[] 변환.
//
// 팀 포맷에서 evidence.text 앞에 "[Critical] 실제 문구..." 처럼 접두어 태그가 붙어있다.
// 이를 Evidence.tag 로 추출하고 text 에서는 접두어를 제거한다.

import type { Evidence, TeamIncidentOutput } from "../types"

type RawEvidence = NonNullable<
  NonNullable<TeamIncidentOutput["root_cause_analysis"]>["evidence"]
>[number]

const TAG_PATTERN = /^\s*\[(Critical|Warning|Supporting)\]\s*/

export function adaptTeamEvidence(raw: TeamIncidentOutput): Evidence[] {
  const list = raw.root_cause_analysis?.evidence
  if (!Array.isArray(list)) return []

  return list
    .map((e, index) => adaptSingleEvidence(e, index))
    .filter((e): e is Evidence => e !== null)
}

function adaptSingleEvidence(
  raw: RawEvidence,
  index: number
): Evidence | null {
  const rawText = typeof raw.text === "string" ? raw.text : ""
  if (!rawText) {
    // text 없는 evidence 는 UI 에 의미 없음.
    return null
  }

  const { tag, text } = extractTag(rawText)

  const base: Evidence = {
    id: typeof raw.id === "string" ? raw.id : `e${index + 1}`,
    text,
  }

  if (tag) base.tag = tag
  if (typeof raw.source_log_line === "number") {
    base.sourceLogLine = raw.source_log_line
  }
  if (
    typeof raw.source_log_snippet === "string" &&
    raw.source_log_snippet.length > 0
  ) {
    base.sourceLogSnippet = raw.source_log_snippet
  }
  if (typeof raw.timestamp === "string" && raw.timestamp.length > 0) {
    base.timestamp = raw.timestamp
  }

  // metric-style 필드들은 문자열 그대로 전달 ("Baseline: 150" / "Current: 450" / "3.0x").
  if (typeof raw.baseline === "string" && raw.baseline.length > 0) {
    base.baseline = raw.baseline
  }
  if (typeof raw.current === "string" && raw.current.length > 0) {
    base.current = raw.current
  }
  if (typeof raw.delta === "string" && raw.delta.length > 0) {
    base.delta = raw.delta
  }

  return base
}

// "[Critical] DB connection pool exhausted..." 에서 tag 와 나머지 text 를 분리.
// 접두어가 없으면 tag 는 undefined, text 는 그대로.
export function extractTag(raw: string): {
  tag?: Evidence["tag"]
  text: string
} {
  const match = raw.match(TAG_PATTERN)
  if (!match) return { text: raw }

  const tag = match[1] as Evidence["tag"]
  const text = raw.replace(TAG_PATTERN, "")
  return { tag, text }
}
