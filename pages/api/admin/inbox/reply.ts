import crypto from 'crypto'
import { withApi } from '../../../../lib/apiHandler'
import { isAdminRequest } from '../../../../lib/auth'
import { rateLimit } from '../../../../lib/rateLimit'
import { sendMail } from '../../../../lib/mailer'
import { addInboxReply, getInboxMessage, isInboxId } from '../../../../lib/inbox'
import { readReplyTemplates } from '../../../../lib/inboxTemplates'
import { REPLY_BODY_MAX, REPLY_SUBJECT_MAX, emailDomain, isPlainEmail, threadHeaders, type ReplyLang } from '../../../../lib/inboxReply'
import { checkReplyAlignment, mailIdentity } from '../../../../lib/mailIdentity'

/**
 * Reply to a contact message by e-mail, from the admin Inbox.
 *
 *   GET  /api/admin/inbox/reply → { smtp, from, fromSource, replyTo, ownerName, alignment, templates }
 *        what the composer shows: where the reply comes from and goes back to
 *        (lib/mailIdentity — From is the SMTP account's own address, Reply-To
 *        the owner's public one), a DMARC warning when the From domain would
 *        not pass, and the owner's saved templates.
 *   POST /api/admin/inbox/reply { id, subject, body, lang, copy }
 *        → 200 { ok, reply, message }   sent, remembered in the thread, message read + replied
 *        → 503 { code: 'SMTP_NOT_CONFIGURED' }  nothing sent (the composer explains the setup)
 *        → 502 { code: 'SEND_FAILED', error }   the SMTP server refused or timed out
 *        → 404 the message no longer exists
 *
 * Threading: the reply answers the notification e-mail of the message (its
 * stored Message-ID) or the previous reply, with References listing the
 * chain, so it threads in the visitor's and the owner's mail clients. `copy`
 * sends a blind copy to the owner's public address. 20 replies per 10 minutes.
 * The body is plain text; the visitor's address is the only recipient.
 */

const str = (v: unknown, max: number) => (typeof v === 'string' ? v : '').slice(0, max)

export default withApi('admin/inbox/reply', async (req, res, { log }) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    const identity = await mailIdentity()
    let alignment = null
    try {
      alignment = await checkReplyAlignment()
    } catch {
      alignment = null
    }
    return res.status(200).json({ ...identity, alignment, templates: readReplyTemplates() })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rl = rateLimit(req, 20, 10 * 60 * 1000)
  if (!rl.allowed) return res.status(429).json({ error: 'Too many replies in a short time — try again in a few minutes.' })

  const { id, subject, body, lang, copy } = (req.body || {}) as Record<string, unknown>
  if (!isInboxId(id)) return res.status(400).json({ error: 'Unknown message' })
  const cleanSubject = str(subject, REPLY_SUBJECT_MAX + 1).replace(/[\r\n]+/g, ' ').trim()
  const text = str(body, REPLY_BODY_MAX + 1).replace(/\r\n?/g, '\n')
  if (!cleanSubject) return res.status(400).json({ error: 'Add a subject.', field: 'subject' })
  if (cleanSubject.length > REPLY_SUBJECT_MAX) return res.status(400).json({ error: `The subject is longer than ${REPLY_SUBJECT_MAX} characters.`, field: 'subject' })
  if (!text.trim()) return res.status(400).json({ error: 'Write the reply first.', field: 'body' })
  if (text.length > REPLY_BODY_MAX) return res.status(400).json({ error: `The reply is longer than ${REPLY_BODY_MAX} characters.`, field: 'body' })
  const replyLang: ReplyLang = lang === 'zh' ? 'zh' : 'en'

  const message = getInboxMessage(id)
  if (!message) return res.status(404).json({ error: 'This message no longer exists.' })
  if (!isPlainEmail(message.email)) return res.status(400).json({ error: 'The message has no valid reply address.' })

  const identity = await mailIdentity()
  if (!identity.smtp || !identity.from) {
    return res.status(503).json({ code: 'SMTP_NOT_CONFIGURED', error: 'E-mail sending is not configured on the server.' })
  }

  const displayName = (replyLang === 'zh' ? identity.ownerName.zh : identity.ownerName.en) || identity.ownerName.en
  const replyTo = identity.replyTo && identity.replyTo.toLowerCase() !== identity.from.toLowerCase() ? identity.replyTo : undefined
  const bcc = copy === true && identity.replyTo ? identity.replyTo : undefined
  const messageId = `<reply.${crypto.randomBytes(12).toString('hex')}@${emailDomain(identity.from) || 'localhost'}>`
  const thread = threadHeaders(message.mid, message.replies)

  let sentId: string | undefined
  try {
    const result = await sendMail({
      from: displayName ? { name: displayName, address: identity.from } : identity.from,
      to: message.email,
      subject: cleanSubject,
      text,
      ...(replyTo ? { replyTo } : {}),
      ...(bcc ? { bcc } : {}),
      messageId,
      ...thread,
    })
    if (!result.ok) {
      return res.status(503).json({ code: 'SMTP_NOT_CONFIGURED', error: 'E-mail sending is not configured on the server.' })
    }
    sentId = result.messageId || messageId
  } catch (err) {
    log.warn('inbox reply: send failed', { err })
    const reason = err instanceof Error ? err.message.replace(/\s+/g, ' ').slice(0, 200) : 'unknown error'
    return res.status(502).json({ code: 'SEND_FAILED', error: `The mail server did not accept the reply (${reason}).` })
  }

  const reply = { at: new Date().toISOString(), subject: cleanSubject, body: text, messageId: sentId, lang: replyLang, copied: !!bcc }
  try {
    addInboxReply(id, reply)
  } catch (err) {
    // Sent is sent: report it, and say the thread could not be updated.
    log.error('inbox reply: sent but not recorded', { err })
    return res.status(200).json({ ok: true, reply, message: getInboxMessage(id), recorded: false })
  }
  return res.status(200).json({ ok: true, reply, message: getInboxMessage(id), recorded: true })
})
