"use client"

import { AlertTriangle, ShieldAlert } from "lucide-react"

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
    <Card className="relative overflow-hidden">
      {/* Severity edge rail — left border color tracks P1/P2/P3/P4 */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${getSeverityRail(triage.severity)}`}
      />
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <ShieldAlert className="size-3.5" />
              Triage
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight truncate">
              {triage.service}
            </h2>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
              {triage.errorCategory}
            </Badge>
            <span className="text-muted-foreground text-xs tabular-nums">
              {Math.round(triage.confidence * 100)}% confidence
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide ${getSeverityClasses(
                triage.severity
              )}`}
            >
              {triage.severity} · {triage.severityLabel}
            </span>
          </div>

          {/* Compound scenario 배너 — 단일 원인이 아닌 복합 시나리오일 때만 노출. */}
          {triage.compoundScenario && (
            <div className="flex items-start gap-2 rounded-md border border-[--color-warning]/40 bg-[--color-warning]/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-[--color-warning] mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-foreground mb-0.5">
                  Compound scenario detected
                </div>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  {triage.compoundScenario}
                </div>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-base font-medium leading-snug">{triage.userImpact}</h3>
            <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
              {triage.impactDetail}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function getSeverityClasses(severity: "P1" | "P2" | "P3" | "P4"): string {
  const map: Record<"P1" | "P2" | "P3" | "P4", string> = {
    P1: "bg-[--color-critical] text-[--color-critical-foreground]",
    P2: "bg-[--color-warning] text-[--color-warning-foreground]",
    P3: "bg-[--color-info] text-[--color-info-foreground]",
    P4: "bg-muted text-muted-foreground",
  }
  return map[severity]
}

function getSeverityRail(severity: "P1" | "P2" | "P3" | "P4"): string {
  const map: Record<"P1" | "P2" | "P3" | "P4", string> = {
    P1: "bg-[--color-critical]",
    P2: "bg-[--color-warning]",
    P3: "bg-[--color-info]",
    P4: "bg-muted-foreground/30",
  }
  return map[severity]
}

function TriageCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-48 animate-pulse rounded bg-muted/60" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="h-8 w-32 animate-pulse rounded bg-muted/60" />
          <div className="h-5 w-full animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted/60" />
        </div>
      </CardContent>
    </Card>
  )
}
