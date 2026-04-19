import { create } from "zustand"

import { incidentAnalysisSchema } from "@/lib/schema"
import type { IncidentAnalysis } from "@/lib/types"

// "latest" 는 팀원 feature-split 파이프라인(data/feature1..5.json) 경로로 라우팅된다.
// 기존 3개 샘플은 단일 파일(data/{scenario}.json) 통합 포맷으로 그대로 동작.
export type ScenarioHint =
  | "db-saturation"
  | "hdfs-failure"
  | "bgl-hardware"
  | "latest"

interface IncidentStore {
  // 입력 상태
  logInput: string
  setLogInput: (text: string) => void

  // 분석 상태
  isAnalyzing: boolean
  analysisResult: IncidentAnalysis | null
  error: string | null

  // UI 상호작용 상태
  selectedHypothesisId: string | null
  selectHypothesis: (id: string | null) => void

  // 파생 상태: 선택된 가설의 evidenceIds
  getHighlightedEvidenceIds: () => string[]

  // 액션
  analyze: (scenarioHint?: ScenarioHint) => Promise<void>
  reset: () => void
}

const initialState: Pick<
  IncidentStore,
  | "logInput"
  | "isAnalyzing"
  | "analysisResult"
  | "error"
  | "selectedHypothesisId"
> = {
  logInput: "",
  isAnalyzing: false,
  analysisResult: null,
  error: null,
  selectedHypothesisId: null,
}

export const useIncidentStore = create<IncidentStore>((set, get) => ({
  ...initialState,

  setLogInput: (text) => set({ logInput: text }),

  selectHypothesis: (id) =>
    set((state) => ({
      // 같은 id를 다시 클릭하면 선택 해제, 다른 id면 그 id로 전환.
      selectedHypothesisId: state.selectedHypothesisId === id ? null : id,
    })),

  getHighlightedEvidenceIds: () => {
    const { selectedHypothesisId, analysisResult } = get()
    if (!selectedHypothesisId || !analysisResult?.hypotheses) return []

    const hypothesis = analysisResult.hypotheses.find(
      (h) => h.id === selectedHypothesisId
    )
    return hypothesis?.evidenceIds ?? []
  },

  analyze: async (scenarioHint) => {
    set({
      isAnalyzing: true,
      error: null,
      selectedHypothesisId: null,
    })

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logText: get().logInput,
          scenarioHint,
        }),
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => "")
        throw new Error(
          `analyze failed: ${response.status} ${response.statusText}${
            errBody ? ` — ${errBody}` : ""
          }`
        )
      }

      const json: unknown = await response.json()
      const parsed = incidentAnalysisSchema.safeParse(json)

      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]
        const path = firstIssue?.path.join(".") || "<root>"
        throw new Error(
          `schema validation failed at ${path}: ${
            firstIssue?.message ?? "unknown issue"
          }`
        )
      }

      set({
        analysisResult: parsed.data,
        isAnalyzing: false,
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isAnalyzing: false,
      })
    }
  },

  reset: () => set({ ...initialState }),
}))
