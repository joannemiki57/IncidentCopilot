"use client"

import { useState } from "react"

import { CheckCircle2, Copy, ShieldCheck, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useIncidentStore } from "@/lib/store"

export function ExecutiveSummary() {
  const summary = useIncidentStore((s) => s.analysisResult?.executiveSummary)
  const triage = useIncidentStore((s) => s.analysisResult?.triage)
  const hitlStatus = useIncidentStore((s) => s.analysisResult?.hitlStatus)
  const isAnalyzing = useIncidentStore((s) => s.isAnalyzing)
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState(false)

  // summary stage 가 오기 전까진 skeleton, 도착하면 데이터 렌더.
  if (!summary) {
    if (isAnalyzing) return <ExecutiveSummarySkeleton />
    return null
  }

  const handleCopy = async () => {
    // Slack / 문서 붙여넣기 용도로 가볍게 Markdown 형태. triage 가 아직 안 들어왔을 때도 터지지 않게 fallback.
    const markdown = `# ${summary.headline}
**Service:** ${triage?.service ?? "Unknown"}
**Severity:** ${triage?.severity ?? "?"} · ${triage?.severityLabel ?? ""}

## Impact
${summary.impact}

## Suspected cause
${summary.suspectedCause}

## Mitigations
${summary.mitigations}

## Prevention
${summary.prevention}
`
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard 권한이 없는 환경 (secure context 아님 등) 에서도 앱이 안 죽게 삼킴.
      setCopied(false)
    }
  }

  const handleSendSlack = () => {
    // 실제 Slack 연동은 아직 stub — 콘솔에만 찍고 UI 피드백만.
    console.log("Slack send (stub):", summary.headline)
    setSent(true)
    setTimeout(() => setSent(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <CardTitle className="text-base">Executive summary</CardTitle>
            {hitlStatus && <HitlBadge status={hitlStatus} />}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              {copied ? "Copied!" : "Copy"}
            </Button>
            <Button variant="default" size="sm" onClick={handleSendSlack}>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {sent ? "Sent!" : "Send to Slack"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <h3 className="text-base font-semibold leading-snug">
            {summary.headline}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SummarySection label="Impact" content={summary.impact} />
            <SummarySection
              label="Suspected cause"
              content={summary.suspectedCause}
            />
            <SummarySection label="Mitigations" content={summary.mitigations} />
            <SummarySection label="Prevention" content={summary.prevention} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function HitlBadge({
  status,
}: {
  status: "Awaiting Approval" | "Auto-Executable"
}) {
  // HITL 상태는 두 분기뿐이니 삼항으로 내려도 괜찮지만,
  // 색상-텍스트-아이콘이 한 덩어리이기 때문에 status 별로 한 줄씩 명시적으로 잡아둔다.
  const isBlocked = status === "Awaiting Approval"
  const styles = isBlocked
    ? "bg-[--color-critical]/15 text-[--color-critical] border-[--color-critical]/40"
    : "bg-[--color-success]/15 text-[--color-success] border-[--color-success]/40"
  const Icon = isBlocked ? ShieldCheck : CheckCircle2
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${styles}`}
    >
      <Icon className="size-3" />
      <span>{status}</span>
    </span>
  )
}

function SummarySection({
  label,
  content,
}: {
  label: string
  content: string
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
        {label}
      </div>
      <p className="text-sm text-foreground/90 leading-relaxed">{content}</p>
    </div>
  )
}

function ExecutiveSummarySkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-40 animate-pulse rounded bg-muted/60" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="h-8 w-3/4 animate-pulse rounded bg-muted/60" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-20 w-full animate-pulse rounded bg-muted/60"
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
