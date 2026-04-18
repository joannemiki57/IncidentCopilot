import LogInput from "@/components/shared/LogInput"
import { EvidenceList } from "@/components/evidence/EvidenceList"
import { HypothesisRanking } from "@/components/hypothesis/HypothesisRanking"
import { TriageCard } from "@/components/triage/TriageCard"

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-medium">Incident Copilot</h1>
        <p className="text-muted-foreground text-sm">
          AI-powered incident analysis
        </p>
      </header>

      <div className="space-y-6">
        <LogInput />
        <TriageCard />
        <HypothesisRanking />
        <EvidenceList />
      </div>
    </main>
  )
}
