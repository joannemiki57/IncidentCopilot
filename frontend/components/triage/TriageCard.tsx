"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { useIncidentStore } from "@/lib/store"

export function TriageCard() {
  const triage = useIncidentStore((s) => s.analysisResult?.triage)
  const isAnalyzing = useIncidentStore((s) => s.isAnalyzing)

  // If analyzing, show skeleton. If no result and in standby, skip rendering entirely.
  if (isAnalyzing) return <TriageCardSkeleton />
  if (!triage) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-medium">{triage.service}</h2>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="outline" className="font-mono text-xs">
              {triage.errorCategory}
            </Badge>
            <span className="text-muted-foreground text-xs">
              {Math.round(triage.confidence * 100)}% confidence
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-medium ${getSeverityClasses(
                triage.severity
              )}`}
            >
              {triage.severity} · {triage.severityLabel}
            </span>
          </div>
          <h3 className="text-lg font-medium">{triage.userImpact}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {triage.impactDetail}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function getSeverityClasses(severity: "P1" | "P2" | "P3" | "P4"): string {
  const map: Record<"P1" | "P2" | "P3" | "P4", string> = {
    P1: "bg-red-600 text-white",
    P2: "bg-amber-500 text-white",
    P3: "bg-yellow-500 text-black",
    P4: "bg-slate-400 text-white",
  }
  return map[severity]
}

function TriageCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
          <div className="h-5 w-full animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
        </div>
      </CardContent>
    </Card>
  )
}
