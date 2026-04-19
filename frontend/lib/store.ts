import { create } from "zustand"

import { assembleFromRealOutput } from "@/lib/pipeline/assemble-incident"
import { incidentAnalysisSchema } from "@/lib/schema"
import type { IncidentAnalysis, TeamRealOutput } from "@/lib/types"

// "latest" 는 팀원 feature-split 파이프라인(data/feature1..5.json) 경로로 라우팅된다.
// 기존 3개 샘플은 단일 파일(data/{scenario}.json) 통합 포맷으로 그대로 동작.
export type ScenarioHint =
  | "db-saturation"
  | "hdfs-failure"
  | "bgl-hardware"
  | "latest"

// 라이브 스트림에서 백엔드가 내려주는 stage 이벤트의 stage 이름. FastAPI `_run_pipeline`
// 쪽 SSE payload 와 1:1 대응되므로 순서/철자 동기화 필수.
export type StageName =
  | "triage"
  | "rca"
  | "evidence"
  | "action_plan"
  | "summary"
  | "optimization"

interface IncidentStore {
  // 입력 상태
  logInput: string
  setLogInput: (text: string) => void

  // 분석 상태
  isAnalyzing: boolean
  analysisResult: IncidentAnalysis | null
  error: string | null

  // 라이브 스트림 전용 상태 (데모 경로에선 항상 빈 배열 / null)
  completedStages: StageName[]
  runId: string | null
  lastAnalyzedAt: string | null
  lastObservedState: "healthy" | "error" | null

  // UI 상호작용 상태
  selectedHypothesisId: string | null
  selectHypothesis: (id: string | null) => void

  // 로그 감시(Watch) 상태
  isWatchingLogs: boolean
  watchPath: string
  startWatchingLogs: (path: string) => Promise<void>
  stopWatchingLogs: () => void

  // 파생 상태: 선택된 가설의 evidenceIds
  getHighlightedEvidenceIds: () => string[]

  // 액션
  analyze: (scenarioHint?: ScenarioHint) => Promise<void>
  analyzeStream: (logText?: string, persona?: string) => Promise<void>
  reset: () => void
}

const initialState: Pick<
  IncidentStore,
  | "logInput"
  | "isAnalyzing"
  | "analysisResult"
  | "error"
  | "selectedHypothesisId"
  | "completedStages"
  | "runId"
> = {
  logInput: "",
  isAnalyzing: false,
  analysisResult: null,
  error: null,
  selectedHypothesisId: null,
  completedStages: [],
  runId: null,
  lastAnalyzedAt: null,
  lastObservedState: null,
}

// SSE 프레임 파싱 — 하나의 프레임은 공백 라인(\n\n) 으로 구분되고, 각 프레임은
// `event: <name>\ndata: <json>` 형태. data 가 여러 줄일 수도 있으니 누적해서 이어붙인다.
// EventSource 를 못 쓰는 이유 = POST 요청이 필요해서.
function parseSseFrames(
  buffer: string
): { frames: Array<{ event: string; data: string }>; remainder: string } {
  const frames: Array<{ event: string; data: string }> = []
  let remainder = buffer
  // 완결된 프레임만 꺼내고, 끝에 붙은 incomplete chunk 는 remainder 로 돌려준다.
  while (true) {
    const boundary = remainder.indexOf("\n\n")
    if (boundary === -1) break
    const rawFrame = remainder.slice(0, boundary)
    remainder = remainder.slice(boundary + 2)

    let event = "message"
    const dataLines: string[] = []
    for (const rawLine of rawFrame.split("\n")) {
      // 주석 라인 (`:` 으로 시작) 은 keep-alive 용도로 무시.
      if (!rawLine || rawLine.startsWith(":")) continue
      const colon = rawLine.indexOf(":")
      if (colon === -1) continue
      const field = rawLine.slice(0, colon)
      // 표준 SSE 는 ": " (colon + space) 이후가 값. space 가 없는 경우도 허용.
      const value =
        rawLine[colon + 1] === " "
          ? rawLine.slice(colon + 2)
          : rawLine.slice(colon + 1)
      if (field === "event") {
        event = value
      } else if (field === "data") {
        dataLines.push(value)
      }
      // id / retry 필드는 현재 백엔드가 내려주지 않으므로 무시.
    }
    frames.push({ event, data: dataLines.join("\n") })
  }
  return { frames, remainder }
}

// Stage payload 를 raw TeamRealOutput 의 해당 슬롯에 누적해 붙인다. 백엔드 SSE 포맷
// (_run_pipeline in backend/server.py) 이 기준. 여기가 바뀌면 assemble-incident 까지
// 연쇄로 틀어지므로 정확히 1:1 로 유지.
function mergeStageIntoRaw(
  raw: TeamRealOutput,
  stage: StageName,
  payload: unknown
): TeamRealOutput {
  // 모든 payload 가 신뢰 가능한 JSON object 라는 보장은 없다 — 방어적으로만 캐스팅.
  const obj = (payload ?? {}) as Record<string, unknown>
  switch (stage) {
    case "triage":
      // 백엔드가 Triage Results / Context Metadata / log_raw 를 담아 그대로 내려줌.
      raw.triage = obj as TeamRealOutput["triage"]
      return raw
    case "rca": {
      // payload = { root_cause_analysis: {...} }
      const rca = (obj.root_cause_analysis ?? obj) as Record<string, unknown>
      raw.rca = { root_cause_analysis: rca } as TeamRealOutput["rca"]
      return raw
    }
    case "evidence":
      // payload 는 array — feature3_evidence.json 과 동일 shape.
      raw.evidence = (Array.isArray(payload)
        ? payload
        : []) as TeamRealOutput["evidence"]
      return raw
    case "action_plan": {
      // payload = { plan: {...}, safety_evaluation: {...} }
      const plan = obj.plan as TeamRealOutput["action_plan"] | undefined
      const safety = obj.safety_evaluation as
        | TeamRealOutput["safety_evaluation"]
        | undefined
      if (plan) raw.action_plan = plan
      if (safety) raw.safety_evaluation = safety
      return raw
    }
    case "summary": {
      // payload = { sre_markdown: string, executive_markdown: string }
      if (typeof obj.sre_markdown === "string") {
        raw.summary = obj.sre_markdown
      }
      if (typeof obj.executive_markdown === "string") {
        raw.executive_markdown = obj.executive_markdown
      }
      return raw
    }
    case "optimization":
      // optimization 은 object 또는 null. null/undefined 면 그대로 비워둠.
      if (obj && typeof obj === "object") {
        raw.optimization = obj as TeamRealOutput["optimization"]
      }
      return raw
    default:
      return raw
  }
}

export const useIncidentStore = create<IncidentStore>((set, get) => ({
  ...initialState,
  isWatchingLogs: false,
  watchPath: "",

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
      completedStages: [],
      runId: null,
      lastAnalyzedAt: null,
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
        lastAnalyzedAt: new Date().toLocaleTimeString(),
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isAnalyzing: false,
      })
    }
  },

  // === 라이브 스트림 경로 ===
  // POST /api/analyze/stream (Next.js proxy → FastAPI) 에서 SSE 를 받아 stage 가
  // 도착할 때마다 TeamRealOutput 을 누적 조립해 analysisResult 를 갱신한다.
  // 카드들은 기존 렌더 분기(데이터 유무)를 그대로 쓰면 자연스럽게 점진 표시됨.
  analyzeStream: async (logText, persona) => {
    const text = (logText ?? get().logInput).trim()
    if (text.length === 0) {
      set({ error: "empty log input", isAnalyzing: false })
      return
    }

    set({
      isAnalyzing: true,
      error: null,
      selectedHypothesisId: null,
      analysisResult: null, // Clear existing result to show skeletons
      completedStages: [],
      runId: null,
      lastAnalyzedAt: null,
    })

    // 이 클로저가 모든 stage 의 raw 상태를 들고 있는 "accumulator". React 렌더 사이에
    // 공유되지 않아야 하므로 action 실행 단위 로컬 변수로 유지.
    const raw: TeamRealOutput = {}
    let buffer = ""

    const reassemble = () => {
      try {
        const assembled = assembleFromRealOutput("latest", raw)
        const parsed = incidentAnalysisSchema.safeParse(assembled)
        if (parsed.success) {
          set({ analysisResult: parsed.data })
        }
        // 부분 조립은 schema 가 요구하는 최소 필드를 아직 못 만족할 수 있으므로
        // 실패하면 조용히 건너뛴다 (다음 stage 에서 성공할 것).
      } catch {
        // assembleFromRealOutput 내부에서 throw 하더라도 스트림 자체는 계속 읽어야 함.
      }
    }

    try {
      const response = await fetch("/api/analyze/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          log_text: text,
          ...(persona ? { persona } : {}),
        }),
      })

      if (!response.ok || !response.body) {
        const errBody = await response.text().catch(() => "")
        throw new Error(
          `stream failed: ${response.status} ${response.statusText}${
            errBody ? ` — ${errBody}` : ""
          }`
        )
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder("utf-8")

      // 읽기 루프. reader.read() 가 done:true 를 돌려줄 때까지 chunk 를 이어붙여
      // SSE 프레임 단위로 파싱한다. 이벤트 타입 분기:
      //   - stage      → raw 누적 + 재조립
      //   - done       → 종료 (완료 플래그 세팅)
      //   - error      → 에러 상태로 전환 후 루프 탈출
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const { frames, remainder } = parseSseFrames(buffer)
        buffer = remainder

        for (const frame of frames) {
          let dataJson: unknown = null
          if (frame.data.length > 0) {
            try {
              dataJson = JSON.parse(frame.data)
            } catch {
              // data 가 빈 문자열이거나 JSON 이 아닐 수 있음 — 이벤트 종류에 따라 처리.
              dataJson = frame.data
            }
          }

          if (frame.event === "stage") {
            const d = (dataJson ?? {}) as {
              stage?: StageName
              payload?: unknown
            }
            if (d.stage) {
              mergeStageIntoRaw(raw, d.stage, d.payload)
              set((state) => ({
                completedStages: state.completedStages.includes(d.stage!)
                  ? state.completedStages
                  : [...state.completedStages, d.stage!],
              }))
              reassemble()
            }
          } else if (frame.event === "done") {
            const d = (dataJson ?? {}) as { run_id?: string }
            if (d.run_id) set({ runId: d.run_id })
            // stream 쪽에서 정상 종료 신호. 루프는 reader.read() done 으로 자연 종료됨.
          } else if (frame.event === "error") {
            const d = (dataJson ?? {}) as { message?: string; stage?: string }
            const msg = d.message ?? "stream error"
            const where = d.stage ? ` (stage: ${d.stage})` : ""
            throw new Error(`${msg}${where}`)
          }
          // 그 외 이벤트(예: meta/heartbeat) 는 현재 UI 가 쓰지 않음.
        }
      }

      // 스트림이 끝나는 시점엔 이미 마지막 stage 까지 반영돼 있음. 마지막으로
      // 최종 조립 반영 및 분석 완료 시간 기록
      reassemble()
      set({ 
        isAnalyzing: false, 
        lastAnalyzedAt: new Date().toLocaleTimeString() 
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isAnalyzing: false,
      })
    }
  },

  startWatchingLogs: async (path: string) => {
    if (get().isWatchingLogs) return
    
    const controller = new AbortController()
    set({ isWatchingLogs: true, watchPath: path, error: null })

    // 전역 객체에 저장해 두었다가 stop 시점에 호출
    ;(window as any)._logWatchAbort = controller

    let buffer = ""
    try {
      const response = await fetch(`/api/logs/stream?path=${encodeURIComponent(path)}`, {
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
      })

      if (!response.ok || !response.body) {
        throw new Error(`Watch failed: ${response.statusText}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const { frames, remainder } = parseSseFrames(buffer)
        buffer = remainder

        for (const frame of frames) {
          if (frame.event === "log_line") {
            const data = JSON.parse(frame.data) as { text: string }
            const line = data.text

            set((state) => {
              const lines = state.logInput.split("\n")
              // 로그가 너무 많이 쌓이지 않도록 최대 200줄 유지 (Rolling Buffer)
              const newLines = [...lines, line].slice(-200)
              return { logInput: newLines.join("\n") }
            })

            // 에러 패턴 감지 시 자동 분석 트리거
            const lowerLine = line.toLowerCase()
            const isErrorLine =
              lowerLine.includes("error") ||
              lowerLine.includes("fatal") ||
              lowerLine.includes("exception") ||
              lowerLine.includes("fail") ||
              lowerLine.includes("critical")

            const isHealthyLine =
              lowerLine.includes("status: ok") ||
              lowerLine.includes("heartbeat") ||
              lowerLine.includes("recovered") ||
              lowerLine.includes("normal")

            const currentState = isErrorLine ? "error" : isHealthyLine ? "healthy" : null
            const prevState = get().lastObservedState

            // 상태가 변했을 때 (예: healthy -> error 또는 error -> healthy) 자동 분석 실행
            if (currentState && currentState !== prevState && !get().isAnalyzing) {
              console.log(`State changed: ${prevState} -> ${currentState}. Triggering analysis...`)
              set({ lastObservedState: currentState })
              
              // 약간의 로그가 더 쌓이길 기다렸다가(500ms) 분석 시작
              setTimeout(() => {
                if (!get().isAnalyzing) void get().analyzeStream()
              }, 500)
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        set({ error: `Log watch error: ${err instanceof Error ? err.message : String(err)}` })
      }
    } finally {
      set({ isWatchingLogs: false })
    }
  },

  stopWatchingLogs: () => {
    const abort = (window as any)._logWatchAbort
    if (abort) {
      abort.abort()
      ;(window as any)._logWatchAbort = null
    }
    set({ isWatchingLogs: false })
  },

  reset: () => set({ ...initialState }),
}))
