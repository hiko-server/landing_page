import type { NextApiRequest } from 'next'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { readAdmin } from '../../../../lib/admin'
import { readAdminContext, requestOrigin } from '../../../../lib/auth'
import { withApi } from '../../../../lib/apiHandler'
import { rateLimit } from '../../../../lib/rateLimit'
import {
  deletePasskey,
  getPasskey,
  passkeyCount,
  PasskeyError,
  registrationOptions,
  relyingPartyFor,
  renamePasskey,
  verifyRegistration,
} from '../../../../lib/adminAuth/passkeys'
import { requireRecentAuth } from '../../../../lib/adminAuth/stepUp'
import {
  generateRecoveryCodes,
  isPasskeyRequired,
  recordAuthEvent,
  recoveryStatus,
} from '../../../../lib/adminAuth/store'

/**
 * Passkey management (admin only; adding and removing need a recent
 * verification — lib/adminAuth/stepUp.ts):
 *
 *   POST   { action: 'options' }                  → { options }  registration challenge
 *   POST   { action: 'register', response, name? } → { passkey, recoveryCodes? }
 *          The first passkey also creates recovery codes when none exist;
 *          they are returned once and only their hashes are kept.
 *   PATCH  { id, name }                           → { passkey }  rename
 *   DELETE { id }                                 → { ok }
 *          The last passkey cannot be removed while "Require a passkey" is on.
 */
const MAX_RESPONSE_CHARS = 32_768

function registrationResponse(req: NextApiRequest): RegistrationResponseJSON | null {
  const r = (req.body as { response?: unknown } | null)?.response
  if (
    !r ||
    typeof r !== 'object' ||
    Array.isArray(r) ||
    JSON.stringify(r).length > MAX_RESPONSE_CHARS
  )
    return null
  const o = r as Record<string, unknown>
  return typeof o.id === 'string' &&
    o.type === 'public-key' &&
    o.response &&
    typeof o.response === 'object'
    ? (r as RegistrationResponseJSON)
    : null
}

const header = (req: NextApiRequest, name: string) => {
  const v = req.headers[name]
  return (Array.isArray(v) ? v[0] : v) || ''
}

export default withApi('admin/security/passkeys', async (req, res, apiCtx) => {
  if (!readAdminContext(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  const body = (req.body || {}) as { action?: unknown; id?: unknown; name?: unknown }

  if (req.method === 'POST') {
    const ctx = requireRecentAuth(req, res)
    if (!ctx) return
    if (!ctx.session) return res.status(409).json({ error: 'Reload the page and try again.' })
    const rp = relyingPartyFor(req)
    if (!rp)
      return res
        .status(400)
        .json({
          code: 'PASSKEY_UNAVAILABLE',
          error:
            'Passkeys need a host name — open the admin through the site’s address, not an IP address.',
        })
    const rl = rateLimit(req, 20, 10 * 60_000, 'admin:passkey-register')
    if (!rl.allowed)
      return res.status(429).json({ error: 'Too many attempts — try again shortly.' })

    if (body.action === 'options') {
      try {
        return res
          .status(200)
          .json({
            options: await registrationOptions(rp, ctx.session.id, readAdmin()?.email || 'admin'),
          })
      } catch (err) {
        if (err instanceof PasskeyError)
          return res.status(409).json({ code: err.code, error: err.message })
        throw err
      }
    }
    if (body.action === 'register') {
      const response = registrationResponse(req)
      if (!response) return res.status(400).json({ error: 'Missing or invalid passkey response' })
      try {
        const firstEver = passkeyCount() === 0
        const passkey = await verifyRegistration(rp, ctx.session.id, response, {
          name: body.name,
          userAgent: header(req, 'user-agent'),
        })
        recordAuthEvent({
          type: 'passkey-added',
          method: 'passkey',
          sessionId: ctx.session.id,
          detail: passkey.name,
          ...requestOrigin(req),
        })
        let recoveryCodes: string[] | undefined
        if (firstEver && recoveryStatus().remaining === 0) {
          recoveryCodes = generateRecoveryCodes()
          recordAuthEvent({
            type: 'recovery-codes-generated',
            sessionId: ctx.session.id,
            ...requestOrigin(req),
          })
        }
        return res.status(200).json({ passkey, ...(recoveryCodes ? { recoveryCodes } : {}) })
      } catch (err) {
        if (err instanceof PasskeyError)
          return res
            .status(err.code === 'DUPLICATE' ? 409 : 400)
            .json({ code: err.code, error: err.message })
        apiCtx.log.error('passkey registration failed unexpectedly', { err })
        return res.status(500).json({ error: 'The passkey could not be saved. Try again.' })
      }
    }
    return res
      .status(400)
      .json({ error: 'Send { action: "options" } or { action: "register", response }' })
  }

  if (req.method === 'PATCH') {
    if (typeof body.id !== 'string') return res.status(400).json({ error: 'Missing id' })
    const before = getPasskey(body.id)
    const passkey = renamePasskey(body.id, body.name)
    if (!passkey)
      return res
        .status(before ? 400 : 404)
        .json({ error: before ? 'Names are 1–60 characters.' : 'Not found' })
    recordAuthEvent({
      type: 'passkey-renamed',
      detail: `${before?.name} → ${passkey.name}`,
      ...requestOrigin(req),
    })
    return res.status(200).json({ passkey })
  }

  if (req.method === 'DELETE') {
    const ctx = requireRecentAuth(req, res)
    if (!ctx) return
    if (typeof body.id !== 'string') return res.status(400).json({ error: 'Missing id' })
    const target = getPasskey(body.id)
    if (!target) return res.status(404).json({ error: 'Not found' })
    if (isPasskeyRequired() && passkeyCount() <= 1) {
      return res
        .status(409)
        .json({
          code: 'LAST_PASSKEY',
          error:
            'This is your only passkey and “Require a passkey” is on. Add another passkey, or turn the requirement off first.',
        })
    }
    deletePasskey(target.id)
    recordAuthEvent({
      type: 'passkey-removed',
      sessionId: ctx.session?.id ?? null,
      detail: target.name,
      ...requestOrigin(req),
    })
    return res.status(200).json({ ok: true, id: target.id })
  }

  res.setHeader('Allow', 'POST, PATCH, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
})
