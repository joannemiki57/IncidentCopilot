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
        <CardTitle>Recommended actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {grouped.immediate.length > 0 && (
            <ActionGroup
              title="Immediate"
              icon={<Zap className="h-4 w-4" />}
              actions={grouped.immediate}
              iconColor="text-red-600"
            />
          )}
          {grouped.verify.length > 0 && (
            <ActionGroup
              title="Verify"
              icon={<Search className="h-4 w-4" />}
              actions={grouped.verify}
              iconColor="text-amber-600"
            />
          )}
          {grouped.followup.length > 0 && (
            <ActionGroup
              title="Follow-up"
              icon={<Clock className="h-4 w-4" />}
              actions={grouped.followup}
              iconColor="text-slate-500"
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
        className={`flex items-center gap-2 mb-3 text-sm font-medium ${iconColor}`}
      >
        {icon}
        <span>{title}</span>
        <span className="text-slate-400 font-normal">({actions.length})</span>
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
  none: "bg-slate-100 text-slate-600",
  low: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
}

function ActionItem({ action }: { action: Action }) {
  // 체크박스 상태는 UI-only — 스토어에 넣지 않는다. 데모에서 한 번 체크해보는 용도.
  const [checked, setChecked] = useState(false)

  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300"
      />
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-relaxed ${
            checked ? "line-through text-slate-400" : "text-slate-800"
          }`}
        >
          {action.action}
        </p>
        {action.rationale && (
          <p className="mt-1 text-xs text-slate-500">{action.rationale}</p>
        )}
      </div>
      {action.risk && (
        <Badge
          variant="secondary"
          className={`text-xs ${RISK_COLOR_MAP[action.risk] ?? ""}`}
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
        <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 w-full animate-pulse rounded bg-slate-200"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
