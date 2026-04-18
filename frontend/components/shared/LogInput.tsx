"use client"

import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { useIncidentStore, type ScenarioHint } from "@/lib/store"

// Representative log snippets for each scenario. Automatically injected into the textarea when 'Try sample' is selected.
const SAMPLE_LOGS: Record<ScenarioHint, string> = {
  "db-saturation":
    "2026-04-18 10:15:30 FATAL: DB connection pool exhausted. 0 active connections available.\n2026-04-18 10:15:28 WARN db.pool: active=100/100 queued=47\n2026-04-18 10:14:22 INFO deploy: applied config diff -db_pool_size=200 +db_pool_size=100",
  "hdfs-failure":
    "2026-04-18 10:16:05 ERROR dfs.DataNode: Connection refused from 192.168.1.10. Timeout during block replication.\n2026-04-18 10:16:10 WARN dfs.NameNode: Missing heartbeat from DataNode 192.168.1.10",
  "bgl-hardware":
    "- 1117838570 2005.06.03 R02-M1-N0-C:J12-U11 2005-06-03-15.42.50.675872 R02-M1-N0-C:J12-U11 RAS KERNEL INFO instruction cache parity error corrected",
}

const SAMPLE_LABELS: Record<ScenarioHint, string> = {
  "db-saturation": "DB saturation (checkout failure)",
  "hdfs-failure": "HDFS DataNode failure",
  "bgl-hardware": "BGL hardware parity error",
}

const SAMPLE_ORDER: ScenarioHint[] = [
  "db-saturation",
  "hdfs-failure",
  "bgl-hardware",
]

export default function LogInput() {
  const logInput = useIncidentStore((s) => s.logInput)
  const setLogInput = useIncidentStore((s) => s.setLogInput)
  const isAnalyzing = useIncidentStore((s) => s.isAnalyzing)
  const analyze = useIncidentStore((s) => s.analyze)

  const handleAnalyze = () => {
    if (isAnalyzing || logInput.trim().length === 0) return
    void analyze()
  }

  const handleSample = (hint: ScenarioHint) => {
    // Fill the textarea with the scenario sample logs and immediately start the analysis with the corresponding scenarioHint.
    setLogInput(SAMPLE_LOGS[hint])
    void analyze(hint)
  }

  const analyzeDisabled = isAnalyzing || logInput.trim().length === 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Incident logs</CardTitle>
            <CardDescription>
              Paste raw logs or try a sample scenario
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isAnalyzing}
                aria-label="Try a sample scenario"
              >
                Try sample
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SAMPLE_ORDER.map((hint) => (
                <DropdownMenuItem
                  key={hint}
                  onClick={() => handleSample(hint)}
                >
                  {SAMPLE_LABELS[hint]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={logInput}
          onChange={(event) => setLogInput(event.target.value)}
          placeholder="Paste incident logs here. Example: 2026-04-18 10:15:30 FATAL: DB connection pool exhausted..."
          className="min-h-[180px] font-mono text-sm"
          disabled={isAnalyzing}
        />
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button onClick={handleAnalyze} disabled={analyzeDisabled}>
          {isAnalyzing ? "Analyzing..." : "Analyze"}
        </Button>
      </CardFooter>
    </Card>
  )
}
