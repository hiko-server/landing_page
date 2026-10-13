import crypto from 'crypto'
import type { NextApiRequest } from 'next'
import { ADMIN_COOKIE } from '../auth'
import { ipFromReq, rateLimit } from '../rateLimit'
import { log } from '../log'
import { getAnalyticsDb } from './db'
import {
  dayMinus,
  isVitalName,
  isVitalValueInRange,
  normalizeNavType,
  normalizeTrackedPath,
  rateVital,
  utcDay,
  type NavType,
  type VitalName,
} from './shared'

/**
 * POST /api/a — cookieless page-view and Web Vitals collection.
 *
 * Privacy model (documented on /colophon and in the README):
 *   - Nothing is recorded when the browser sends `DNT: 1` or `Sec-GPC: 1`,
 *     for bots, for signed-in admins (cv_admin_token / cv_admin_hint cookie),
 *     for cross-site posts, or for paths outside the public allowlist.
 *   - The IP address and user agent are never stored. A visitor is
 *     sha256(daily salt + site host + IP + user agent) truncated to 16 hex
 *     characters; the salt is random, rotates at UTC midnight and exists only
 *     in this process's memory, so a hash cannot be recomputed later or linked
 *     across days (a restart also starts a new salt).
 *   - Stored per view: time, UTC day, path, referrer HOST (only when it is
 *     another site), country (Cloudflare's cf-ipcountry), coarse device and
 *     browser family, page language.
 *
 * Writes are buffered and flushed in one transaction every 2 s; at most
 * 200 000 raw rows are accepted per UTC day. The first flush of a new UTC day
 * rolls finished days up into daily tables and prunes raw rows (hits after
 * 35 days, vitals after 30, rollups after 400). Every failure is swallowed:
 * the endpoint always answers 204.
 */

export const FLUSH_MS = 2000
export const DAILY_RAW_CAP = 200_000
export const RAW_HITS_DAYS = 35
export const RAW_VITALS_DAYS = 30
export const ROLLUP_DAYS = 400
const MAX_EVENTS_PER_BEACON = 10
const ADMIN_HINT_COOKIE = 'cv_admin_hint'

export const BOT_UA =
  /bot|crawl|spider|slurp|archiver|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|preview|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|statuscake|curl|wget|httpie|python|aiohttp|go-http|okhttp|java\/|libwww|node-fetch|axios|undici|scrapy|feedfetcher|feed|rss/i

// ── Pure parsing (unit-tested) ────────────────────────────────────────────

export type PageviewEvent = { t: 'pv'; path: string; referrer: string | null; lang: string | null }
export type VitalEvent = { t: 'v'; route: string; name: VitalName; value: number; nav: NavType | null }
export type AnalyticsEvent = PageviewEvent | VitalEvent

const LANG_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/

function parseOne(raw: unknown): AnalyticsEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.t === 'pv') {
    const path = normalizeTrackedPath(o.p)
    if (!path) return null
    const lang = typeof o.l === 'string' && LANG_RE.test(o.l.toLowerCase()) ? o.l.toLowerCase() : null
    const referrer = typeof o.r === 'string' && o.r.length <= 2048 ? o.r : null
    return { t: 'pv', path, referrer, lang }
  }
  if (o.t === 'v') {
    const route = normalizeTrackedPath(o.route)
    if (!route || !isVitalName(o.name) || !isVitalValueInRange(o.name, o.value)) return null
    const value = o.name === 'CLS' ? Math.round(o.value * 10_000) / 10_000 : Math.round(o.value)
    return { t: 'v', route, name: o.name, value, nav: normalizeNavType(o.nav) }
  }
  return null
}

/** A beacon body (text/plain JSON, or an already-parsed object): one event or an array of up to 10. */
export function parseEvents(body: unknown): AnalyticsEvent[] {
  let data: unknown = body
  if (typeof body === 'string') {
    if (body.length > 8192) return []
    try {
      data = JSON.parse(body)
    } catch {
      return []
    }
  }
  const list = Array.isArray(data) ? data.slice(0, MAX_EVENTS_PER_BEACON) : [data]
  return list.map(parseOne).filter((e): e is AnalyticsEvent => e !== null)
}

const headerOf = (req: Pick<NextApiRequest, 'headers'>, name: string): string => {
  const v = req.headers[name]
  return (Array.isArray(v) ? v[0] : v) || ''
}

const stripWww = (host: string) => host.toLowerCase().replace(/^www\./, '')

/** The site's own host (Host header without port), lowercased. */
export function siteHostOf(req: Pick<NextApiRequest, 'headers'>): string {
  return headerOf(req, 'host').toLowerCase().replace(/:\d+$/, '')
}

function hasCookie(req: Pick<NextApiRequest, 'headers' | 'cookies'>, name: string): boolean {
  if (req.cookies && typeof req.cookies[name] === 'string') return true
  return headerOf(req, 'cookie')
    .split(';')
    .some((part) => part.trim().startsWith(`${name}=`))
}

/** Why this request must not be recorded, or null when it may be. */
export function dropReason(req: Pick<NextApiRequest, 'headers' | 'cookies'>): string | null {
  if (headerOf(req, 'dnt') === '1') return 'dnt'
  if (headerOf(req, 'sec-gpc') === '1') return 'gpc'
  const ua = headerOf(req, 'user-agent')
  if (!ua || BOT_UA.test(ua)) return 'bot'
  if (hasCookie(req, ADMIN_COOKIE) || hasCookie(req, ADMIN_HINT_COOKIE)) return 'admin'
  const fetchSite = headerOf(req, 'sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return 'cross-site'
  const origin = headerOf(req, 'origin')
  if (origin) {
    try {
      if (new URL(origin).host.toLowerCase() !== headerOf(req, 'host').toLowerCase()) return 'cross-site'
    } catch {
      return 'cross-site'
    }
  }
  return null
}

/** Coarse device class from the user agent. */
export function deviceOf(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i.test(ua)) return 'tablet'
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return 'mobile'
  return 'desktop'
}

/** Browser family from the user agent (order matters: Edge and Opera also say Chrome). */
export function browserOf(ua: string): string {
  if (/Edg(?:e|A|iOS)?\//.test(ua)) return 'Edge'
  if (/OPR\/|Opera/.test(ua)) return 'Opera'
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet'
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox'
  if (/Chrome\/|CriOS\/|Chromium\//.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari'
  return 'Other'
}

/** Two-letter country from Cloudflare, or null (XX = unknown, T1 = Tor). */
export function countryOf(req: Pick<NextApiRequest, 'headers'>): string | null {
  const c = headerOf(req, 'cf-ipcountry').toUpperCase()
  return /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : null
}

/** Referrer host when it is another site; null for direct visits and internal navigation. */
export function referrerHost(referrer: string | null, siteHost: string): string | null {
  if (!referrer) return null
  try {
    const url = new URL(referrer)
    if (!['http:', 'https:', 'android-app:'].includes(url.protocol)) return null
    const host = stripWww(url.hostname)
    if (!host || host === stripWww(siteHost)) return null
    return host.slice(0, 253)
  } catch {
    return null
  }
}

export function visitorHash(salt: Buffer, host: string, ip: string, ua: string): string {
  return crypto.createHash('sha256').update(salt).update(`\n${host}\n${ip}\n${ua}`).digest('hex').slice(0, 16)
}

// ── Process state (globalThis: survives dev hot reloads, one per process) ─

type HitRow = {
  ts: number
  day: string
  path: string
  ref_host: string | null
  country: string | null
  device: string
  browser: string
  visitor: string
  lang: string | null
}
type VitalRow = {
  ts: number
  day: string
  route: string
  name: string
  value: number
  rating: string
  device: string
  nav: string | null
}

type IngestState = {
  salt: { day: string; value: Buffer } | null
  hits: HitRow[]
  vitals: VitalRow[]
  timer: ReturnType<typeof setTimeout> | null
  cap: { day: string; count: number } | null
  capWarned: string | null
  rollupDay: string | null
}

type IngestGlobal = typeof globalThis & { __analyticsIngest?: IngestState }

function state(): IngestState {
  const g = globalThis as IngestGlobal
  if (!g.__analyticsIngest) {
    g.__analyticsIngest = { salt: null, hits: [], vitals: [], timer: null, cap: null, capWarned: null, rollupDay: null }
  }
  return g.__analyticsIngest
}

/** Today's salt: random, in memory only, replaced (and the old one forgotten) at UTC midnight. */
export function saltFor(day: string): Buffer {
  const s = state()
  if (!s.salt || s.salt.day !== day) s.salt = { day, value: crypto.randomBytes(32) }
  return s.salt.value
}

/** Rows already stored for `day` plus those waiting in the buffer. */
function rawCountFor(day: string): number {
  const s = state()
  if (!s.cap || s.cap.day !== day) {
    const db = getAnalyticsDb()
    const row = db
      .prepare('SELECT (SELECT count(*) FROM hits WHERE day = ?) + (SELECT count(*) FROM vitals WHERE day = ?) AS n')
      .get(day, day) as { n: number }
    s.cap = { day, count: row.n }
  }
  return s.cap.count
}

function scheduleFlush() {
  const s = state()
  if (s.timer) return
  s.timer = setTimeout(() => {
    s.timer = null
    flushNow()
  }, FLUSH_MS)
  s.timer.unref?.()
}

/**
 * Record one beacon. Returns what happened (for tests and debug logs); the
 * route answers 204 regardless.
 */
export function ingest(req: NextApiRequest, now: number = Date.now()): { accepted: number; dropped: string | null } {
  const reason = dropReason(req)
  if (reason) return { accepted: 0, dropped: reason }
  if (!rateLimit(req, 120, 60_000, 'analytics').allowed) return { accepted: 0, dropped: 'rate-limit' }

  const events = parseEvents(req.body)
  if (!events.length) return { accepted: 0, dropped: 'invalid' }

  const day = utcDay(now)
  const s = state()
  const available = DAILY_RAW_CAP - rawCountFor(day)
  if (available <= 0) {
    if (s.capWarned !== day) {
      s.capWarned = day
      log.warn('analytics daily raw cap reached; further events today are dropped', { day, cap: DAILY_RAW_CAP })
    }
    return { accepted: 0, dropped: 'cap' }
  }

  const ua = headerOf(req, 'user-agent')
  const host = siteHostOf(req)
  const device = deviceOf(ua)
  let visitor: string | null = null
  const accepted = events.slice(0, available)
  for (const e of accepted) {
    if (e.t === 'pv') {
      visitor ??= visitorHash(saltFor(day), host, ipFromReq(req), ua)
      s.hits.push({
        ts: now,
        day,
        path: e.path,
        ref_host: referrerHost(e.referrer, host),
        country: countryOf(req),
        device,
        browser: browserOf(ua),
        visitor,
        lang: e.lang,
      })
    } else {
      s.vitals.push({
        ts: now,
        day,
        route: e.route,
        name: e.name,
        value: e.value,
        rating: rateVital(e.name, e.value),
        device,
        nav: e.nav,
      })
    }
  }
  if (s.cap) s.cap.count += accepted.length
  scheduleFlush()
  return { accepted: accepted.length, dropped: null }
}

/** Write the buffer in one transaction, then roll up if a new UTC day has begun. Never throws. */
export function flushNow(now: number = Date.now()) {
  const s = state()
  if (s.timer) {
    clearTimeout(s.timer)
    s.timer = null
  }
  const hits = s.hits.splice(0)
  const vitals = s.vitals.splice(0)
  try {
    const db = getAnalyticsDb()
    if (hits.length || vitals.length) {
      const insertHit = db.prepare(
        `INSERT INTO hits (ts, day, path, ref_host, country, device, browser, visitor, lang)
         VALUES (@ts, @day, @path, @ref_host, @country, @device, @browser, @visitor, @lang)`,
      )
      const insertVital = db.prepare(
        `INSERT INTO vitals (ts, day, route, name, value, rating, device, nav)
         VALUES (@ts, @day, @route, @name, @value, @rating, @device, @nav)`,
      )
      db.transaction(() => {
        for (const h of hits) insertHit.run(h)
        for (const v of vitals) insertVital.run(v)
      })()
    }
    const today = utcDay(now)
    if (s.rollupDay !== today) {
      rollup(today)
      s.rollupDay = today
    }
  } catch (err) {
    log.error('analytics flush failed; the buffered events were dropped', { err, hits: hits.length, vitals: vitals.length })
  }
}

/**
 * Fold every finished UTC day not rolled up yet into daily / refs_daily /
 * dims_daily (idempotent: a day's rollup rows are rebuilt from its raw rows),
 * then prune raw rows and old rollups. One transaction.
 */
export function rollup(today: string) {
  const db = getAnalyticsDb()
  const rolled = (db.prepare("SELECT value FROM meta WHERE key = 'rolled_through'").get() as { value: string } | undefined)?.value
  const days = (
    db.prepare('SELECT DISTINCT day FROM hits WHERE day < ? AND (? IS NULL OR day > ?) ORDER BY day').all(today, rolled ?? null, rolled ?? null) as Array<{
      day: string
    }>
  ).map((r) => r.day)
  const yesterday = dayMinus(today, 1)

  db.transaction(() => {
    for (const day of days) {
      for (const table of ['daily', 'refs_daily', 'dims_daily']) db.prepare(`DELETE FROM ${table} WHERE day = ?`).run(day)
      db.prepare(
        `INSERT INTO daily (day, path, views, visitors)
         SELECT day, path, count(*), count(DISTINCT visitor) FROM hits WHERE day = ? GROUP BY path`,
      ).run(day)
      db.prepare(
        `INSERT INTO refs_daily (day, ref_host, visitors)
         SELECT day, ref_host, count(DISTINCT visitor) FROM hits WHERE day = ? AND ref_host IS NOT NULL GROUP BY ref_host`,
      ).run(day)
      db.prepare(
        `INSERT INTO dims_daily (day, kind, value, views, visitors)
         SELECT day, 'site', '', count(*), count(DISTINCT visitor) FROM hits WHERE day = ?`,
      ).run(day)
      for (const kind of ['country', 'device', 'browser']) {
        db.prepare(
          `INSERT INTO dims_daily (day, kind, value, views, visitors)
           SELECT day, '${kind}', ${kind}, count(*), count(DISTINCT visitor) FROM hits
           WHERE day = ? AND ${kind} IS NOT NULL GROUP BY ${kind}`,
        ).run(day)
      }
    }
    if (!rolled || yesterday > rolled) {
      db.prepare(
        `INSERT INTO meta (key, value) VALUES ('rolled_through', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(yesterday)
    }
    db.prepare('DELETE FROM hits WHERE day < ?').run(dayMinus(today, RAW_HITS_DAYS))
    db.prepare('DELETE FROM vitals WHERE day < ?').run(dayMinus(today, RAW_VITALS_DAYS))
    for (const table of ['daily', 'refs_daily', 'dims_daily']) {
      db.prepare(`DELETE FROM ${table} WHERE day < ?`).run(dayMinus(today, ROLLUP_DAYS))
    }
  })()
  if (days.length) log.info('analytics rollup', { days: days.length, through: yesterday })
}
