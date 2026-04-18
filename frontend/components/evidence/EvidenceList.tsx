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

  if (isAnalyzing) return <EvidenceListSkeleton />
  if (!evidence || evidence.length === 0) return null

  // If a hypothesis is selected, only the evidenceIds of that hypothesis are highlighted.
  // No hypothesis selected → highlightedIds will be an empty Set, and isSelectionActive=false in EvidenceItem.
  const selectedHypothesis = hypotheses?.find(
    (h) => h.id === selectedHypothesisId
  )
  const highlightedIds = new Set(selectedHypothesis?.evidenceIds ?? [])
  const isSelectionActive = highlightedIds.size > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Evidence</CardTitle>
          <span className="text-muted-foreground text-xs text-right">
            {selectedHypothesis
              ? `Showing evidence for: ${selectedHypothesis.title}`
              : "Showing all evidence · Click a hypothesis above to filter"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {evidence.map((item) => (
            <EvidenceItem
              key={item.id}
              evidence={item}
              // If no selection, all items are in the default state (not forced to isHighlighted=true).
              // If selected, only the evidence pointed to by that hypothesis is true.
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
        <div className="h-6 w-32 animate-pulse rounded bg-slate-200" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-14 w-full animate-pulse rounded bg-slate-200"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
