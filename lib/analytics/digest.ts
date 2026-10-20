import { getAnalyticsDb } from './db'
import { getExploreReport } from './explore'
import { getGoalsExplore } from './goalsQuery'
import { DEFAULT_EXPLORE_QUERY, exploreSearch, type ExploreQuery } from './exploreShared'
import { GOAL_LABEL } from './eventsShared'
import { countryName } from './format'
import { OTHER_KEY } from './shared'
import {
  DIGEST_HOUR_UTC,
  DIGEST_MAX_ATTEMPTS,
  DIGEST_WEEKDAY,
  digestWeek,
  isDigestDue,
  nextDigestAt,
  renderDigest,
  type DigestData,
  type DigestState,
} from './digestShared'
import { maskEmail } from './exploreFormat'
import { sendMail, siteUrl } from '../mailer'
import { smtpConfigured } from '../mailAlignment'
import { log } from '../log'

/**
 * The weekly analytics digest e-mail (H10) — SERVER-ONLY.
 *
 * Off until the owner switches it on in Admin → Analytics (stored in
 * analytics.db `meta`: digest_enabled, digest_last_week, digest_attempts,
 * digest_last_sent_at, digest_last_error). Sent through the site's SMTP
 * account (lib/mailer; From FROM_EMAIL / SMTP_USER like every
 * notification) to NOTIFY_EMAIL, else ADMIN_EMAIL, on Mondays from 01:00
 * UTC for the week before (lib/analytics/digestShared), by the schedule in
 * lib/analytics/digestSchedule. Without SMTP nothing is sent and the admin
 * card says how to set it up. A week is claimed in the store before its
 * e-mail goes out, so two processes never both send it; a failed send gives
 * the claim back and is retried hourly, at most DIGEST_MAX_ATTEMPTS times.
 */

type Db = ReturnType<typeof getAnalyticsDb>

function getMeta(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

function setMeta(db: Db, key: string, value: string) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

/** NOTIFY_EMAIL, else ADMIN_EMAIL (the address contact notifications go to). */
export function digestRecipient(): { address: string; source: 'NOTIFY_EMAIL' | 'ADMIN_EMAIL' } | null {
  for (const source of ['NOTIFY_EMAIL', 'ADMIN_EMAIL'] as const) {
    const v = (process.env[source] || '').trim()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { address: v, source }
  }
  return null
}

function attemptsFor(db: Db, week: string): number {
  const raw = getMeta(db, 'digest_attempts') || ''
  const [w, n] = raw.split(':')
  return w === week ? Number(n) || 0 : 0
}

export function readDigestState(now: number = Date.now()): DigestState {
  const db = getAnalyticsDb()
  return {
    enabled: getMeta(db, 'digest_enabled') === '1',
    lastWeek: getMeta(db, 'digest_last_week') || null,
    attempts: attemptsFor(db, digestWeek(now).from),
  }
}

export type DigestStatus = {
  smtp: boolean
  /** Masked ("s•••@example.com") — the card names the inbox without spelling it out. */
  recipient: string | null
  recipientSource: 'NOTIFY_EMAIL' | 'ADMIN_EMAIL' | null
  enabled: boolean
  weekday: number
  hourUtc: number
  /** Monday of the last week a scheduled digest was sent for. */
  lastWeek: string | null
  lastSentAt: number | null
  lastError: string | null
  nextAt: number | null
  /** The week the next digest (and a preview now) covers. */
  week: { from: string; to: string }
}

export function digestStatus(now: number = Date.now()): DigestStatus {
  const db = getAnalyticsDb()
  const state = readDigestState(now)
  const recipient = digestRecipient()
  const smtp = smtpConfigured()
  const sentAt = Number(getMeta(db, 'digest_last_sent_at'))
  return {
    smtp,
    recipient: recipient ? maskEmail(recipient.address) : null,
    recipientSource: recipient?.source ?? null,
    enabled: state.enabled,
    weekday: DIGEST_WEEKDAY,
    hourUtc: DIGEST_HOUR_UTC,
    lastWeek: state.lastWeek,
    lastSentAt: Number.isFinite(sentAt) && sentAt > 0 ? sentAt : null,
    lastError: getMeta(db, 'digest_last_error') || null,
    nextAt: smtp && recipient ? nextDigestAt(now, state) : null,
    week: digestWeek(now),
  }
}

export function setDigestEnabled(enabled: boolean) {
  setMeta(getAnalyticsDb(), 'digest_enabled', enabled ? '1' : '0')
}

/** The site host for the subject line ("lucian-dev.com"). */
function siteHost(): string {
  try {
    return new URL(siteUrl()).hostname.replace(/^www\./, '') || 'the site'
  } catch {
    return 'the site'
  }
}

/** Everything the digest of `week` says (aggregates only). */
export function buildDigestData(now: number = Date.now()): DigestData {
  const week = digestWeek(now)
  const query: ExploreQuery = { ...DEFAULT_EXPLORE_QUERY, period: 'custom', from: week.from, to: week.to, compare: true }
  const report = getExploreReport(query, { now, limit: 5 })
  const goals = getGoalsExplore(query, { now })
  const vitals = report.vitals['7d'].filter((v) => v.route === '*' && (v.name === 'LCP' || v.name === 'INP' || v.name === 'CLS'))
  const base = siteUrl().replace(/\/+$/, '')
  return {
    site: siteHost(),
    week,
    previous: { from: report.previous.from, to: report.previous.to },
    comparable: report.previous.available,
    views: report.kpis.views,
    visitors: report.kpis.visitors,
    pages: report.topPages.map((r) => ({ label: r.key, value: r.visitors, ...(report.titles[r.key] ? { detail: report.titles[r.key] } : {}) })),
    referrers: report.referrers.map((r) => ({ label: r.key === OTHER_KEY ? 'Other sites' : r.key, value: r.visitors })),
    countries: report.countries.map((r) => ({ label: countryName(r.key), value: r.visitors })),
    goals: goals.goals
      .filter((g) => g.events > 0 || (goals.comparable && g.visitors.previous > 0))
      .map((g) => ({ label: GOAL_LABEL[g.name], visitors: g.visitors, events: g.events, rate: g.rate })),
    funnel: goals.funnel.steps.map((s) => ({ label: s.label, visitors: s.visitors })),
    emptySearches: { events: goals.searches.rows.reduce((n, r) => n + r.events, 0), texts: goals.searches.rows.length },
    published: report.annotations.map((a) => ({ title: a.title, path: a.path, day: a.day })),
    vitals: vitals.map((v) => ({ name: v.name, p75: v.p75, rating: v.rating, samples: v.samples })),
    adminUrl: `${base}/admin/dashboard?tab=analytics&${exploreSearch(query)}`,
  }
}

/** An SMTP error, without addresses (it is shown in the admin and logged). */
function scrubError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/[^\s<>"'@]+@[^\s<>"'@]+/g, '[address]').slice(0, 200)
}

export type DigestOutcome = { ok: boolean; skipped?: 'smtp' | 'recipient' | 'not-due' | 'claimed'; error?: string; week: string }

/**
 * Send the digest of last week. `manual` (the admin's "Send a preview")
 * sends now, marked as a preview, and leaves the schedule alone; the
 * scheduled run sends only when isDigestDue() and claims the week first.
 */
export async function sendDigest(trigger: 'scheduled' | 'manual', now: number = Date.now()): Promise<DigestOutcome> {
  const week = digestWeek(now).from
  if (!smtpConfigured()) return { ok: false, skipped: 'smtp', week }
  const recipient = digestRecipient()
  if (!recipient) return { ok: false, skipped: 'recipient', week }
  const db = getAnalyticsDb()

  let previousClaim: string | null = null
  if (trigger === 'scheduled') {
    const claimed = db
      .transaction(() => {
        const state = readDigestState(now)
        if (!isDigestDue(now, state)) return false
        previousClaim = state.lastWeek
        setMeta(db, 'digest_last_week', week)
        setMeta(db, 'digest_attempts', `${week}:${state.attempts + 1}`)
        return true
      })
      .immediate()
    if (!claimed) return { ok: false, skipped: 'not-due', week }
  }

  try {
    const mail = renderDigest(buildDigestData(now), trigger === 'manual')
    const result = await sendMail({ to: recipient.address, subject: mail.subject, text: mail.text, html: mail.html })
    if (!result.ok) throw new Error(result.skipped ? 'SMTP is not configured' : 'The mail server did not accept the message')
    if (trigger === 'scheduled') {
      setMeta(db, 'digest_last_sent_at', String(now))
      setMeta(db, 'digest_last_error', '')
    }
    log.info('analytics digest sent', { trigger, week })
    return { ok: true, week }
  } catch (err) {
    const error = scrubError(err)
    if (trigger === 'scheduled') {
      // Give the week back (unless something else has claimed it since), so the next hour retries.
      db.transaction(() => {
        if (getMeta(db, 'digest_last_week') === week) setMeta(db, 'digest_last_week', previousClaim ?? '')
        setMeta(db, 'digest_last_error', error)
      })()
      const attempts = attemptsFor(db, week)
      log.warn('analytics digest could not be sent', { week, error, attempts, willRetry: attempts < DIGEST_MAX_ATTEMPTS })
    }
    return { ok: false, error, week }
  }
}
