// 팀원 summary (SRE Technical Briefing 마크다운) → UI ExecutiveSummary.
//
// UI 는 { headline, impact, suspectedCause, mitigations, prevention } 다섯 섹션을 요구하지만
// 팀원 마크다운은 자유로운 구조 (Hypothesis Ranking / Core Supportive Evidence / Recovery Plan / ...).
// 기계적 일대일 대응은 불가능하므로 다음 전략으로 최선 노력 매핑:
//   headline       : 첫 번째 H1 줄 또는 "Ranked 1" 문장
//   impact         : triage 의 userImpact + severity 기반 재생성 (summary 내에는 직접적으론 없음)
//   suspectedCause : 가장 유력한 hypothesis 의 title + description
//   mitigations    : "Recovery Plan & Guardrails" 섹션 원문
//   prevention     : "Conflicting / Weakening Signals" + 가이드 문장 (보수 멘트)
//
// summary 가 비어있거나 파싱 실패하면 triage/hypothesis 기반 fallback 문자열 생성.

import type {
  ExecutiveSummary,
  TeamRealOutput,
  TriageResult,
  Hypothesis,
} from "../types"

export function adaptTeamExecutiveSummary(
  raw: TeamRealOutput,
  triage: TriageResult,
  hypotheses: Hypothesis[]
): ExecutiveSummary {
  const md = typeof raw.summary === "string" ? raw.summary : ""
  const top = hypotheses[0]
  const reasoningContext = raw.rca?.root_cause_analysis?.reasoning_context

  // headline 우선순위:
  //   1) reasoning_context 의 "Ranked 1: 'X' (Y% conf)" 문장 (incident-specific)
  //   2) summary 마크다운의 "N. **TITLE** ... ← Leading" 줄
  //   3) top hypothesis 합성 ("TITLE — N% confidence")
  //   4) summary 의 H1 (generic, 최후 폴백)
  const headline =
    extractHeadlineFromReasoningContext(reasoningContext) ??
    extractLeadingLine(md) ??
    (top
      ? `${top.title} — ${Math.round(top.confidence * 100)}% confidence`
      : undefined) ??
    extractHeadline(md) ??
    "Incident analyzed — no leading hypothesis"

  const impact = composeImpact(triage)
  const suspectedCause = composeSuspectedCause(top)
  const mitigations = extractSection(md, "Recovery Plan & Guardrails") ??
    composeMitigationsFallback(top)
  const prevention =
    extractSection(md, "Conflicting / Weakening Signals") ??
    "No weakening signals detected. Continue monitoring and verify the leading hypothesis before applying the recovery trigger."

  return {
    headline,
    impact,
    suspectedCause,
    mitigations,
    prevention,
  }
}

// reasoning_context 에는 보통 "Ranked 1: 'Title' (NN% conf). Reasoning: ..." 문장이 들어있다.
function extractHeadlineFromReasoningContext(
  rc: string | undefined
): string | undefined {
  if (typeof rc !== "string" || rc.length === 0) return undefined
  const m = rc.match(/Ranked\s+1:\s*'([^']+)'\s*\((\d+)%\s*conf\)/i)
  if (!m) return undefined
  return `${m[1]} — ${m[2]}% confidence`
}

// "1. **Title** — High (Score: 95/100) ← Leading" 줄을 뽑는다.
function extractLeadingLine(md: string): string | undefined {
  if (!md) return undefined
  const m = md.match(
    /^\s*\d+\.\s+\*\*([^*]+)\*\*\s+\u2014\s+[A-Za-z]+\s+\(Score:\s*(\d+)\/\d+\)\s*(?:\u2190\s*Leading)?/m
  )
  if (!m) return undefined
  return `${m[1].trim()} — ${m[2]}% confidence`
}

// summary 의 H1. 너무 일반적이라 최후 폴백으로만 쓴다.
function extractHeadline(md: string): string | undefined {
  if (!md) return undefined
  const h1 = md.match(/^#\s+(.+)$/m)
  if (!h1) return undefined
  const line = h1[1].trim()
  const cleaned = line
    .replace(
      /[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE0F}]/gu,
      ""
    )
    .trim()
  return cleaned.length >= 10 ? cleaned : undefined
}

function composeImpact(triage: TriageResult): string {
  const severity = `${triage.severity} · ${triage.severityLabel}`
  const body = triage.impactDetail || triage.userImpact || "Impact details unavailable."
  return `[${severity}] ${body}`
}

function composeSuspectedCause(top: Hypothesis | undefined): string {
  if (!top) return "No leading hypothesis identified."
  if (top.reasoning && top.reasoning.length > 0) {
    return `${top.title} — ${top.reasoning}`
  }
  return top.title
}

function composeMitigationsFallback(top: Hypothesis | undefined): string {
  if (!top) return "No recovery trigger proposed."
  if (top.triggerId) {
    return `Proposed recovery trigger: ${top.triggerId}. Approval required: ${
      top.approvalRequired ? "Yes" : "No"
    }.`
  }
  return "Recovery path not yet wired."
}

// 마크다운에서 "## <heading>" 섹션 본문만 잘라낸다.
// 이모지 prefix 가 붙어 있어도 heading 문구만 정확히 일치하게 처리.
export function extractSection(
  md: string,
  headingContains: string
): string | undefined {
  if (!md) return undefined

  const lines = md.split(/\r?\n/)
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^##\s+/.test(line) && line.includes(headingContains)) {
      start = i + 1
      break
    }
  }
  if (start < 0) return undefined

  const body: string[] = []
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]
    if (/^##?\s+/.test(line) || /^---/.test(line)) break
    body.push(line)
  }

  const joined = body.join("\n").trim()
  return joined.length > 0 ? joined : undefined
}
