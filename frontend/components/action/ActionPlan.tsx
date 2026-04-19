"use client"

import type { ReactNode } from "react"
import { useState } from "react"

import { Clock, Search, Zap } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useIncidentStore } from "@/lib/store"
import type { Action } from "@/lib/types"

export function ActionPlan() {
  const actionPlan = useIncidentStore((s) => s.analysisResult?.actionPlan)
  const isAnalyzing = useIncidentStore((s) => s.isAnalyzing)

  if (isAnalyzing) return <ActionPlanSkeleton />
  if (!actionPlan || actionPlan.length === 0) return null

  // urgency 별 그룹핑. 빈 그룹은 아래에서 렌더 생략.
  const grouped = {
    immediate: actionPlan.filter((a) => a.urgency === "immediate"),
    verify: actionPlan.filter((a) => a.urgency === "verify"),
    followup: actionPlan.filter((a) => a.urgency === "followup"),
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recommended actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {grouped.immediate.length > 0 && (
            <ActionGroup
              title="Immediate"
              icon={<Zap className="h-4 w-4" />}
              actions={grouped.immediate}
              iconColor="text-[--color-critical]"
            />
          )}
          {grouped.verify.length > 0 && (
            <ActionGroup
              title="Verify"
              icon={<Search className="h-4 w-4" />}
              actions={grouped.verify}
              iconColor="text-[--color-warning]"
            />
          )}
          {grouped.followup.length > 0 && (
            <ActionGroup
              title="Follow-up"
              icon={<Clock className="h-4 w-4" />}
              actions={grouped.followup}
              iconColor="text-muted-foreground"
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface ActionGroupProps {
  title: string
  icon: ReactNode
  actions: Action[]
  iconColor: string
}

function ActionGroup({ title, icon, actions, iconColor }: ActionGroupProps) {
  return (
    <div>
      <div
        className={`flex items-center gap-2 mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${iconColor}`}
      >
        {icon}
        <span>{title}</span>
        <span className="text-muted-foreground/60 font-mono normal-case tracking-normal">
          ({actions.length})
        </span>
      </div>
      <div className="space-y-2">
        {actions.map((action) => (
          <ActionItem key={action.id} action={action} />
        ))}
      </div>
    </div>
  )
}

const RISK_COLOR_MAP: Record<NonNullable<Action["risk"]>, string> = {
  none: "bg-muted/60 text-muted-foreground",
  low: "bg-[--color-success]/15 text-[--color-success]",
  medium: "bg-[--color-warning]/15 text-[--color-warning]",
  high: "bg-[--color-critical]/15 text-[--color-critical]",
}

function ActionItem({ action }: { action: Action }) {
  // 체크박스 상태는 UI-only — 스토어에 넣지 않는다. 데모에서 한 번 체크해보는 용도.
  const [checked, setChecked] = useState(false)

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card/60 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
      />
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-relaxed ${
            checked
              ? "line-through text-muted-foreground/60"
              : "text-foreground/90"
          }`}
        >
          {action.action}
        </p>
        {action.rationale && (
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {action.rationale}
          </p>
        )}
        {action.reversibility && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/80">
            <span className="opacity-60">reversibility:</span>
            <span className="text-foreground/80">{action.reversibility}</span>
          </div>
        )}
      </div>
      {action.risk && (
        <Badge
          variant="secondary"
          className={`text-[10px] uppercase tracking-wide ${RISK_COLOR_MAP[action.risk] ?? ""}`}
        >
          {action.risk} risk
        </Badge>
      )}
    </div>
  )
}

function ActionPlanSkeleton() {
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
              className="h-16 w-full animate-pulse rounded bg-muted/60"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
