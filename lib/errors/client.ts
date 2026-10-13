/**
 * Browser side of the first-party error monitor: turns an uncaught error, an
 * unhandled promise rejection or an error-boundary catch into one small JSON
 * beacon to POST /api/e (server: lib/errors/ingest.ts).
 *
 * Loaded on demand — lib/errors/capture.ts imports this module only when the
 * first error happens, so pages without errors never download it.
 *
 * What a report carries: the error kind and name, its message (≤ 500 chars),
 * its stack (≤ 4000 chars), the script it came from (without query), the page
 * path (location.pathname — never the query or hash), the build id and, for a
 * boundary, the boundary's name. No cookies, storage, identifiers or user
 * agent string (the server derives a browser family from the request).
 * Nothing is sent when the browser asks not to be tracked (Do Not Track /
 * Global Privacy Control), and at most MAX_PER_PAGE distinct reports leave
 * one page load.
 */

const ENDPOINT = '/api/e'
const MAX_PER_PAGE = 10
const RELEASE = process.env.NEXT_PUBLIC_BUILD_SHA || ''

type PrivacyNavigator = Navigator & { globalPrivacyControl?: boolean }

let sent = 0
const seen = new Set<string>()

export type ClientErrorKind = 'error' | 'unhandledrejection' | 'boundary'

type Report = {
  kind: ClientErrorKind
  error?: unknown
  message?: string
  filename?: string
  lineno?: number
  colno?: number
  boundary?: string
}

function allowed(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as PrivacyNavigator
  return !(nav.doNotTrack === '1' || nav.globalPrivacyControl === true)
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)
const noQuery = (s: string) => s.replace(/[?#].*$/, '')

/** A rejection reason that is not an Error (a string, an object): its text. */
function describeValue(v: unknown): string {
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return String(v)
  }
}

/** The payload for one report (exported for tests). */
export function buildPayload(r: Report, pathname: string): Record<string, unknown> | null {
  const err = r.error
  let name = ''
  let message = r.message || ''
  let stack = ''
  if (err instanceof Error) {
    name = err.name
    message = err.message || message
    stack = err.stack || ''
  } else if (err !== undefined && err !== null && !message) {
    message = describeValue(err)
  }
  if (!message && !stack) return null
  const payload: Record<string, unknown> = {
    k: r.kind,
    m: clip(String(message), 500),
    p: noQuery(pathname),
  }
  if (name) payload.n = clip(name, 64)
  if (stack) payload.s = clip(stack, 4000)
  if (r.filename) payload.f = clip(noQuery(r.filename), 500)
  if (r.lineno) payload.l = r.lineno
  if (r.colno) payload.c = r.colno
  if (RELEASE) payload.r = RELEASE
  if (r.boundary) payload.b = clip(r.boundary, 64)
  return payload
}

function send(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload)
  try {
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ENDPOINT, body)) return
  } catch {
    // Fall through to fetch.
  }
  fetch(ENDPOINT, {
    method: 'POST',
    body,
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
  }).catch(() => {
    // Reporting must never surface errors of its own.
  })
}

export function reportClientError(r: Report): void {
  if (sent >= MAX_PER_PAGE || !allowed()) return
  const payload = buildPayload(r, window.location.pathname)
  if (!payload) return
  const key = `${payload.k}|${payload.m}|${payload.f || ''}|${payload.l || ''}`
  if (seen.has(key)) return
  seen.add(key)
  sent++
  send(payload)
}

/** window 'error' / 'unhandledrejection' events (resource load failures are not errors of the page). */
export function handleErrorEvent(e: Event): void {
  if (e.type === 'unhandledrejection') {
    reportClientError({ kind: 'unhandledrejection', error: (e as PromiseRejectionEvent).reason })
    return
  }
  const ev = e as ErrorEvent
  if (!(ev instanceof ErrorEvent)) return
  reportClientError({
    kind: 'error',
    error: ev.error,
    message: ev.message,
    filename: ev.filename,
    lineno: ev.lineno,
    colno: ev.colno,
  })
}
