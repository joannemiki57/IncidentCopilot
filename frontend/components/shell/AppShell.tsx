"use client"

import { Bell, Command, Search } from "lucide-react"
import type { ReactNode } from "react"

import { useIncidentStore } from "@/lib/store"

import { Sidebar } from "./Sidebar"

interface AppShellProps {
  children: ReactNode
}

// Datadog-style dashboard shell:
//   [ Sidebar ] [ Topbar / page scroll                  ]
// Sidebar hides below lg: on smaller viewports we fall back to a topbar-only
// layout — the existing cards stack as before so nothing breaks on mobile.
export function AppShell({ children }: AppShellProps) {
  const isAnalyzing = useIncidentStore((s) => s.isAnalyzing)
  const incidentId = useIncidentStore(
    (s) => s.analysisResult?.incidentId ?? null
  )
  const sourceDataset = useIncidentStore(
    (s) => s.analysisResult?.sourceDataset ?? null
  )
  const analyzedAt = useIncidentStore(
    (s) => s.analysisResult?.analyzedAt ?? null
  )

  return (
    <div className="flex min-h-dvh w-full">
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar — status pill + pseudo-command bar. Purely cosmetic surface;
            the search input is non-functional placeholder chrome, kept to sell
            the observability-console aesthetic without shipping fake features. */}
        <header className="sticky top-0 z-10 h-14 border-b border-border bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-full max-w-[1400px] items-center gap-3 px-4 sm:px-6">
            {/* Status pill */}
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-2.5 py-1 text-xs">
              <span
                className={`relative inline-flex size-1.5 rounded-full ${
                  isAnalyzing
                    ? "bg-[--color-warning]"
                    : incidentId
                      ? "bg-[--color-success]"
                      : "bg-muted-foreground/60"
                }`}
              >
                {isAnalyzing && (
                  <span className="absolute inset-0 -m-1 rounded-full bg-[--color-warning]/40 animate-ping" />
                )}
              </span>
              <span className="text-muted-foreground">
                {isAnalyzing
                  ? "Analyzing"
                  : incidentId
                    ? "Ready"
                    : "Awaiting input"}
              </span>
              {incidentId && (
                <>
                  <span className="text-border">|</span>
                  <span className="font-mono text-foreground/80">
                    #{incidentId.slice(0, 10)}
                  </span>
                </>
              )}
              {sourceDataset && (
                <>
                  <span className="text-border">|</span>
                  <span className="text-muted-foreground">{sourceDataset}</span>
                </>
              )}
            </div>

            {/* Pseudo command bar — decorative. */}
            <div className="hidden md:flex flex-1 items-center gap-2 rounded-md border border-border bg-card/40 px-3 py-1.5 text-sm text-muted-foreground">
              <Search className="size-4" />
              <span className="truncate">Search incidents, runbooks, services…</span>
              <span className="ml-auto inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                <Command className="size-3" />K
              </span>
            </div>
            <div className="md:hidden flex-1" />

            <div className="flex items-center gap-2">
              {analyzedAt && (
                <span className="hidden sm:block text-[11px] font-mono text-muted-foreground">
                  analyzed {formatAnalyzedAt(analyzedAt)}
                </span>
              )}
              <button
                type="button"
                className="relative grid place-items-center size-8 rounded-md border border-border bg-card/50 text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="size-4" />
                {incidentId && (
                  <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[--color-critical]" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

// Best-effort relative time for the topbar. Full ISO stays inside cards.
function formatAnalyzedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const diff = Date.now() - d.getTime()
  const mins = Math.round(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}
