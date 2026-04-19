"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useIncidentStore } from "@/lib/store"

import { HypothesisCard } from "./HypothesisCard"

export function HypothesisRanking() {
  const hypotheses = useIncidentStore((s) => s.analysisResult?.hypotheses)
  const isAnalyzing = useIncidentStore((s) => s.isAnalyzing)

  // stage 별로 도착해도 카드는 남겨둔다 — 데이터 있으면 바로 렌더, 없고 분석 중이면 skeleton.
  if (!hypotheses || hypotheses.length === 0) {
    if (isAnalyzing) return <HypothesisRankingSkeleton />
    return null
  }

  // mock이 이미 내림차순이지만, 팀 원본이 정렬 보장을 안 할 수도 있으니 방어적으로 한 번 더.
  const sorted = [...hypotheses].sort((a, b) => b.confidence - a.confidence)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Root cause hypotheses</CardTitle>
          <span className="text-muted-foreground text-[11px] font-mono">
            {sorted.length} candidates
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sorted.map((hypothesis, index) => (
            <HypothesisCard
              key={hypothesis.id}
              hypothesis={hypothesis}
              rank={index + 1}
              isTopRank={index === 0}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function HypothesisRankingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-48 animate-pulse rounded bg-muted/60" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 w-full animate-pulse rounded bg-muted/60"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
