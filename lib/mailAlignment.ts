import { Resolver } from 'node:dns'
import { emailDomain, isPlainEmail } from './inboxReply'

/**
 * Which address mail is sent From, and whether recipients will accept it
 * (SERVER-ONLY; no content-store imports, so instrumentation can load it).
 *
 *   Inbox replies    REPLY_FROM_EMAIL, else SMTP_USER when it is an address,
 *                    else FROM_EMAIL — the SMTP account's own address by
 *                    default, the one its provider signs (DKIM) and may send
 *                    for (SPF), so it passes the recipient's DMARC check
 *   Notifications    FROM_EMAIL, else SMTP_USER (contact messages, resets)
 *
 * checkFromAlignment() looks up the From domain's DMARC policy (TXT
 * _dmarc.<domain>, cached for an hour) and warns when the From domain is not
 * the SMTP account's own and the policy would reject or quarantine an
 * unaligned message — e.g. From …@lucian-dev.com (p=reject) through a Gmail
 * account.
 */

export type ReplyFromSource = 'REPLY_FROM_EMAIL' | 'SMTP_USER' | 'FROM_EMAIL' | null

const env = (name: string) => (process.env[name] || '').trim()

/** The From address and where it came from, per the rule above. */
export function replyFrom(): { from: string | null; source: ReplyFromSource } {
  const explicit = env('REPLY_FROM_EMAIL')
  if (isPlainEmail(explicit)) return { from: explicit, source: 'REPLY_FROM_EMAIL' }
  const user = env('SMTP_USER')
  if (isPlainEmail(user)) return { from: user, source: 'SMTP_USER' }
  const configured = env('FROM_EMAIL')
  const inBrackets = /<([^>]+)>/.exec(configured)?.[1] || configured
  if (isPlainEmail(inBrackets)) return { from: inBrackets, source: 'FROM_EMAIL' }
  return { from: null, source: null }
}

export function smtpConfigured(): boolean {
  return !!(env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS'))
}

// ── DMARC alignment ─────────────────────────────────────────────────────────

export type DmarcPolicy = 'reject' | 'quarantine' | 'none'

/** The `p=` of a DMARC TXT record (null when the text is not one). */
export function parseDmarcPolicy(txt: string): DmarcPolicy | null {
  if (!/^\s*v\s*=\s*DMARC1\b/i.test(txt)) return null
  const m = /(?:^|;)\s*p\s*=\s*(reject|quarantine|none)\s*(?:;|$)/i.exec(txt)
  return m ? (m[1].toLowerCase() as DmarcPolicy) : 'none'
}

/** Same organisational domain: equal, or one a subdomain of the other. */
export function sameOrgDomain(a: string, b: string): boolean {
  if (!a || !b) return false
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)
}

export type AlignmentVerdict = {
  status: 'aligned' | 'rejected' | 'check' | 'unknown'
  /** One sentence for the owner, or '' when there is nothing to say. */
  message: string
  policy: DmarcPolicy | null
}

/**
 * The verdict for sending From `from` through an SMTP account whose login is
 * `smtpUser` (pure; `policy` is the From domain's DMARC policy, null when it
 * publishes none or the lookup failed).
 */
export function alignmentVerdict(from: string, smtpUser: string, policy: DmarcPolicy | null): AlignmentVerdict {
  const fromDomain = emailDomain(from)
  const accountDomain = isPlainEmail(smtpUser) ? emailDomain(smtpUser) : ''
  if (accountDomain && sameOrgDomain(fromDomain, accountDomain)) return { status: 'aligned', message: '', policy }
  const strict = policy === 'reject' || policy === 'quarantine'
  if (accountDomain && strict) {
    return {
      status: 'rejected',
      policy,
      message: `${fromDomain} publishes DMARC p=${policy} and the SMTP account is on ${accountDomain}, so mail From ${from} is likely to be ${policy === 'reject' ? 'refused' : 'sent to spam'}. Remove REPLY_FROM_EMAIL to send from ${smtpUser}, or set up DKIM for ${fromDomain} with your mail provider.`,
    }
  }
  if (strict) {
    return {
      status: 'check',
      policy,
      message: `${fromDomain} publishes DMARC p=${policy}: make sure your mail provider signs mail for ${fromDomain} (DKIM), or replies may be ${policy === 'reject' ? 'refused' : 'sent to spam'}.`,
    }
  }
  return { status: 'unknown', policy, message: '' }
}

type CacheGlobal = typeof globalThis & { __dmarcCache?: Map<string, { at: number; policy: DmarcPolicy | null }> }
const CACHE_MS = 60 * 60_000

/** DMARC policy of a domain (TXT _dmarc.<domain>), null when none or unreachable; cached for an hour. */
export async function dmarcPolicy(domain: string, now = Date.now()): Promise<DmarcPolicy | null> {
  const d = domain.toLowerCase()
  if (!/^[a-z0-9.-]{1,253}$/.test(d)) return null
  const g = globalThis as CacheGlobal
  g.__dmarcCache ??= new Map()
  const hit = g.__dmarcCache.get(d)
  if (hit && now - hit.at < CACHE_MS) return hit.policy
  let policy: DmarcPolicy | null = null
  try {
    const resolver = new Resolver({ timeout: 3000, tries: 1 })
    const records = await new Promise<string[][]>((resolve, reject) => resolver.resolveTxt(`_dmarc.${d}`, (err, rec) => (err ? reject(err) : resolve(rec))))
    for (const chunks of records) {
      const p = parseDmarcPolicy(chunks.join(''))
      if (p) {
        policy = p
        break
      }
    }
  } catch {
    policy = null
  }
  g.__dmarcCache.set(d, { at: now, policy })
  return policy
}

/** The verdict for sending From `from` through the configured SMTP account (null without SMTP or address). */
export async function checkFromAlignment(from: string | null): Promise<AlignmentVerdict | null> {
  if (!smtpConfigured() || !from || !isPlainEmail(from)) return null
  const user = env('SMTP_USER')
  const fromDomain = emailDomain(from)
  if (isPlainEmail(user) && sameOrgDomain(fromDomain, emailDomain(user))) return { status: 'aligned', message: '', policy: null }
  return alignmentVerdict(from, user, await dmarcPolicy(fromDomain))
}

/** The alignment verdict for the configured reply From address (null without SMTP). */
export async function checkReplyAlignment(): Promise<AlignmentVerdict | null> {
  return checkFromAlignment(replyFrom().from)
}

/** The address notifications (contact messages, password resets) are sent From: FROM_EMAIL, else SMTP_USER. */
export function notificationFrom(): string | null {
  const configured = env('FROM_EMAIL')
  const address = /<([^>]+)>/.exec(configured)?.[1] || configured
  if (isPlainEmail(address)) return address
  const user = env('SMTP_USER')
  return isPlainEmail(user) ? user : null
}
