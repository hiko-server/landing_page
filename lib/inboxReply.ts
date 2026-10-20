/**
 * Replying to a contact message from the admin Inbox — the pure parts,
 * shared by the composer (browser) and POST /api/admin/inbox/reply (server);
 * unit-tested.
 *
 *   - the reply language follows the message (Chinese text → 中文 template);
 *   - templates: the owner's own (Inbox → Reply → "Save as my template"), or
 *     the built-in skeleton: a greeting, room for the answer and a sign-off
 *     with the owner's public name — nothing else is written for them;
 *   - {name} {firstName} {subject} {me} placeholders;
 *   - the original is quoted below the reply ("On …, Jane <…> wrote:");
 *   - threading: the first reply answers the notification e-mail the owner
 *     received (the message's `mid`), later ones the previous reply, and
 *     References carries the whole chain (RFC 5322 §3.6.4).
 */

export type ReplyLang = 'en' | 'zh'

export const REPLY_SUBJECT_MAX = 200
export const REPLY_BODY_MAX = 20_000

const CJK_RE = /[㐀-鿿豈-﫿]/g
const LETTER_RE = /[A-Za-z㐀-鿿豈-﫿]/g

/** 'zh' when at least a fifth of the letters are Chinese characters. */
export function detectReplyLang(text: string): ReplyLang {
  const letters = (text.match(LETTER_RE) || []).length
  if (!letters) return 'en'
  const cjk = (text.match(CJK_RE) || []).length
  return cjk / letters >= 0.2 ? 'zh' : 'en'
}

/** "Re: <subject>" (an existing Re: / 回复： prefix is kept, never doubled). */
export function replySubject(subject: string, lang: ReplyLang = 'en'): string {
  const s = String(subject || '').replace(/[\r\n]+/g, ' ').trim()
  if (/^(re|aw|回复|答复)\s*[:：]/i.test(s)) return s.slice(0, REPLY_SUBJECT_MAX)
  const base = s || (lang === 'zh' ? '您的来信' : 'your message')
  return `Re: ${base}`.slice(0, REPLY_SUBJECT_MAX)
}

/** The visitor's first name for a greeting: the first word of a Latin name, the whole of a Chinese one. */
export function firstNameOf(name: string): string {
  const n = String(name || '').trim()
  if (!n) return ''
  if (/^[㐀-鿿豈-﫿]+$/.test(n.replace(/\s+/g, ''))) return n.replace(/\s+/g, '')
  return n.split(/\s+/)[0]
}

/** The built-in skeletons: greeting, space for the answer, sign-off. */
export const BUILTIN_TEMPLATES: Record<ReplyLang, string> = {
  en: 'Hi {firstName},\n\n\n\nBest regards,\n{me}',
  zh: '{name}，您好：\n\n\n\n祝好\n{me}',
}

export type TemplateVars = { name: string; subject: string; me: string }

/** Fill {name} {firstName} {subject} {me}; unknown braces stay as typed. */
export function fillTemplate(template: string, vars: TemplateVars): string {
  const map: Record<string, string> = {
    name: vars.name.trim(),
    firstName: firstNameOf(vars.name),
    subject: vars.subject.trim(),
    me: vars.me.trim(),
  }
  return template.replace(/\{(name|firstName|subject|me)\}/g, (_, k: string) => map[k] ?? '')
}

function stamp(iso: string, lang: ReplyLang, timeZone?: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  if (lang === 'zh') {
    const parts = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).formatToParts(d)
    const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
    return `${get('year')}年${get('month')}月${get('day')}日 ${get('hour')}:${get('minute')}`
  }
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(d)
}

/** The original message, quoted under an attribution line in the reply's language. */
export function quoteOriginal(m: { name: string; email: string; at: string; message: string }, lang: ReplyLang, timeZone?: string): string {
  const who = m.name ? `${m.name} <${m.email}>` : `<${m.email}>`
  const head = lang === 'zh' ? `${stamp(m.at, lang, timeZone)}，${who} 写道：` : `On ${stamp(m.at, lang, timeZone)}, ${who} wrote:`
  const body = String(m.message || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => (l ? `> ${l}` : '>'))
    .join('\n')
  return `${head}\n${body}`
}

/** Full composer text: the filled template, then the quoted original. */
export function draftReply(
  m: { name: string; email: string; at: string; message: string; subject: string },
  opts: { lang: ReplyLang; template?: string; me: string; timeZone?: string },
): string {
  const template = opts.template && opts.template.trim() ? opts.template : BUILTIN_TEMPLATES[opts.lang]
  const filled = fillTemplate(template, { name: m.name || '', subject: m.subject || '', me: opts.me || '' })
  return `${filled.replace(/\s+$/, '')}\n\n${quoteOriginal(m, opts.lang, opts.timeZone)}\n`
}

/** Index in the template text where the caret should land: the first blank line after the greeting. */
export function caretAfterGreeting(text: string): number {
  const i = text.indexOf('\n\n')
  return i === -1 ? text.length : i + 2
}

/**
 * In-Reply-To / References of the next reply: it answers the newest earlier
 * reply (else the notification e-mail), and References lists the chain,
 * oldest first, without duplicates (capped at 20 ids).
 */
export function threadHeaders(mid: string | null | undefined, previous: ReadonlyArray<{ messageId: string | null }>): { inReplyTo?: string; references?: string[] } {
  const chain = [mid, ...previous.map((r) => r.messageId)].filter((v): v is string => typeof v === 'string' && !!v)
  const unique = Array.from(new Set(chain)).slice(-20)
  if (!unique.length) return {}
  return { inReplyTo: unique[unique.length - 1], references: unique }
}

/** A plausible single e-mail address (no display name, no spaces). */
export function isPlainEmail(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]+$/.test(v)
}

/** Domain part of an address, lowercased ('' when it is not one). */
export function emailDomain(address: string | null | undefined): string {
  const m = /@([^@\s>]+)>?$/.exec(String(address || '').trim())
  return m ? m[1].toLowerCase() : ''
}
