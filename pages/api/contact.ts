import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { rateLimit } from '../../lib/rateLimit'
import { messageIdHost, sendMail } from '../../lib/mailer'
import { getJwtSecret } from '../../lib/env'
import { inboxCapacity, storeInboxMessage } from '../../lib/inbox'
import { sharedReplayGuard } from '../../lib/security/replayGuard'
import { verifyChallenge } from '../../lib/security/contactChallenge'
import { withApi } from '../../lib/apiHandler'
import { inquiryRows, normalizeInquiry } from '../../lib/inquiry'

/**
 * Contact endpoint.
 *
 * Human check (no external service, no env):
 *   1. Signed nonce from /api/contact/nonce (JWT, 30-min TTL, audience
 *      `contact-form`) → proves the form was loaded; its issued-at enforces
 *      ≥ 2 s between loading and sending. Single use: once a message has
 *      been accepted, the same nonce is refused.
 *   2. Sum ("What is 3 + 5?") — issued with the nonce and verified here
 *      against an HMAC in the token; a wrong answer burns the nonce, so each
 *      challenge allows one attempt. (Deters form-spamming scripts; it is not
 *      a defence against a bot that renders the page.)
 *   3. Honeypot field `hp` (hidden from humans, bots auto-fill) → silently
 *      answered 200 so the bot thinks it worked.
 *
 * Abuse limits: 5 submissions / 10 min per client, plus the inbox's
 * site-wide caps (lib/inbox.ts: messages stored per day, total size). Past a
 * cap a message is still emailed when SMTP works; only when it can be
 * neither emailed nor stored does the visitor get a 503 — never a fake
 * success.
 *
 * Structured inquiry (optional, lib/inquiry.ts): `reason`, `intent`
 * (role / freelance / collab / other), `company`, `roleUrl`, `timeline`.
 * Each is capped; fields the intent does not ask for are dropped; the link
 * must be a plain https URL (400 otherwise) and is never fetched. They are
 * stored as the Inbox message's `meta` and listed at the top of the e-mail.
 */

const nonces = () => sharedReplayGuard('contact-nonce')
/** Replay key: the nonce's unique id (older nonces without one: the token itself). */
const nonceKey = (token: string, jti: unknown) =>
  typeof jti === 'string' && jti ? `jti:${jti}` : `tok:${crypto.createHash('sha256').update(token).digest('hex')}`

const UNAVAILABLE = 'Message could not be delivered right now — please email directly.'
const BUSY =
  'The inbox is taking a short break after an unusual number of messages. Please try again later, or email directly.'

export default withApi('contact', async (req, res, { log }) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rl = rateLimit(req, 5, 10 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests, try later' })

  const { name, email, subject, message, nonce, mathAnswer, hp, reason, intent, company, roleUrl, timeline } = req.body || {}

  // 1. Honeypot (silent accept — pretend it worked so bot doesn't retry)
  if (typeof hp === 'string' && hp.trim().length > 0) {
    return res.status(200).json({ ok: true })
  }

  // 2. Required fields
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // 3. Nonce
  if (!nonce || typeof nonce !== 'string') {
    return res.status(400).json({ error: 'Missing verification token' })
  }
  let nonceExpiresAt: number
  let nonceId: unknown
  let answerHash: unknown
  try {
    const decoded = jwt.verify(nonce, getJwtSecret(), { algorithms: ['HS256'], audience: 'contact-form' }) as {
      iat?: number
      exp?: number
      jti?: unknown
      ah?: unknown
      t?: string
    }
    if (decoded.t !== 'contact-nonce') {
      return res.status(400).json({ error: 'Invalid verification token' })
    }
    const issuedAt = (decoded.iat || 0) * 1000
    const elapsed = Date.now() - issuedAt
    if (elapsed < 2_000) {
      return res.status(400).json({ error: 'Please slow down a moment.' })
    }
    nonceExpiresAt = (decoded.exp || 0) * 1000
    nonceId = decoded.jti
    answerHash = decoded.ah
  } catch {
    return res.status(400).json({ error: 'Verification token expired — refresh the form.' })
  }

  // 4. Sum. Nonces minted before the server-side check existed carry no
  // answer hash; for those (≤ 30 min after a deploy) presence is enough.
  if (!mathAnswer && mathAnswer !== 0) {
    return res.status(400).json({ error: 'Please complete the human check.' })
  }
  if (answerHash !== undefined && !verifyChallenge(getJwtSecret(), nonceId, mathAnswer, answerHash)) {
    // One attempt per challenge: burn the nonce so the 17 possible sums
    // can't be tried against it. The form fetches a fresh one.
    nonces().claim(nonceKey(nonce, nonceId), nonceExpiresAt)
    return res
      .status(400)
      .json({ error: 'That answer to the human check isn’t right — here is a new one.', code: 'BAD_CHALLENGE' })
  }

  // 5. Sanitize: strip CR/LF (mail-header injection) + cap lengths.
  const clean = (v: unknown, max: number) =>
    String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, max).trim()
  const safeName = clean(name, 200)
  const safeEmail = clean(email, 254)
  const safeSubject = clean(subject, 200)
  const safeMessage = String(message ?? '').slice(0, 10_000)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' })
  }
  // Checked before the nonce is claimed, so the visitor can fix the link and resend.
  const inquiry = normalizeInquiry({ reason, intent, company, roleUrl, timeline })
  if (!inquiry.ok) return res.status(400).json({ error: inquiry.error, field: inquiry.field })
  const meta = inquiry.meta
  const details = inquiryRows(meta).map((r) => `${r.label}: ${r.value}`)

  // 6. One message per nonce. Claimed now, released below if nothing was accepted.
  const key = nonceKey(nonce, nonceId)
  if (!nonces().claim(key, nonceExpiresAt)) {
    return res.status(400).json({ error: 'Verification token expired — refresh the form.' })
  }

  const to = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL
  const capacity = inboxCapacity()
  const refuse = (retryAfterMs: number | null, error: string) => {
    nonces().release(key)
    if (retryAfterMs) res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))))
    return res.status(503).json({ error })
  }
  // Inbox paused and no recipient to email: nothing could accept the message.
  if (!capacity.ok && !to) return refuse(capacity.retryAfterMs, BUSY)

  // 7. Deliver — and NEVER drop the message silently. The message is
  // emailed when a recipient and SMTP are configured, and kept in the admin
  // Inbox (data/contact-inbox.jsonl, bind-mounted) unless a site-wide cap
  // is reached; the owner can read and answer it from
  // /admin/dashboard?tab=inbox even without SMTP.
  let delivered = false
  // The notification's Message-ID, stored with the message: a reply sent
  // later from the admin Inbox references it, so the owner's mail client
  // threads the notification and the reply.
  const mid = `<contact.${crypto.randomBytes(12).toString('hex')}@${messageIdHost()}>`
  if (to) {
    try {
      const result = await sendMail({
        to,
        subject: `[Contact] ${safeSubject}`,
        text: `From: ${safeName} <${safeEmail}>\n${details.length ? `${details.join('\n')}\n` : ''}\n${safeMessage}`,
        // Hitting "Reply" answers the visitor directly.
        replyTo: safeEmail,
        messageId: mid,
      })
      delivered = !!result?.ok
    } catch (err) {
      log.error('contact: sendMail threw', { err })
    }
  }

  let persisted = false
  let paused: { retryAfterMs: number | null } | null = null
  try {
    const stored = storeInboxMessage({
      name: safeName,
      email: safeEmail,
      subject: safeSubject,
      message: safeMessage,
      delivered,
      meta,
      // Only a notification that was sent can be threaded with.
      ...(delivered ? { mid } : {}),
    })
    if (stored.stored) {
      persisted = true
      if (!delivered) log.warn('contact: mail not delivered, message kept in the admin Inbox')
    } else {
      paused = { retryAfterMs: stored.retryAfterMs }
    }
  } catch (err) {
    log.error('contact: failed to store the message in the inbox', { err })
  }

  // Only claim success when the message actually exists somewhere.
  if (!delivered && !persisted) {
    return paused ? refuse(paused.retryAfterMs, BUSY) : refuse(null, UNAVAILABLE)
  }

  return res.status(200).json({ ok: true })
})
