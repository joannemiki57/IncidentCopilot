// 팀원 action_plan(단일 runbook) + 각 hypothesis.verification_steps → UI Action[].
//
// UI 는 Action 의 배열을 기대 (urgency 그룹핑). 팀원은:
//   - raw.action_plan : 기본 runbook 단일 객체. { status: "NO_ACTION_MAPPED" } 일 수도 있음.
//   - raw.rca.root_cause_analysis.top_hypotheses[].verification_steps : 가설별 검증 절차.
//
// 매핑:
//   primary action (action_plan) →
//     urgency: risk_score 기반 (>=70 immediate / >=40 verify / <40 followup)
//     risk:    blast_radius 기반 (Large → high, Medium → medium, Small → low)
//     rationale: action_description / command / undo_command 를 합쳐서 한 줄.
//   verification_steps → 전부 "verify" urgency 의 Action 들로 붙인다 (dedup).

import type { Action, TeamRealActionPlan, TeamRealOutput } from "../types"

export function adaptTeamActionPlan(raw: TeamRealOutput): Action[] {
  const actions: Action[] = []

  const primary = adaptPrimaryAction(raw.action_plan)
  if (primary) actions.push(primary)

  const verificationActions = adaptVerificationSteps(raw)
  actions.push(...verificationActions)

  return actions
}

function adaptPrimaryAction(
  raw: TeamRealActionPlan | undefined
): Action | null {
  if (!raw) return null
  // 제목이 없으면 매핑 실패 케이스. 조용히 드롭.
  const title = typeof raw.title === "string" ? raw.title : undefined
  if (!title || title.length === 0) return null

  const id =
    typeof raw.action_id === "string" && raw.action_id.length > 0
      ? raw.action_id
      : "action-primary"

  const base: Action = {
    id,
    action: title,
    urgency: urgencyFromRiskScore(raw.risk_score),
  }

  const risk = riskFromBlastRadius(raw.blast_radius)
  if (risk) base.risk = risk

  const rationale = composeRationale(raw)
  if (rationale) base.rationale = rationale

  // reversibility 는 rationale 안에도 들어가 있지만, UI 에서 별도 배지로
  // 직접 읽어 쓸 수 있게 top-level 필드로도 노출.
  if (typeof raw.reversibility === "string" && raw.reversibility.length > 0) {
    base.reversibility = raw.reversibility
  }

  return base
}

function adaptVerificationSteps(raw: TeamRealOutput): Action[] {
  const hypotheses = raw.rca?.root_cause_analysis?.top_hypotheses ?? []
  const seen = new Set<string>()
  const out: Action[] = []

  hypotheses.forEach((h, hIdx) => {
    const steps = h.verification_steps
    if (!Array.isArray(steps)) return
    steps.forEach((step, sIdx) => {
      if (typeof step !== "string" || step.trim().length === 0) return
      const key = step.trim()
      if (seen.has(key)) return
      seen.add(key)
      out.push({
        id: `verify-${hIdx + 1}-${sIdx + 1}`,
        action: key,
        urgency: "verify",
        risk: "none",
      })
    })
  })

  return out
}

function urgencyFromRiskScore(
  score: number | undefined
): Action["urgency"] {
  // risk_score 는 0~100. 비어있으면 followup 으로 보수적으로 내린다.
  if (typeof score !== "number") return "followup"
  if (score >= 70) return "immediate"
  if (score >= 40) return "verify"
  return "followup"
}

function riskFromBlastRadius(
  blastRadius: TeamRealActionPlan["blast_radius"]
): Action["risk"] | undefined {
  if (typeof blastRadius !== "string") return undefined
  const b = blastRadius.trim().toLowerCase()
  if (b === "large") return "high"
  if (b === "medium") return "medium"
  if (b === "small") return "low"
  return undefined
}

function composeRationale(raw: TeamRealActionPlan): string | undefined {
  const parts: string[] = []
  if (typeof raw.command === "string" && raw.command.length > 0) {
    parts.push(`Command: ${raw.command}`)
  }
  if (typeof raw.undo_command === "string" && raw.undo_command.length > 0) {
    parts.push(`Undo: ${raw.undo_command}`)
  }
  if (
    typeof raw.blast_radius === "string" &&
    raw.blast_radius.length > 0 &&
    typeof raw.reversibility === "string" &&
    raw.reversibility.length > 0
  ) {
    parts.push(
      `Blast radius: ${raw.blast_radius} · Reversibility: ${raw.reversibility}`
    )
  }
  if (parts.length === 0) return undefined
  return parts.join(" \u2014 ")
}
