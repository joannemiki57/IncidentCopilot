// /api/analyze/stream
//
// Proxies the browser's fetch POST → FastAPI's /api/analyze/stream and pipes
// the Server-Sent Events stream through unchanged. Keeping this as a Next.js
// route (rather than hitting FastAPI directly from the browser) gives us:
//   - same-origin (no CORS plumbing for Claude / Vercel deploys)
//   - a single place to swap FastAPI for any other backend transport later
//   - the chance to graft request auth/rate-limit without touching the client
//
// The upstream URL is read from `INCIDENT_COPILOT_BACKEND_URL`. Default is
// http://localhost:8000 so `uvicorn server:app --port 8000` just works.
//
// Streaming detail: we deliberately bypass Next.js's response buffering by
// returning the upstream `ReadableStream<Uint8Array>` directly. Do NOT
// accumulate into a string and re-emit — that collapses SSE frames into a
// single final chunk and defeats the whole "real-time" point.

import { NextRequest } from "next/server"

// Streaming routes must run on the Node runtime (not edge) because some
// SSE keep-alive behavior differs on edge workers; Node is the safe default.
export const runtime = "nodejs"
// SSE is inherently dynamic — never let Next try to cache or prerender it.
export const dynamic = "force-dynamic"

function backendUrl(): string {
  const env = process.env.INCIDENT_COPILOT_BACKEND_URL?.trim()
  return (env && env.length > 0 ? env : "http://localhost:8000").replace(/\/$/, "")
}

export async function POST(req: NextRequest): Promise<Response> {
  // Read raw body once — we re-encode it to forward verbatim, including the
  // optional run_id and persona fields. If the client sent garbage, let
  // FastAPI reject it with the same 400 it would in standalone mode.
  const rawBody = await req.text()

  const upstream = `${backendUrl()}/api/analyze/stream`

  let upstreamResponse: Response
  try {
    upstreamResponse = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: rawBody,
      // Make sure fetch doesn't try to cache this or pre-buffer the body.
      cache: "no-store",
      // @ts-expect-error — `duplex: "half"` is required by Node 18+ fetch
      //                   when sending a body with a streaming response,
      //                   but the type hasn't landed in @types/node yet.
      duplex: "half",
    })
  } catch (err) {
    // Connection refused etc. — FastAPI not running. Return a clear error
    // frame shaped like an SSE event so the client store sees it as a
    // `error` event instead of a 502 and can surface a helpful message.
    const message =
      err instanceof Error ? err.message : "upstream fetch failed"
    const body =
      `event: error\ndata: ${JSON.stringify({
        stage: "upstream",
        message: `Cannot reach FastAPI at ${upstream}: ${message}`,
      })}\n\n`
    return new Response(body, {
      status: 200, // keep the event stream semantics
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    })
  }

  // Non-SSE responses (usually JSON error from FastAPI) are passed through
  // as-is so the client store can still parse 4xx / 5xx bodies.
  const upstreamContentType =
    upstreamResponse.headers.get("content-type") ?? ""
  if (!upstreamResponse.ok || !upstreamContentType.startsWith("text/event-stream")) {
    const fallbackBody = await upstreamResponse.text()
    return new Response(fallbackBody, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": upstreamContentType || "application/json",
        "Cache-Control": "no-store",
      },
    })
  }

  // Happy path — pipe the raw byte stream back to the browser untouched.
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
