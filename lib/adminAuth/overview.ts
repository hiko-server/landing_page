import type { NextApiRequest } from 'next'
import type { AdminContext } from '../auth'
import { passkeyProvider } from './describe'
import { listPasskeys, relyingPartyFor, type StoredPasskey } from './passkeys'
import { listLiveSessions } from './sessions'
import { recentAuthWindowMs, stepUpMethods, type StepUpMethods } from './stepUp'
import {
  isPasskeyRequired,
  listAuthEvents,
  recoveryStatus,
  webauthnUserId,
  type AuthEvent,
  type AuthMethod,
  type RecoveryStatus,
} from './store'

/** Everything the admin Security page shows (GET /api/admin/security). */
export type SecurityOverview = {
  rp: { id: string | null; available: boolean }
  /** The WebAuthn user handle (base64url) — the page passes it to the browser's passkey signals. */
  userId: string | null
  passkeys: Array<StoredPasskey & { provider: string | null }>
  recovery: RecoveryStatus
  policy: { passkeyRequired: boolean }
  sessions: Array<{
    id: string
    current: boolean
    createdAt: number
    lastSeenAt: number
    expiresAt: number
    method: AuthMethod
    device: string | null
    ipPrefix: string | null
    country: string | null
  }>
  current: { sessionId: string | null; verifiedAt: number | null; recentUntil: number | null }
  events: AuthEvent[]
  stepUp: StepUpMethods & { windowMinutes: number }
}

export function securityOverview(
  req: NextApiRequest,
  ctx: AdminContext,
  now = Date.now()
): SecurityOverview {
  const rp = relyingPartyFor(req)
  const currentId = ctx.session?.id ?? null
  const verifiedAt = ctx.session?.verifiedAt ?? null
  const passkeys = listPasskeys()
  const windowMs = recentAuthWindowMs()
  return {
    rp: { id: rp?.rpID ?? null, available: !!rp },
    userId: passkeys.length ? Buffer.from(webauthnUserId()).toString('base64url') : null,
    passkeys: passkeys.map((p) => ({ ...p, provider: passkeyProvider(p.aaguid) })),
    recovery: recoveryStatus(),
    policy: { passkeyRequired: isPasskeyRequired() },
    sessions: listLiveSessions(now).map((s) => ({
      id: s.id,
      current: s.id === currentId,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      expiresAt: s.expiresAt,
      method: s.method,
      device: s.device,
      ipPrefix: s.ipPrefix,
      country: s.country,
    })),
    current: {
      sessionId: currentId,
      verifiedAt,
      recentUntil:
        verifiedAt !== null && now - verifiedAt <= windowMs ? verifiedAt + windowMs : null,
    },
    events: listAuthEvents(40),
    stepUp: { ...stepUpMethods(), windowMinutes: windowMs / 60_000 },
  }
}
