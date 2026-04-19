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
  const isEmpty = !evidence || evidence.length === 0

  if (isEmpty && isAnalyzing) {
    return <EvidenceListSkeleton />
  }

  // 선택된 가설이 있으면 그 가설의 evidenceIds 만 강조 대상.
  const selectedHypothesis = hypotheses?.find(
    (h) => h.id === selectedHypothesisId
  )
  const highlightedIds = new Set(selectedHypothesis?.evidenceIds ?? [])
  const isSelectionActive = highlightedIds.size > 0

  // 가설이 선택된 경우 해당 가설과 연관된 증거만 필터링 (방어 로직 추가)
  const displayEvidence = (isSelectionActive
    ? evidence?.filter((item) => highlightedIds.has(item.id))
    : evidence) ?? []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-base">Evidence</CardTitle>
          {!isEmpty && (
            <span className="text-muted-foreground text-[11px] text-right">
              {selectedHypothesis ? (
                <>
                  <span className="text-emerald-500 font-semibold">Filtering {displayEvidence.length} items </span>
                  <span className="text-muted-foreground/60">for </span>
                  <span className="font-bold text-foreground">
                    {selectedHypothesis.title}
                  </span>
                </>
              ) : (
                <>
                  Showing all {evidence.length} evidence{" "}
                  <span className="text-muted-foreground/60">
                    · select a cause to drill down
                  </span>
                </>
              )}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {displayEvidence.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-muted/30 rounded-lg bg-muted/5">
            <p className="text-sm text-muted-foreground">
              {isSelectionActive 
                ? "No exclusive evidence for this cause." 
                : "No diagnostic evidence detected."}
            </p>
            <p className="text-[10px] text-muted-foreground/50 mt-1 uppercase tracking-wider">
              {isSelectionActive ? "Try another hypothesis" : "System is currently operational"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayEvidence.map((item) => (
              <EvidenceItem
                key={item.id}
                evidence={item}
                isHighlighted={true} // 필터링된 상태에서는 모두 '강조' 대상
                isSelectionActive={isSelectionActive}
              />
            ))}
          </div>
        )}
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
