import type { NextApiRequest } from 'next'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { getPublicHost, hostnameOf, isLocalHostname } from '../env'
import { getAuthDb } from './db'
import { cleanPasskeyName, suggestPasskeyName } from './describe'
import { webauthnUserId } from './store'

/**
 * Passkeys (WebAuthn) for the admin, on @simplewebauthn/server.
 *
 * Relying party: the public host (SITE_URL / NEXT_PUBLIC_SITE_HOST) with the
 * expected origin https://<host>; a request addressed to `localhost` (local
 * development and the end-to-end suite) uses `localhost` and its own origin.
 * An IP-literal host has no RP ID — WebAuthn does not allow one — so passkeys
 * are unavailable there. A passkey is bound to the RP ID it was created
 * for, so one made on localhost can never sign in to the public site.
 *
 * Ceremonies:
 *   - every challenge is random (32 bytes), stored in auth.db for 5 minutes
 *     and consumed (deleted) by the first verification that presents it,
 *     whatever the outcome — single use; registration and step-up
 *     challenges are bound to the session that asked for them;
 *   - user verification (biometrics / PIN) is required;
 *   - registration asks for a discoverable credential (passkey) without
 *     attestation, excluding the authenticators already registered;
 *   - sign-in offers no allow-list (the browser lists the site's passkeys,
 *     including through autofill); step-up lists the registered ones;
 *   - the signature counter is checked and stored (a cloned authenticator
 *     reporting an old counter is refused).
 */

export const CHALLENGE_TTL_MS = 5 * 60_000
const MAX_OUTSTANDING_CHALLENGES = 500
const CEREMONY_TIMEOUT_MS = 120_000

export type ChallengePurpose = 'register' | 'login' | 'step-up'

export type RelyingParty = { rpID: string; rpName: string; origin: string }

export type PasskeyErrorCode = 'NO_RP' | 'CHALLENGE' | 'UNKNOWN_CREDENTIAL' | 'VERIFICATION' | 'DUPLICATE' | 'LIMIT'

export class PasskeyError extends Error {
  readonly code: PasskeyErrorCode
  constructor(message: string, code: PasskeyErrorCode) {
    super(message)
    this.name = 'PasskeyError'
    this.code = code
  }
}

const header = (req: Pick<NextApiRequest, 'headers'>, name: string): string => {
  const v = req.headers[name]
  return (Array.isArray(v) ? v[0] : v) || ''
}

const IP_LITERAL = /^(\d{1,3}(\.\d{1,3}){3}|\[?[0-9a-f:]+\]?)$/i

/**
 * The relying party for this request, or null when passkeys cannot work on
 * the host the browser is using (an IP address, or a malformed Host).
 */
export function relyingPartyFor(req: Pick<NextApiRequest, 'headers'>): RelyingParty | null {
  const hostHeader = header(req, 'host').trim().toLowerCase()
  const requestHost = hostnameOf(hostHeader)
  if (!requestHost) return null
  if (requestHost === 'localhost' || requestHost.endsWith('.localhost')) {
    if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(hostHeader)) return null
    const proto = (header(req, 'x-forwarded-proto').split(',')[0] || '').trim() === 'https' ? 'https' : 'http'
    return { rpID: requestHost, rpName: requestHost, origin: `${proto}://${hostHeader}` }
  }
  if (IP_LITERAL.test(requestHost) || isLocalHostname(requestHost)) return null
  const publicHost = getPublicHost()
  if (publicHost) return { rpID: publicHost, rpName: publicHost, origin: `https://${publicHost}` }
  // A self-hosted install without SITE_URL: trust the Host only when it is a plain host name.
  if (!/^[a-z0-9.-]+$/.test(requestHost)) return null
  return { rpID: requestHost, rpName: requestHost, origin: `https://${requestHost}` }
}

// ── Challenges ────────────────────────────────────────────────────────────

function storeChallenge(challenge: string, purpose: ChallengePurpose, sessionId: string | null, now: number) {
  const db = getAuthDb()
  db.prepare('DELETE FROM webauthn_challenges WHERE expires_at <= ?').run(now)
  const n = (db.prepare('SELECT count(*) AS n FROM webauthn_challenges').get() as { n: number }).n
  if (n >= MAX_OUTSTANDING_CHALLENGES) {
    db.prepare(
      `DELETE FROM webauthn_challenges WHERE challenge IN (SELECT challenge FROM webauthn_challenges ORDER BY expires_at ASC LIMIT ?)`,
    ).run(n - MAX_OUTSTANDING_CHALLENGES + 1)
  }
  db.prepare('INSERT INTO webauthn_challenges (challenge, purpose, session_id, expires_at) VALUES (?, ?, ?, ?)').run(
    challenge,
    purpose,
    sessionId,
    now + CHALLENGE_TTL_MS,
  )
}

/** The challenge a response signed (from its clientDataJSON), or null. */
export function challengeOf(response: { response?: { clientDataJSON?: unknown } } | null | undefined): string | null {
  const raw = response?.response?.clientDataJSON
  if (typeof raw !== 'string' || raw.length > 4096) return null
  try {
    const data = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { challenge?: unknown }
    return typeof data.challenge === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(data.challenge) ? data.challenge : null
  } catch {
    return null
  }
}

/** Delete-and-return: the challenge is gone after this, whether verification then succeeds or not. */
function consumeChallenge(challenge: string | null, purpose: ChallengePurpose, sessionId: string | null, now: number): string {
  if (!challenge) throw new PasskeyError('The passkey response carries no challenge.', 'CHALLENGE')
  const row = getAuthDb()
    .prepare(
      `DELETE FROM webauthn_challenges WHERE challenge = ? AND purpose = ? AND session_id IS ? AND expires_at > ? RETURNING challenge`,
    )
    .get(challenge, purpose, sessionId, now) as { challenge: string } | undefined
  if (!row) throw new PasskeyError('This passkey request expired or was already used. Try again.', 'CHALLENGE')
  return row.challenge
}

// ── Credentials ───────────────────────────────────────────────────────────

export type StoredPasskey = {
  id: string
  name: string
  createdAt: number
  lastUsedAt: number | null
  deviceType: string
  backedUp: boolean
  transports: string[]
  aaguid: string | null
}

type CredRow = {
  id: string
  public_key: Buffer
  counter: number
  transports: string
  device_type: string
  backed_up: number
  aaguid: string | null
  name: string
  created_at: number
  last_used_at: number | null
}

const TRANSPORTS = new Set(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'])

function parseTransports(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && TRANSPORTS.has(t)) : []
  } catch {
    return []
  }
}

function toPasskey(r: CredRow): StoredPasskey {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    deviceType: r.device_type,
    backedUp: r.backed_up === 1,
    transports: parseTransports(r.transports),
    aaguid: r.aaguid,
  }
}

export const MAX_PASSKEYS = 20

export function listPasskeys(): StoredPasskey[] {
  return (getAuthDb().prepare('SELECT * FROM webauthn_credentials ORDER BY created_at ASC').all() as CredRow[]).map(toPasskey)
}

export function passkeyCount(): number {
  return (getAuthDb().prepare('SELECT count(*) AS n FROM webauthn_credentials').get() as { n: number }).n
}

const CRED_ID_RE = /^[A-Za-z0-9_-]{16,1366}$/

export function renamePasskey(id: string, name: unknown): StoredPasskey | null {
  const clean = cleanPasskeyName(name)
  if (!clean || !CRED_ID_RE.test(id)) return null
  const db = getAuthDb()
  if (db.prepare('UPDATE webauthn_credentials SET name = ? WHERE id = ?').run(clean, id).changes !== 1) return null
  return toPasskey(db.prepare('SELECT * FROM webauthn_credentials WHERE id = ?').get(id) as CredRow)
}

export function deletePasskey(id: string): boolean {
  if (!CRED_ID_RE.test(id)) return false
  return getAuthDb().prepare('DELETE FROM webauthn_credentials WHERE id = ?').run(id).changes === 1
}

export function getPasskey(id: string): StoredPasskey | null {
  if (!CRED_ID_RE.test(id)) return null
  const row = getAuthDb().prepare('SELECT * FROM webauthn_credentials WHERE id = ?').get(id) as CredRow | undefined
  return row ? toPasskey(row) : null
}

// ── Registration ──────────────────────────────────────────────────────────

export async function registrationOptions(
  rp: RelyingParty,
  sessionId: string,
  userName: string,
  now = Date.now(),
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = listPasskeys()
  if (existing.length >= MAX_PASSKEYS) throw new PasskeyError(`At most ${MAX_PASSKEYS} passkeys can be registered.`, 'LIMIT')
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: userName || 'admin',
    userDisplayName: `Admin · ${rp.rpName}`,
    userID: webauthnUserId() as Parameters<typeof generateRegistrationOptions>[0]['userID'],
    timeout: CEREMONY_TIMEOUT_MS,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  })
  storeChallenge(options.challenge, 'register', sessionId, now)
  return options
}

export async function verifyRegistration(
  rp: RelyingParty,
  sessionId: string,
  response: RegistrationResponseJSON,
  opts: { name?: unknown; userAgent?: string | null },
  now = Date.now(),
): Promise<StoredPasskey> {
  const challenge = consumeChallenge(challengeOf(response), 'register', sessionId, now)
  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    })
  } catch (err) {
    throw new PasskeyError(`The passkey could not be verified: ${err instanceof Error ? err.message : String(err)}`, 'VERIFICATION')
  }
  if (!verification.verified) throw new PasskeyError('The passkey could not be verified.', 'VERIFICATION')
  const info = verification.registrationInfo
  const db = getAuthDb()
  if (db.prepare('SELECT 1 FROM webauthn_credentials WHERE id = ?').get(info.credential.id)) {
    throw new PasskeyError('This passkey is already registered.', 'DUPLICATE')
  }
  const name = cleanPasskeyName(opts.name) || suggestPasskeyName(info.aaguid, opts.userAgent)
  db.prepare(
    `INSERT INTO webauthn_credentials (id, public_key, counter, transports, device_type, backed_up, aaguid, name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    info.credential.id,
    Buffer.from(info.credential.publicKey),
    info.credential.counter,
    JSON.stringify((info.credential.transports || []).filter((t) => TRANSPORTS.has(t))),
    info.credentialDeviceType,
    info.credentialBackedUp ? 1 : 0,
    info.aaguid && info.aaguid !== '00000000-0000-0000-0000-000000000000' ? info.aaguid : null,
    name,
    now,
  )
  return getPasskey(info.credential.id) as StoredPasskey
}

// ── Authentication (sign-in and step-up) ─────────────────────────────────

export async function authenticationOptions(
  rp: RelyingParty,
  purpose: 'login' | 'step-up',
  sessionId: string | null,
  now = Date.now(),
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    timeout: CEREMONY_TIMEOUT_MS,
    userVerification: 'required',
    allowCredentials: purpose === 'step-up' ? listPasskeys().map((c) => ({ id: c.id, transports: c.transports })) : [],
  })
  storeChallenge(options.challenge, purpose, purpose === 'step-up' ? sessionId : null, now)
  return options
}

export async function verifyAuthentication(
  rp: RelyingParty,
  purpose: 'login' | 'step-up',
  sessionId: string | null,
  response: AuthenticationResponseJSON,
  now = Date.now(),
): Promise<StoredPasskey> {
  const challenge = consumeChallenge(challengeOf(response), purpose, purpose === 'step-up' ? sessionId : null, now)
  const id = typeof response?.id === 'string' ? response.id : ''
  const db = getAuthDb()
  const row = CRED_ID_RE.test(id) ? (db.prepare('SELECT * FROM webauthn_credentials WHERE id = ?').get(id) as CredRow | undefined) : undefined
  if (!row) throw new PasskeyError('This passkey is not registered for this site.', 'UNKNOWN_CREDENTIAL')
  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      credential: {
        id: row.id,
        publicKey: new Uint8Array(row.public_key) as Parameters<typeof verifyAuthenticationResponse>[0]['credential']['publicKey'],
        counter: row.counter,
        transports: parseTransports(row.transports) as Parameters<typeof verifyAuthenticationResponse>[0]['credential']['transports'],
      },
    })
  } catch (err) {
    throw new PasskeyError(`The passkey could not be verified: ${err instanceof Error ? err.message : String(err)}`, 'VERIFICATION')
  }
  if (!verification.verified) throw new PasskeyError('The passkey could not be verified.', 'VERIFICATION')
  const info = verification.authenticationInfo
  db.prepare('UPDATE webauthn_credentials SET counter = ?, backed_up = ?, last_used_at = ? WHERE id = ?').run(
    info.newCounter,
    info.credentialBackedUp ? 1 : 0,
    now,
    row.id,
  )
  return getPasskey(row.id) as StoredPasskey
}
