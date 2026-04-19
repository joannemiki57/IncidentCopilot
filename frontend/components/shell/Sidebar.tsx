"use client"

import {
  Activity,
  CircleDot,
  Database,
  HardDrive,
  Radar,
  Sparkles,
} from "lucide-react"
import type { ComponentType, SVGProps } from "react"

import { useIncidentStore, type ScenarioHint } from "@/lib/store"

import { ThemeToggle } from "./ThemeToggle"

interface ScenarioEntry {
  hint: ScenarioHint
  label: string
  sub: string
  // Lucide icon component.
  icon: ComponentType<SVGProps<SVGSVGElement>>
  // Pinned "newest" style for the live-pipeline entry.
  isLive?: boolean
}

// Sidebar navigation — clicking a scenario kicks off the same analyze flow as
// the Try Sample dropdown in LogInput. Kept intentionally lightweight so this
// can also double as a history pane later.
const SCENARIOS: ScenarioEntry[] = [
  {
    hint: "latest",
    label: "Latest run",
    sub: "Live pipeline output",
    icon: Sparkles,
    isLive: true,
  },
  {
    hint: "db-saturation",
    label: "DB saturation",
    sub: "Connection pool exhaustion",
    icon: Database,
  },
  {
    hint: "hdfs-failure",
    label: "HDFS DataNode",
    sub: "Block replication timeout",
    icon: HardDrive,
  },
  {
    hint: "bgl-hardware",
    label: "BGL hardware",
    sub: "Kernel parity error",
    icon: Radar,
  },
]

export function Sidebar() {
  const analyze = useIncidentStore((s) => s.analyze)
  const isAnalyzing = useIncidentStore((s) => s.isAnalyzing)
  const sourceDataset = useIncidentStore(
    (s) => s.analysisResult?.sourceDataset ?? null
  )

  // Match active scenario by dataset label — the backend assembles
  // sourceDataset from scenario key, so the mapping is deterministic.
  const DATASET_TO_HINT: Record<string, ScenarioHint> = {
    "DB Saturation": "db-saturation",
    "HDFS Failure": "hdfs-failure",
    "BGL Hardware": "bgl-hardware",
    "HDFS Pipeline Output": "latest",
  }
  const activeHint: ScenarioHint | null = sourceDataset
    ? (DATASET_TO_HINT[sourceDataset] ?? null)
    : null

  const handleSelect = (hint: ScenarioHint) => {
    if (isAnalyzing) return
    void analyze(hint)
  }

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-sidebar-border">
        <div className="relative grid place-items-center size-8 rounded-md bg-primary/15 ring-1 ring-primary/40">
          <Activity className="size-4 text-primary" />
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[--color-success] ring-2 ring-sidebar" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">
            Incident Copilot
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/60">
            Observability console
          </div>
        </div>
      </div>

      {/* Scenarios */}
      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-4 mb-2 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/50">
          Scenarios
        </div>
        <nav className="px-2 space-y-0.5">
          {SCENARIOS.map((entry) => {
            const isActive = activeHint === entry.hint
            const Icon = entry.icon
            return (
              <button
                key={entry.hint}
                type="button"
                onClick={() => handleSelect(entry.hint)}
                disabled={isAnalyzing}
                className={`group relative w-full flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {/* Active rail */}
                <span
                  className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r-full transition-colors ${
                    isActive ? "bg-primary" : "bg-transparent"
                  }`}
                />
                <Icon
                  className={`size-4 mt-0.5 shrink-0 ${
                    isActive
                      ? "text-primary"
                      : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">
                      {entry.label}
                    </span>
                    {entry.isLive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[--color-success]/15 px-1.5 py-[1px] text-[9px] uppercase tracking-wider text-[--color-success]">
                        <CircleDot className="size-2" />
                        live
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-sidebar-foreground/55 truncate">
                    {entry.sub}
                  </div>
                </div>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Footer — theme toggle + build tag */}
      <div className="border-t border-sidebar-border p-2 space-y-1">
        <ThemeToggle />
        <div className="px-2 py-1 text-[10px] text-sidebar-foreground/40 font-mono">
          v0 · dark-first
        </div>
      </div>
    </aside>
  )
}
