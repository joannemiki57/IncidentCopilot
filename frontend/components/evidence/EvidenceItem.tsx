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
  const borderClasses = isHighlighted
    ? `border-slate-200 bg-slate-50/30 border-l-4 ${getTagBorderColor(
        evidence.tag
      )}`
    : "border-slate-200 bg-white"

  return (
    <div
      className={`rounded-lg border p-3 transition-all duration-300 ${borderClasses} ${
        isSelectionActive && !isHighlighted ? "opacity-40" : "opacity-100"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* 좌측 아이콘 — 강조 상태일 때만 indigo로 */}
        <div className="flex-shrink-0 mt-0.5">
          <FileText
            className={`h-4 w-4 ${
              isHighlighted ? "text-indigo-500" : "text-slate-400"
            }`}
          />
        </div>

        {/* 본문 */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-800 leading-relaxed">
            {evidence.text}
            {evidence.tag && <TagChip tag={evidence.tag} />}
          </p>

          {/* 로그 라인 / 타임스탬프 메타 (선택적으로 있을 때만) */}
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

          {/* 실제 로그 스니펫 — 증거의 "출처"를 눈에 보여주는 핵심 부분 */}
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

// tag 가 지정되어 있으면 좌측 테두리 색상을 그 심각도에 맞춰 바꾸고,
// tag 가 없으면 기존 indigo fallback 을 유지한다.
function getTagBorderColor(tag: Evidence["tag"]): string {
  if (tag === "Critical") return "border-l-red-500"
  if (tag === "Warning") return "border-l-amber-500"
  if (tag === "Supporting") return "border-l-slate-400"
  return "border-l-indigo-500"
}

function TagChip({ tag }: { tag: NonNullable<Evidence["tag"]> }) {
  const styles: Record<NonNullable<Evidence["tag"]>, string> = {
    Critical: "bg-red-100 text-red-700",
    Warning: "bg-amber-100 text-amber-700",
    Supporting: "bg-slate-100 text-slate-600",
  }
  return (
    <span
      className={`ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[tag]}`}
    >
      {tag}
    </span>
  )
}
