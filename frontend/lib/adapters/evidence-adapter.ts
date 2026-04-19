// 팀원 데이터는 두 가지 포맷으로 내려올 수 있다:
//
// (A) 통합 포맷 (data/{scenario}.json): 독립적인 evidence 배열이 없고,
//     각 hypothesis.breakdown.evidence_ids 에 참조만 있으며 구체 설명은
//     raw.summary 마크다운의 "Core Supportive Evidence" 섹션에 자연어로 박혀있다.
//
// (B) feature-split 포맷 (data/feature3_evidence.json): evidence 가 풍부한
//     객체 배열로 직접 내려온다. category / delta_ratio / weakens_hypothesis /
//     drilldown_url 등 태그 결정에 필요한 구조화된 필드가 전부 포함돼 있다.
//
// 전략:
//   - raw.evidence (배열) 가 있으면 그 포맷을 우선 신뢰하고 직접 매핑 (path B).
//   - 없으면 기존 합성 경로를 그대로 유지 (path A) — 통합 포맷 호환.
//
// 태그 결정 규칙:
//   feature-split (path B):
//     weakens_hypothesis !== null         → "Conflicting"
//     category === "CONTEXT"              → "Context"
//     category === "SUPPORT" & delta>=10  → "Critical"
//     category === "SUPPORT" & delta>=2   → "Warning"
//     category === "SUPPORT"              → "Supporting"
//     그 외                                → 접두어 기반 fallback
//
//   통합 포맷 (path A) — 기존 규칙 그대로:
//     LOG-*    → Critical
//     METRIC-* → Critical
//     EVENT-*  → Warning
//     그 외    → Supporting

import type { Evidence, TeamRealEvidenceItem, TeamRealOutput } from "../types"

interface SummaryClaim {
  time: string
  text: string
  drilldownLabel: string
}

export function adaptTeamEvidence(raw: TeamRealOutput): Evidence[] {
  // === path B: feature-split 포맷 (raw.evidence 배열 존재) ===
  if (Array.isArray(raw.evidence) && raw.evidence.length > 0) {
    return raw.evidence
      .map((item, idx) => adaptEvidenceItem(item, idx))
      .filter((e): e is Evidence => e !== null)
  }

  // === path A: 통합 포맷 (hypothesis.breakdown.evidence_ids 에서 합성) ===
  const ids = collectEvidenceIds(raw)
  if (ids.length === 0) return []

  const claims = parseSummaryEvidence(raw.summary ?? "")

  return ids.map((id) => buildEvidence(id, claims))
}

// feature3_evidence.json 배열 엔트리 → UI Evidence.
// observed_at 이 "Unknown" 이거나 비어있을 때는 timestamp 를 아예 넣지 않는다
// (Date 변환을 다운스트림에서 시도할 수 있으므로 null 가드가 필수).
function adaptEvidenceItem(
  item: TeamRealEvidenceItem,
  index: number
): Evidence | null {
  const id =
    typeof item.evidence_id === "string" && item.evidence_id.length > 0
      ? item.evidence_id
      : `evidence-${index + 1}`

  const text =
    typeof item.content === "string" && item.content.length > 0
      ? item.content
      : typeof item.signal_name === "string" && item.signal_name.length > 0
      ? `Signal observed: ${item.signal_name}`
      : id

  const tag = deriveTagFromFeature3(item)
  const { prefix } = splitPrefix(id)
  const sourceType = sourceTypeFor(prefix)

  const base: Evidence = { id, text, tag }
  if (sourceType) base.sourceType = sourceType

  // observed_at 이 "Unknown" 또는 빈 문자열이면 timestamp 필드 자체를 생략.
  if (
    typeof item.observed_at === "string" &&
    item.observed_at.length > 0 &&
    item.observed_at !== "Unknown"
  ) {
    base.timestamp = item.observed_at
  }

  if (typeof item.baseline_desc === "string" && item.baseline_desc.length > 0) {
    base.baseline = item.baseline_desc
  }

  // delta_ratio 를 사람이 읽을 수 있는 문자열로 렌더 (예: "45.0x").
  if (typeof item.delta_ratio === "number" && Number.isFinite(item.delta_ratio)) {
    base.delta = `${item.delta_ratio.toFixed(1)}x`
  }

  if (
    typeof item.drilldown_url === "string" &&
    item.drilldown_url.length > 0
  ) {
    base.drilldownUrl = item.drilldown_url
  }

  return base
}

function deriveTagFromFeature3(
  item: TeamRealEvidenceItem
): Evidence["tag"] {
  // 반대 근거 먼저 체크 — 같은 포인트가 SUPPORT category 에 속해도 Conflicting 이 우선.
  if (item.weakens_hypothesis !== null && item.weakens_hypothesis !== undefined) {
    return "Conflicting"
  }

  if (item.category === "CONTEXT") return "Context"

  if (item.category === "SUPPORT") {
    const delta = typeof item.delta_ratio === "number" ? item.delta_ratio : 0
    if (delta >= 10) return "Critical"
    if (delta >= 2) return "Warning"
    return "Supporting"
  }

  // category 가 예상 밖이면 접두어 기반 fallback.
  const { prefix } = splitPrefix(
    typeof item.evidence_id === "string" ? item.evidence_id : ""
  )
  const sourceType = sourceTypeFor(prefix)
  if (sourceType === "log" || sourceType === "metric") return "Critical"
  if (sourceType === "event") return "Warning"
  return "Supporting"
}

// 1) 모든 hypothesis 의 evidence_ids 를 순서대로 모으되, 중복은 한 번만.
function collectEvidenceIds(raw: TeamRealOutput): string[] {
  const hypotheses = raw.rca?.root_cause_analysis?.top_hypotheses ?? []
  const seen = new Set<string>()
  const result: string[] = []

  for (const h of hypotheses) {
    const ids = h.breakdown?.evidence_ids
    if (!Array.isArray(ids)) continue
    for (const id of ids) {
      if (typeof id !== "string") continue
      if (seen.has(id)) continue
      seen.add(id)
      result.push(id)
    }
  }

  return result
}

// 2) summary 마크다운 파싱.
// 예시 포맷 (한 claim):
//   [16:30:00] **Db Active Connections exceeded configured limit (450/400)**
//      - *Baseline*: 24h trailing avg | *Policy*: Saturation check
//      - *Drilldown*: [METRIC-DB_ACTIVE_CONNECTIONS](grafana://...)
export function parseSummaryEvidence(md: string): SummaryClaim[] {
  if (!md) return []

  const claims: SummaryClaim[] = []
  // [time] **text** ... *Drilldown*: [LABEL](url) 까지 한 블록으로 매칭.
  // s (dotall) 플래그로 줄바꿈 건너뛰고 lazy 하게 다음 `[TIME]` 또는 `##` 직전까지.
  const pattern =
    /\[([^\]]+)\]\s+\*\*([^*]+)\*\*[\s\S]*?\*Drilldown\*:\s*\[([^\]]+)\]\([^)]+\)/g
  for (const match of md.matchAll(pattern)) {
    const [, time, text, label] = match
    claims.push({
      time: time.trim(),
      text: text.trim(),
      drilldownLabel: label.trim(),
    })
  }

  return claims
}

// 3) + 4) evidence_id 하나에 대해 구체 Evidence 를 만든다.
function buildEvidence(id: string, claims: SummaryClaim[]): Evidence {
  const { prefix, body } = splitPrefix(id)
  const sourceType = sourceTypeFor(prefix)
  const tag = tagFor(sourceType)

  const match = findClaim(id, prefix, body, claims)
  const text = match?.text ?? defaultText(prefix, body)

  const base: Evidence = { id, text, tag, sourceType }

  if (match?.time && match.time !== "Unknown") {
    base.timestamp = match.time
  }

  return base
}

function splitPrefix(id: string): { prefix: string; body: string } {
  const i = id.indexOf("-")
  if (i < 0) return { prefix: "", body: id }
  return {
    prefix: id.slice(0, i).toUpperCase(),
    body: id.slice(i + 1),
  }
}

function sourceTypeFor(prefix: string): Evidence["sourceType"] {
  if (prefix === "LOG") return "log"
  if (prefix === "METRIC") return "metric"
  if (prefix === "EVENT") return "event"
  return undefined
}

function tagFor(
  sourceType: Evidence["sourceType"]
): Evidence["tag"] {
  if (sourceType === "log") return "Critical"
  if (sourceType === "metric") return "Critical"
  if (sourceType === "event") return "Warning"
  return "Supporting"
}

function defaultText(prefix: string, body: string): string {
  if (prefix === "LOG") return `Log signature match (${body})`
  if (prefix === "METRIC") return `Metric anomaly detected (${body})`
  if (prefix === "EVENT" && body === "RECENT-DEPLOY") {
    return "Recent deployment correlation"
  }
  if (prefix === "EVENT") return `Event: ${body}`
  return body
}

// evidence_id 와 summary 의 drilldown label 은 대소문자 / 구분자 차이가 있을 수 있다.
// 정규화해서 prefix + body 모두 일치하면 매칭으로 간주.
function findClaim(
  id: string,
  prefix: string,
  body: string,
  claims: SummaryClaim[]
): SummaryClaim | undefined {
  const normalizedTarget = normalize(id)
  const normalizedBody = normalize(body)

  for (const c of claims) {
    const label = normalize(c.drilldownLabel)
    if (label === normalizedTarget) return c
    // prefix 가 같고 body 만 일치해도 허용 (예: METRIC-db.active_connections vs METRIC-DB_ACTIVE_CONNECTIONS).
    if (label.startsWith(`${prefix.toLowerCase()}_`)) {
      const labelBody = label.slice(prefix.length + 1)
      if (labelBody === normalizedBody) return c
    }
  }

  return undefined
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[.\s-]/g, "_")
}
