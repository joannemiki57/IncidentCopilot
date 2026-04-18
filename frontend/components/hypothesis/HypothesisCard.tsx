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
    // Click the same card again → deselects it. Click another card → switches to that ID.
    // Although the store's selectHypothesis already contains toggle logic,
    // we explicitly declare the intent at the UI layer as well.
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
        {/* Rank number on the left — only the top rank is emphasized in indigo, others in light slate */}
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

          {/* Pure div-based progress bar. Lightweight and flicker-free compared to external libraries. */}
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
    </div>
  )
}
