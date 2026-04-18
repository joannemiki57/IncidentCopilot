"use client"

import type { KeyboardEvent } from "react"

import { Badge } from "@/components/ui/badge"
import { useIncidentStore } from "@/lib/store"
import type { Hypothesis } from "@/lib/types"

interface HypothesisCardProps {
  hypothesis: Hypothesis
  rank: number
  isTopRank: boolean
}

export function HypothesisCard({
  hypothesis,
  rank,
  isTopRank,
}: HypothesisCardProps) {
  const selectedId = useIncidentStore((s) => s.selectedHypothesisId)
  const selectHypothesis = useIncidentStore((s) => s.selectHypothesis)

  const isSelected = selectedId === hypothesis.id
  const percentage = Math.round(hypothesis.confidence * 100)

  const handleClick = () => {
    // 같은 카드 다시 클릭 → 선택 해제. 다른 카드 → 그 id로 교체.
    // 스토어 쪽 selectHypothesis 가 이미 토글 로직을 갖고 있지만,
    // UI 레이어에서도 명시적으로 의도를 드러내둔다.
    selectHypothesis(isSelected ? null : hypothesis.id)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`group cursor-pointer rounded-lg border p-4 transition-all ${
        isSelected
          ? "border-indigo-500 bg-indigo-50"
          : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start gap-4">
        {/* 좌측 순위 번호 — 1순위만 indigo로 강조, 나머지는 연한 slate */}
        <div className="flex-shrink-0">
          <div
            className={`text-3xl font-light ${
              isTopRank ? "text-indigo-600" : "text-slate-300"
            }`}
          >
            #{rank}
          </div>
        </div>

        {/* 중앙: 제목 + confidence bar */}
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm mb-2 leading-snug">
            {hypothesis.title}
          </h4>

          {/* 순수 div 기반 progress bar. recharts 대비 가볍고 깜빡임 없음 */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isTopRank ? "bg-indigo-500" : "bg-slate-400"
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span
              className={`text-sm font-medium tabular-nums w-10 text-right ${
                isTopRank ? "text-indigo-600" : "text-slate-500"
              }`}
            >
              {percentage}%
            </span>
          </div>
        </div>

        {/* 우측: 연결된 evidence 개수 */}
        <div className="flex-shrink-0">
          <Badge variant="secondary" className="text-xs">
            {hypothesis.evidenceIds.length} evidence
          </Badge>
        </div>
      </div>

      {/* 선택 시에만 reasoning 펼침 */}
      {isSelected && hypothesis.reasoning && (
        <div className="mt-4 pt-4 border-t border-indigo-200">
          <p className="text-sm text-slate-700 leading-relaxed">
            {hypothesis.reasoning}
          </p>
        </div>
      )}

      {/* 선택된 상태 + breakdown 값이 있을 때만 신뢰도 근거를 풀어서 보여준다.
          각 항목 weight 는 현재 팀 스코어러 기준으로 고정값 — 스코어러가 바뀌면 여기 같이 손봐야 한다. */}
      {isSelected && hypothesis.breakdown && (
        <div className="mt-4 pt-4 border-t border-indigo-200">
          <div className="text-xs font-medium text-indigo-900 uppercase tracking-wide mb-3">
            Confidence breakdown
          </div>
          <div className="space-y-2">
            <BreakdownRow
              label="Log pattern match"
              value={hypothesis.breakdown.logQuality}
              weight={0.4}
            />
            <BreakdownRow
              label="Time-decay deploy correlation"
              value={hypothesis.breakdown.timeDecayDeploy}
              weight={0.3}
            />
            <BreakdownRow
              label="Metric anomaly"
              value={hypothesis.breakdown.metricAnomaly}
              weight={0.3}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function BreakdownRow({
  label,
  value,
  weight,
}: {
  label: string
  value: number
  weight: number
}) {
  const percentage = Math.round(value * 100)
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1 text-xs">
        <span className="text-slate-600">
          {label}{" "}
          <span className="text-slate-400">
            (weight {Math.round(weight * 100)}%)
          </span>
        </span>
        <span className="font-medium text-slate-700 tabular-nums">
          {percentage}%
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-400 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
