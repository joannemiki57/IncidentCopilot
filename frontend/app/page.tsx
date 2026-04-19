import { ActionPlan } from "@/components/action/ActionPlan"
import { EvidenceList } from "@/components/evidence/EvidenceList"
import { HypothesisRanking } from "@/components/hypothesis/HypothesisRanking"
import { OptimizationCard } from "@/components/optimization/OptimizationCard"
import LogInput from "@/components/shared/LogInput"
import { AppShell } from "@/components/shell/AppShell"
import { ExecutiveSummary } from "@/components/summary/ExecutiveSummary"
import { TriageCard } from "@/components/triage/TriageCard"

export default function Home() {
  return (
    <AppShell>
      {/* Hero / page title row */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Incident response
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Triage console
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste raw logs, inspect ranked hypotheses, and walk the HITL-gated runbook.
          </p>
        </div>
      </div>

      {/*
        Datadog-style dashboard grid. On lg+ the triage card and hypothesis
        ranking sit side-by-side as the "situation" row; on smaller screens
        everything just stacks. Grid gap mirrors the card radius so the
        visual rhythm stays consistent.
      */}
      <div className="space-y-6">
        <LogInput />

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <TriageCard />
          </div>
          <div className="lg:col-span-2">
            <HypothesisRanking />
          </div>
        </div>

        <EvidenceList />

        <div className="grid gap-6 lg:grid-cols-2">
          <ActionPlan />
          <ExecutiveSummary />
        </div>

        {/*
          feature6 코드 최적화 카드. optimization 데이터가 없을 때는 컴포넌트가
          스스로 null 을 반환하므로 레이아웃에 빈 공간이 생기지 않는다.
        */}
        <OptimizationCard />
      </div>
    </AppShell>
  )
}
