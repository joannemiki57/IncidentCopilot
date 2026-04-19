"use client"

// feature6 (코드 최적화) 카드.
//
// 렌더 정책:
// - optimization 필드가 없으면 카드 자체를 그리지 않는다 (return null).
// - 분석 중이면 가벼운 스켈레톤을 내보낸다 (다른 카드들과 톤을 맞추기 위해).
// - targetLocation 은 파일/메서드라 mono 작게, issueType 은 주황 배지로 한눈에 분류.
// - Before/After 코드 블록은 dark 테마 고정 (bg-slate-900/text-slate-100) — 이 블록만은
//   라이트 테마에서도 IDE 느낌을 유지하고 싶어 의도적으로 theme 토큰을 쓰지 않는다.
// - performance_delta 는 "current → estimated" 를 큰 숫자로 강조하고,
//   impact 문자열이 "reduction" 이든 "improvement" 든 그냥 초록 배지로 표시한다
//   (issueType 과 마찬가지로 값 자체는 백엔드가 자유 문자열로 내려줌).

import { Sparkles, Zap } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useIncidentStore } from "@/lib/store"

export function OptimizationCard() {
  const optimization = useIncidentStore((s) => s.analysisResult?.optimization)
  const isAnalyzing = useIncidentStore((s) => s.isAnalyzing)

  if (isAnalyzing) return <OptimizationSkeleton />
  if (!optimization) return null

  const { targetLocation, issueType, description, refactoringSuggestion, performanceDelta } =
    optimization
  const { metric, current, estimated, impact, otherMetrics } = performanceDelta

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-[--color-warning] shrink-0" />
            <CardTitle className="text-base">Code optimization</CardTitle>
            <IssueTypeBadge issueType={issueType} />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-5">
          {/* Target location — 파일/메서드 경로. 길어질 수 있어 overflow 처리. */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
              Target location
            </div>
            <code className="inline-block font-mono text-xs text-foreground/90 bg-muted/40 border border-border rounded-md px-2 py-1 break-all">
              {targetLocation}
            </code>
          </div>

          {/* Issue description */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
              Issue
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed">{description}</p>
          </div>

          {/* Before / After 코드 블록 — 다크 고정 */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
              Suggested refactoring
            </div>
            <pre className="bg-slate-900 text-slate-100 rounded-lg border border-slate-800 p-4 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
              <code>{refactoringSuggestion}</code>
            </pre>
          </div>

          {/* Performance delta — 큰 숫자 + impact 뱃지 */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
              <Zap className="h-3 w-3" />
              <span>Estimated impact · {metric}</span>
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-2xl font-semibold tabular-nums text-foreground/80 line-through decoration-[--color-critical]/60 decoration-2">
                {current}
              </span>
              <span className="text-xl text-muted-foreground">→</span>
              <span className="text-3xl font-bold tabular-nums text-foreground">
                {estimated}
              </span>
              <span className="inline-flex items-center rounded-md border border-[--color-success]/40 bg-[--color-success]/15 px-2 py-0.5 text-[11px] font-semibold text-[--color-success]">
                {impact}
              </span>
            </div>

            {/* 보조 메트릭 (DB Queries / CPU Usage 등) — 2열 grid */}
            {otherMetrics && otherMetrics.length > 0 && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {otherMetrics.map((m) => (
                  <OtherMetricTile key={m.name} {...m} />
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function IssueTypeBadge({ issueType }: { issueType: string }) {
  // issue_type 은 백엔드에서 자유 문자열로 내려오기 때문에 enum switch 없이
  // 카테고리 상관없이 주황 톤 하나로 통일한다 (디자인 스펙 준수).
  return (
    <span className="inline-flex items-center rounded-md border border-[--color-warning]/40 bg-[--color-warning]/15 px-2 py-0.5 text-[11px] font-medium text-[--color-warning]">
      {issueType}
    </span>
  )
}

function OtherMetricTile({
  name,
  before,
  after,
  gain,
}: {
  name: string
  before: string
  after: string
  gain: string
}) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
        {name}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-sm tabular-nums text-foreground/70 line-through">
          {before}
        </span>
        <span className="text-xs text-muted-foreground">→</span>
        <span className="text-base font-semibold tabular-nums text-foreground">
          {after}
        </span>
        <span className="ml-auto text-[11px] font-semibold text-[--color-success] tabular-nums">
          {gain}
        </span>
      </div>
    </div>
  )
}

function OptimizationSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-48 animate-pulse rounded bg-muted/60" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="h-5 w-1/2 animate-pulse rounded bg-muted/60" />
          <div className="h-20 w-full animate-pulse rounded bg-muted/60" />
          <div className="h-24 w-full animate-pulse rounded bg-muted/60" />
        </div>
      </CardContent>
    </Card>
  )
}
