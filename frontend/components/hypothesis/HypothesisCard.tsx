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
      className={`group cursor-pointer rounded-lg border p-3 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
        isSelected
          ? "border-primary/60 bg-primary/10"
          : "border-border bg-card/60 hover:border-primary/30 hover:bg-card"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* 좌측 순위 번호 — 1순위만 primary, 나머지는 흐린 tone */}
        <div className="flex-shrink-0">
          <div
            className={`text-2xl font-light tabular-nums leading-none mt-0.5 ${
              isTopRank ? "text-primary" : "text-muted-foreground/50"
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
            <div className="flex-1 h-1.5 bg-muted/70 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isTopRank ? "bg-primary" : "bg-muted-foreground/50"
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span
              className={`text-xs font-medium tabular-nums w-10 text-right ${
                isTopRank ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {percentage}%
            </span>
          </div>
        </div>

        {/* 우측: 연결된 evidence 개수 */}
        <div className="flex-shrink-0">
          <Badge variant="secondary" className="text-[10px] font-mono">
            {hypothesis.evidenceIds.length} ev
          </Badge>
        </div>
      </div>

      {/* 선택 시에만 reasoning 펼침 */}
      {isSelected && hypothesis.reasoning && (
        <div className="mt-3 pt-3 border-t border-primary/20">
          <p className="text-xs text-foreground/90 leading-relaxed">
            {hypothesis.reasoning}
          </p>
        </div>
      )}

      {/* 선택된 상태 + breakdown 값이 있을 때만 신뢰도 근거를 풀어서 보여준다.
          각 항목 weight 는 현재 팀 스코어러 기준으로 고정값 — 스코어러가 바뀌면 여기 같이 손봐야 한다. */}
      {isSelected && hypothesis.breakdown && (
        <div className="mt-3 pt-3 border-t border-primary/20">
          <div className="text-[10px] font-medium text-primary uppercase tracking-[0.14em] mb-2">
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
      <div className="flex justify-between items-baseline mb-1 text-[11px]">
        <span className="text-muted-foreground">
          {label}{" "}
          <span className="text-muted-foreground/60">
            (weight {Math.round(weight * 100)}%)
          </span>
        </span>
        <span className="font-medium text-foreground tabular-nums">
          {percentage}%
        </span>
      </div>
      <div className="h-1 bg-muted/70 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/80 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
