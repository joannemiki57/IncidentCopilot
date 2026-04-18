import type {
  IncidentMetadata,
  TeamIncidentOutput,
  TriageResult,
} from "../types"

export function adaptTeamTriage(raw: TeamIncidentOutput): TriageResult {
  const tr = raw["Triage Results"] ?? {}

  const base: TriageResult = {
    service: (tr["Affected Service"] as string) ?? "Unknown Service",
    severity: extractSeverityCode(tr["Severity Level"] as string | undefined),
    severityLabel: extractSeverityLabel(
      tr["Severity Level"] as string | undefined
    ),
    userImpact: (tr["User Impact"] as string) ?? "No Impact",
    impactDetail: (tr["Impact Details"] as string) ?? "",
    errorCategory:
      (tr["Error Category"] as string) ??
      (tr["Primary Category"] as string) ??
      "Unknown_Error",
    confidence: (tr["Confidence Score"] as number) ?? 0.5,
  }

  // === 기능 1 확장 추출 ===
  const compoundScenario = tr["Compound Scenario"]
  if (typeof compoundScenario === "string" && compoundScenario.length > 0) {
    base.compoundScenario = compoundScenario
  }

  const persistence = extractPersistence(tr.Persistence)
  if (persistence) {
    base.persistence = persistence
  }

  return base
}

export function adaptTeamMetadata(raw: TeamIncidentOutput): IncidentMetadata {
  // 팀 원본에서 "Extracted Metadata" 쪽이 우선, 없으면 "Context Metadata" 사용.
  // 두 블록 모두 같은 TeamMetadataBlock 모양이라 구조는 동일.
  const meta = raw["Extracted Metadata"] ?? raw["Context Metadata"] ?? {}
  const ids = meta["Identifiers"] ?? {}

  return {
    logTemplate: (meta["Log Template"] as string) ?? "",
    identifiers: {
      component: ids.component as string | undefined,
      ipAddresses: ids.ip_addresses as string[] | undefined,
      ports: ids.ports as string[] | undefined,
    },
    rawLogSample: (raw["Input Log"] as string) ?? "",
  }
}

function extractSeverityCode(
  label: string | undefined
): "P1" | "P2" | "P3" | "P4" {
  if (!label) return "P4"
  if (label.startsWith("P1")) return "P1"
  if (label.startsWith("P2")) return "P2"
  if (label.startsWith("P3")) return "P3"
  return "P4"
}

function extractSeverityLabel(raw: string | undefined): string {
  if (!raw) return "Low"
  const match = raw.match(/\((.*?)\)/)
  return match?.[1] ?? "Unknown"
}

// Persistence 블록은 팀원 포맷에서 누락 필드가 많으므로 전부 방어적으로 파싱.
function extractPersistence(
  raw: unknown
): TriageResult["persistence"] | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const p = raw as Record<string, unknown>

  const duration = typeof p.duration === "number" ? p.duration : undefined
  const count = typeof p.count === "number" ? p.count : undefined
  const state = normalizePersistenceState(p.state)

  // 3개 중 하나라도 유효한 값이 있어야 의미가 있다. 전부 없으면 undefined.
  if (duration === undefined && count === undefined && state === undefined) {
    return undefined
  }

  return {
    duration: duration ?? 0,
    count: count ?? 0,
    state: state ?? "Ongoing",
  }
}

function normalizePersistenceState(
  raw: unknown
): "Starting" | "Ongoing" | "Persistent" | "Transient" | undefined {
  if (raw === "Starting" || raw === "Ongoing") return raw
  if (raw === "Persistent" || raw === "Transient") return raw
  return undefined
}
