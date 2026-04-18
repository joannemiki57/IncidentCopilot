"use client"

import { AlertTriangle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { useIncidentStore } from "@/lib/store"

export function TriageCard() {
  const triage = useIncidentStore((s) => s.analysisResult?.triage)
  const isAnalyzing = useIncidentStore((s) => s.isAnalyzing)

  // 분석 중이면 skeleton. 결과 없고 대기 상태면 렌더 자체를 생략한다.
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

          {/* Compound scenario 배너 — 단일 원인이 아닌 복합 시나리오일 때만 노출. */}
          {triage.compoundScenario && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-amber-900 mb-0.5">
                  Compound scenario detected
                </div>
                <div className="text-amber-800 text-xs leading-relaxed">
                  {triage.compoundScenario}
                </div>
              </div>
            </div>
          )}

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
