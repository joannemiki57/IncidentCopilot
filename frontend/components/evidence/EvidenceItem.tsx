"use client"

import { FileText } from "lucide-react"

import type { Evidence } from "@/lib/types"

interface EvidenceItemProps {
  evidence: Evidence
  isHighlighted: boolean
  isSelectionActive: boolean
}

export function EvidenceItem({
  evidence,
  isHighlighted,
  isSelectionActive,
}: EvidenceItemProps) {
  return (
    <div
      className={`rounded-lg border p-3 transition-all duration-300 ${
        isHighlighted
          ? "border-indigo-300 bg-indigo-50/50 border-l-4 border-l-indigo-500"
          : "border-slate-200 bg-white"
      } ${
        isSelectionActive && !isHighlighted ? "opacity-40" : "opacity-100"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Left icon — set to indigo only when highlighted */}
        <div className="flex-shrink-0 mt-0.5">
          <FileText
            className={`h-4 w-4 ${
              isHighlighted ? "text-indigo-500" : "text-slate-400"
            }`}
          />
        </div>

        {/* Content body */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-800 leading-relaxed">
            {evidence.text}
          </p>

          {/* Log line / Timestamp metadata (optional) */}
          {evidence.sourceLogLine !== undefined && (
            <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">Line {evidence.sourceLogLine}</span>
              {evidence.timestamp && (
                <>
                  <span>·</span>
                  <span className="font-mono">{evidence.timestamp}</span>
                </>
              )}
            </div>
          )}

          {/* Actual log snippet — the core part showing the "source" of the evidence */}
          {evidence.sourceLogSnippet && (
            <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
              <code className="text-xs text-slate-700 font-mono block whitespace-pre-wrap break-all">
                {evidence.sourceLogSnippet}
              </code>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
