import crypto from 'crypto'
import type { NextApiRequest } from 'next'
import { normalizeIp } from './security/ip'

/**
 * Background jobs the server runs on itself through its own HTTP API
 * (POST /api/internal/<job>), for work that needs modules the
 * instrumentation bundle (which owns the timers) must not import — e.g. the
 * restore drill's article render check needs the MDX renderer.
 *
 * Authorisation: a random 32-byte token created once per process and kept
 * only in memory (globalThis, shared by Next's webpack runtimes), sent in
 * `x-internal-job-token` and compared in constant time; the request must also
 * come from the loopback interface. Nothing outside the process can learn
 * the token.
 */

export const INTERNAL_TOKEN_HEADER = 'x-internal-job-token'
const JOB_TIMEOUT_MS = 15 * 60_000

type JobGlobal = typeof globalThis & { __internalJobToken?: string }

export class InternalJobBusyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InternalJobBusyError'
  }
}

/** This process's job token (created on first use). */
export function internalJobToken(): string {
  const g = globalThis as JobGlobal
  if (!g.__internalJobToken) g.__internalJobToken = crypto.randomBytes(32).toString('hex')
  return g.__internalJobToken
}

const LOOPBACK = new Set(['127.0.0.1', '::1'])

/** May this request run an internal job? (Loopback peer + the process token.) */
export function isInternalJobRequest(req: Pick<NextApiRequest, 'headers' | 'socket'>): boolean {
  const peer = normalizeIp(String(req.socket?.remoteAddress || ''))
  if (!peer || !LOOPBACK.has(peer)) return false
  const given = req.headers[INTERNAL_TOKEN_HEADER]
  const expected = (globalThis as JobGlobal).__internalJobToken
  if (typeof given !== 'string' || !expected || given.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

/** POST /api/internal/<job> on this server and return its JSON. */
export async function triggerInternalJob(job: string): Promise<unknown> {
  if (!/^[a-z][a-z-]{0,40}$/.test(job)) throw new Error(`invalid job name: ${job}`)
  const port = Number(process.env.PORT) || 3000
  const res = await fetch(`http://127.0.0.1:${port}/api/internal/${job}`, {
    method: 'POST',
    headers: { [INTERNAL_TOKEN_HEADER]: internalJobToken(), 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(JOB_TIMEOUT_MS),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (res.status === 409) throw new InternalJobBusyError(body.error || 'busy')
  if (!res.ok) throw new Error(`internal job ${job} answered HTTP ${res.status}${body.error ? `: ${body.error}` : ''}`)
  return body
}
