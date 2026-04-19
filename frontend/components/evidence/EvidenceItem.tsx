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
    ? `border-border bg-card border-l-2 ${getTagBorderColor(evidence.tag)}`
    : "border-border bg-card/60"

  return (
    <div
      className={`rounded-lg border p-3 transition-all duration-300 ${borderClasses} ${
        isSelectionActive && !isHighlighted ? "opacity-40" : "opacity-100"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* 좌측 아이콘 — 강조 상태일 때만 primary */}
        <div className="flex-shrink-0 mt-0.5">
          <FileText
            className={`h-4 w-4 ${
              isHighlighted ? "text-primary" : "text-muted-foreground/60"
            }`}
          />
        </div>

        {/* 본문 */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground/90 leading-relaxed">
            {evidence.text}
            {evidence.tag && <TagChip tag={evidence.tag} />}
          </p>

          {/* 로그 라인 / 타임스탬프 메타 (선택적으로 있을 때만) */}
          {evidence.sourceLogLine !== undefined && (
            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">Line {evidence.sourceLogLine}</span>
              {evidence.timestamp && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="font-mono">{evidence.timestamp}</span>
                </>
              )}
            </div>
          )}

          {/* 실제 로그 스니펫 — 증거의 "출처"를 눈에 보여주는 핵심 부분 */}
          {evidence.sourceLogSnippet && (
            <div className="mt-2 rounded border border-border bg-muted/30 p-2">
              <code className="text-[11px] text-foreground/85 font-mono block whitespace-pre-wrap break-all">
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
// tag 가 없으면 기존 primary fallback 을 유지한다.
function getTagBorderColor(tag: Evidence["tag"]): string {
  if (tag === "Critical") return "border-l-[--color-critical]"
  if (tag === "Warning") return "border-l-[--color-warning]"
  if (tag === "Supporting") return "border-l-muted-foreground/40"
  return "border-l-primary"
}

function TagChip({ tag }: { tag: NonNullable<Evidence["tag"]> }) {
  // Critical / Warning / Supporting 은 고유 색을 유지, 신규 태그(Context / Conflicting) 는
  // 아직 전용 디자인이 없어 중립 스타일로 렌더.
  const styles: Partial<Record<NonNullable<Evidence["tag"]>, string>> = {
    Critical: "bg-[--color-critical]/15 text-[--color-critical]",
    Warning: "bg-[--color-warning]/15 text-[--color-warning]",
    Supporting: "bg-muted/60 text-muted-foreground",
  }
  const style = styles[tag] ?? "bg-muted/60 text-muted-foreground"
  return (
    <span
      className={`ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style}`}
    >
      {tag}
    </span>
  )
}
