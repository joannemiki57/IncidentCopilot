"use client"

import { Activity, Check, ChevronDown, Eye, EyeOff, Loader2, Play, Radio, Terminal } from "lucide-react"
import { useState } from "react"

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
import {
  useIncidentStore,
  type ScenarioHint,
  type StageName,
} from "@/lib/store"

// 각 시나리오별 대표 로그 스니펫. Try sample 선택 시 textarea에 자동 주입된다.
// "latest" 는 팀원 feature-split 파이프라인 출력을 라이브로 불러오는 경로로,
// 현재는 HDFS 시나리오 기반이라 관련 로그 스니펫을 그대로 프리뷰로 쓴다.
const SAMPLE_LOGS: Record<ScenarioHint, string> = {
  "db-saturation":
    "2026-04-18 10:15:30 FATAL: DB connection pool exhausted. 0 active connections available.\n2026-04-18 10:15:28 WARN db.pool: active=100/100 queued=47\n2026-04-18 10:14:22 INFO deploy: applied config diff -db_pool_size=200 +db_pool_size=100",
  "hdfs-failure":
    "2026-04-18 10:16:05 ERROR dfs.DataNode: Connection refused from 192.168.1.10. Timeout during block replication.\n2026-04-18 10:16:10 WARN dfs.NameNode: Missing heartbeat from DataNode 192.168.1.10",
  "bgl-hardware":
    "- 1117838570 2005.06.03 R02-M1-N0-C:J12-U11 2005-06-03-15.42.50.675872 R02-M1-N0-C:J12-U11 RAS KERNEL INFO instruction cache parity error corrected",
  latest:
    "2026-04-19 02:17:27 ERROR dfs.DataNode$PacketResponder: PacketResponder for block blk_123 terminates with error: Connection refused\n[Loaded from live pipeline output — data/feature1..5.json]",
}

const SAMPLE_LABELS: Record<ScenarioHint, string> = {
  "db-saturation": "DB saturation (checkout failure)",
  "hdfs-failure": "HDFS DataNode failure",
  "bgl-hardware": "BGL hardware parity error",
  latest: "Try latest (real pipeline output)",
}

// 드롭다운 최상단이 "latest" — 가장 최근 실제 파이프라인 결과. 기존 3개 샘플은 그 뒤로.
const SAMPLE_ORDER: ScenarioHint[] = [
  "latest",
  "db-saturation",
  "hdfs-failure",
  "bgl-hardware",
]

// 라이브 SSE 스트림이 들어오는 순서. 백엔드 _run_pipeline 의 yield 순서와 동일해야
// progress dot 의 정렬이 맞는다.
const STAGE_ORDER: readonly { key: StageName; label: string }[] = [
  { key: "triage", label: "Triage" },
  { key: "rca", label: "RCA" },
  { key: "evidence", label: "Evidence" },
  { key: "action_plan", label: "Action" },
  { key: "summary", label: "Summary" },
  { key: "optimization", label: "Optim" },
] as const

export default function LogInput() {
  const logInput = useIncidentStore((s) => s.logInput)
  const setLogInput = useIncidentStore((s) => s.setLogInput)
  const isAnalyzing = useIncidentStore((s) => s.isAnalyzing)
  const analyze = useIncidentStore((s) => s.analyze)
  const analyzeStream = useIncidentStore((s) => s.analyzeStream)
  const completedStages = useIncidentStore((s) => s.completedStages)
  const error = useIncidentStore((s) => s.error)
  const lastAnalyzedAt = useIncidentStore((s) => s.lastAnalyzedAt)

  // Watcher
  const isWatchingLogs = useIncidentStore((s) => s.isWatchingLogs)
  const watchPath = useIncidentStore((s) => s.watchPath)
  const startWatchingLogs = useIncidentStore((s) => s.startWatchingLogs)
  const stopWatchingLogs = useIncidentStore((s) => s.stopWatchingLogs)

  const [inputPath, setInputPath] = useState(watchPath || "storage/logs/app.log")

  // Play 버튼은 라이브 파이프라인으로 직결된다. textarea 내용이 FastAPI 로 흘러가서
  // stage 단위로 카드들이 채워진다. 기존 Try sample 드롭다운(데모 JSON 로더)은 건드리지 않음.
  const handleAnalyze = () => {
    if (isAnalyzing || logInput.trim().length === 0) return
    void analyzeStream()
  }

  const handleToggleWatch = () => {
    if (isWatchingLogs) {
      stopWatchingLogs()
    } else {
      void startWatchingLogs(inputPath)
    }
  }

  const handleSample = (hint: ScenarioHint) => {
    // textarea에 시나리오 샘플 로그를 채우고 바로 해당 scenarioHint로 분석을 시작한다.
    // 샘플 플로우는 프리컴파일된 JSON fixture 경로 — 데모 용도로 유지.
    setLogInput(SAMPLE_LOGS[hint])
    void analyze(hint)
  }

  const analyzeDisabled = isAnalyzing || logInput.trim().length === 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Terminal className="size-4 text-primary" />
              Incident logs
            </CardTitle>
            <CardDescription>
              Paste raw logs or pick a sample scenario to stream through the pipeline
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center overflow-hidden rounded-md border bg-background/50 focus-within:ring-1 focus-within:ring-primary/40">
              <div className="flex items-center px-2.5 text-muted-foreground">
                {isWatchingLogs ? (
                  <Activity className="size-3.5 animate-pulse text-[--color-success]" />
                ) : (
                  <Eye className="size-3.5" />
                )}
              </div>
              <input
                type="text"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                placeholder="Watcher path..."
                className="h-8 w-40 bg-transparent py-1 text-[11px] font-mono outline-none placeholder:text-muted-foreground/50 sm:w-56"
                disabled={isWatchingLogs}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleWatch}
                className={`h-8 rounded-none border-l px-3 text-[10px] font-bold uppercase tracking-wider ${
                  isWatchingLogs
                    ? "text-[--color-critical] hover:bg-[--color-critical]/10"
                    : "text-primary hover:bg-primary/10"
                }`}
              >
                {isWatchingLogs ? (
                  <>
                    <EyeOff className="mr-1.5 size-3" />
                    Stop
                  </>
                ) : (
                  <>
                    <Radio className="mr-1.5 size-3" />
                    Watch
                  </>
                )}
              </Button>
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
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={logInput}
          onChange={(event) => setLogInput(event.target.value)}
          placeholder="Paste incident logs here. Example: 2026-04-18 10:15:30 FATAL: DB connection pool exhausted..."
          className="min-h-[160px] font-mono text-[13px] bg-background/60"
          disabled={isAnalyzing}
        />
        {error && (
          <div className="mt-3 rounded-md border border-[--color-critical]/40 bg-[--color-critical]/10 p-2.5 text-xs text-[--color-critical]">
            <span className="font-mono">{error}</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
          <span>
            {logInput.trim().length > 0
              ? `${logInput.split(/\n/).length} lines · ${logInput.length} chars`
              : "ready for input"}
          </span>
          {lastAnalyzedAt && (
            <span className="flex items-center gap-1 text-primary">
              <Check className="size-3" />
              Analyze finished at {lastAnalyzedAt}
            </span>
          )}
          {(isAnalyzing || completedStages.length > 0) && (
            <span className="flex items-center gap-1.5">
              {STAGE_ORDER.map(({ key, label }) => {
                const done = completedStages.includes(key)
                // 진행 중 stage = "다음 stage" — 가장 최근 완료 stage 바로 다음.
                const currentIdx = STAGE_ORDER.findIndex(
                  (s) => !completedStages.includes(s.key)
                )
                const inflight =
                  isAnalyzing &&
                  currentIdx >= 0 &&
                  STAGE_ORDER[currentIdx].key === key
                return (
                  <span
                    key={key}
                    className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-[1px] text-[9px] uppercase tracking-wider transition-colors ${
                      done
                        ? "bg-[--color-success]/15 text-[--color-success]"
                        : inflight
                        ? "bg-primary/15 text-primary"
                        : "bg-muted/40 text-muted-foreground/50"
                    }`}
                    title={label}
                  >
                    {done ? (
                      <Check className="size-2.5" />
                    ) : inflight ? (
                      <Loader2 className="size-2.5 animate-spin" />
                    ) : (
                      <span className="size-1 rounded-full bg-current" />
                    )}
                    {label}
                  </span>
                )
              })}
            </span>
          )}
        </div>
        <Button onClick={handleAnalyze} disabled={analyzeDisabled}>
          <Play className="size-3.5" />
          {isAnalyzing ? "Streaming..." : "Analyze"}
        </Button>
      </CardFooter>
    </Card>
  )
}
