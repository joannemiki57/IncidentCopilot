// /api/logs/stream
//
// Proxies GET /api/logs/stream?path=... to FastAPI.
// Similar to /api/analyze/stream, but for raw log line tailing.

import { NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function backendUrl(): string {
  const env = process.env.INCIDENT_COPILOT_BACKEND_URL?.trim()
  return (env && env.length > 0 ? env : "http://localhost:8000").replace(/\/$/, "")
}

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const path = searchParams.get("path")

  if (!path) {
    return new Response(JSON.stringify({ error: "path is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const upstream = `${backendUrl()}/api/logs/stream?path=${encodeURIComponent(path)}`

  let upstreamResponse: Response
  try {
    upstreamResponse = await fetch(upstream, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "upstream fetch failed"
    const body = `event: error\ndata: ${JSON.stringify({
      message: `Cannot reach FastAPI at ${upstream}: ${message}`,
    })}\n\n`
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    })
  }

  if (!upstreamResponse.ok) {
    const fallbackBody = await upstreamResponse.text()
    return new Response(fallbackBody, {
      status: upstreamResponse.status,
      headers: { "Content-Type": "application/json" },
    })
  }

  return new Response(upstreamResponse.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  })
}
