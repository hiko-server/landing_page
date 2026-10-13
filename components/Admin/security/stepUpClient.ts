/**
 * Pure helpers for the admin's step-up flow (server: lib/adminAuth/stepUp.ts).
 * A dangerous action answers 403 { code: 'STEP_UP_REQUIRED', methods,
 * recoveryRequired, windowMinutes } when the owner has not signed in or
 * verified on this browser recently; the UI asks, then retries once.
 */

export type StepUpChallenge = {
  methods: Array<'passkey' | 'password'>
  recoveryRequired: boolean
  windowMinutes: number
}

/** The step-up request in a 403 body, or null when the 403 is about something else. */
export function parseStepUpChallenge(status: number, body: unknown): StepUpChallenge | null {
  if (status !== 403 || !body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (b.code !== 'STEP_UP_REQUIRED') return null
  const methods = Array.isArray(b.methods)
    ? b.methods.filter((m): m is 'passkey' | 'password' => m === 'passkey' || m === 'password')
    : []
  return {
    methods: methods.length ? methods : ['password'],
    recoveryRequired: b.recoveryRequired === true,
    windowMinutes:
      typeof b.windowMinutes === 'number' && b.windowMinutes > 0 ? b.windowMinutes : 10,
  }
}

/** GET /api/admin/security/recent → whether to ask now, and how. */
export function parseRecentStatus(
  body: unknown
): { recent: boolean; challenge: StepUpChallenge } | null {
  if (
    !body ||
    typeof body !== 'object' ||
    typeof (body as { recent?: unknown }).recent !== 'boolean'
  )
    return null
  const challenge = parseStepUpChallenge(403, { ...(body as object), code: 'STEP_UP_REQUIRED' })
  return challenge ? { recent: (body as { recent: boolean }).recent, challenge } : null
}

/** What fetchWithStepUp returns when the owner closed the dialog before the request was sent. */
export function cancelledStepUpResponse(): Response {
  const res = new Response(JSON.stringify({ code: 'STEP_UP_REQUIRED', error: 'Cancelled.' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })
  return markStepUpCancelled(res)
}

const cancelled = new WeakSet<Response>()

/** Mark a response as "the owner closed the step-up dialog" (the caller then shows nothing). */
export function markStepUpCancelled(res: Response): Response {
  cancelled.add(res)
  return res
}

export function wasStepUpCancelled(res: Response): boolean {
  return cancelled.has(res)
}
