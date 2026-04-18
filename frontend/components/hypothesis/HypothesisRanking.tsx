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

  if (isAnalyzing) return <HypothesisRankingSkeleton />
  if (!hypotheses || hypotheses.length === 0) return null

  // Although the mock is already sorted descending, we sort it once more defensively to ensure consistent ordering.
  const sorted = [...hypotheses].sort((a, b) => b.confidence - a.confidence)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Root cause hypotheses</CardTitle>
          <span className="text-muted-foreground text-xs">
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
        <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 w-full animate-pulse rounded bg-slate-200"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
