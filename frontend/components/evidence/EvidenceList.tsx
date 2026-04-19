"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useIncidentStore } from "@/lib/store"

import { EvidenceItem } from "./EvidenceItem"

export function EvidenceList() {
  const evidence = useIncidentStore((s) => s.analysisResult?.evidence)
  const hypotheses = useIncidentStore((s) => s.analysisResult?.hypotheses)
  const selectedHypothesisId = useIncidentStore((s) => s.selectedHypothesisId)
  const isAnalyzing = useIncidentStore((s) => s.isAnalyzing)

  // stage-level skeleton: evidence 아직 안 왔고 분석 중이면 자리 유지.
  if (!evidence || evidence.length === 0) {
    if (isAnalyzing) return <EvidenceListSkeleton />
    return null
  }

  // 선택된 가설이 있으면 그 가설의 evidenceIds 만 강조 대상.
  // 선택된 가설 없음 → highlightedIds 가 빈 Set 이고, EvidenceItem 에서 isSelectionActive=false 로 흐르게 된다.
  const selectedHypothesis = hypotheses?.find(
    (h) => h.id === selectedHypothesisId
  )
  const highlightedIds = new Set(selectedHypothesis?.evidenceIds ?? [])
  const isSelectionActive = highlightedIds.size > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-base">Evidence</CardTitle>
          <span className="text-muted-foreground text-[11px] text-right">
            {selectedHypothesis ? (
              <>
                <span className="text-muted-foreground/60">scoped to </span>
                <span className="font-mono text-foreground/80">
                  {selectedHypothesis.title}
                </span>
              </>
            ) : (
              <>
                Showing all evidence{" "}
                <span className="text-muted-foreground/60">
                  · click a hypothesis to filter
                </span>
              </>
            )}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {evidence.map((item) => (
            <EvidenceItem
              key={item.id}
              evidence={item}
              // 선택 없으면 전부 기본 상태 (isHighlighted=true 로 강제하지 않음).
              // 선택 있으면 그 가설이 가리키는 evidence 만 true.
              isHighlighted={!isSelectionActive || highlightedIds.has(item.id)}
              isSelectionActive={isSelectionActive}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function EvidenceListSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-32 animate-pulse rounded bg-muted/60" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-14 w-full animate-pulse rounded bg-muted/60"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
