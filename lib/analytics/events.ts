import type { NextApiRequest } from 'next'
import { ipFromReq } from '../rateLimit'
import { log } from '../log'
import { ipBucket } from '../security/ip'
import { sharedLimiter } from '../security/rateLimitCore'
import { getAnalyticsDb } from './db'
import { dropReason, saltFor, siteHostOf, visitorHash } from './ingest'
import {
  CLIENT_DAILY_SHARE,
  CLIENT_EVENTS_PER_MIN,
  NETWORK_DAILY_SHARE,
  NETWORK_EVENTS_PER_MIN,
  createDailyShares,
  networkOf,
  takeUnits,
  type DailyShares,
} from './limits'
import { isRecordablePath } from './published'
import { dayMinus, normalizeTrackedPath, utcDay } from './shared'
import {
  CONTACT_PROPS,
  CV_FILE_PROPS,
  EVENTS_RAW_DAYS,
  EVENTS_ROLLUP_DAYS,
  SEARCH_RETENTION_DAYS,
  contactProp,
  cvPrintProp,
  isArticlePath,
  isClientGoal,
  normalizeSearchQuery,
  outboundHost,
  type ClientGoal,
  type GoalName,
  type ServerGoal,
} from './eventsShared'

/**
 * Goal events (H9): a few actions counted without cookies or identifiers,
 * next to the page views of lib/analytics/ingest.
 *
 *   cv_download     GET /cv.pdf, /cv.txt, /cv.json, /cv/zh.* — prop "en-pdf" …   server
 *   vcard_save      GET /api/vcard                                               server
 *   contact_sent    a contact message the server accepted — prop: its intent   server
 *   cv_print        print dialog opened on /cv or /cv/zh — prop "en" | "zh"    browser
 *   email_click     a mailto: link clicked — prop: the page path               browser
 *   outbound_click  a link to another site clicked — prop: that site's host    browser
 *   read_through    the end of a post / case study reached — prop: its path    browser
 *   search_empty    a ⌘K search that found nothing — prop: the normalised      browser
 *                   text (lib/analytics/eventsShared normalizeSearchQuery)
 *
 * What is stored per event: time, UTC day, the name, that one property
 * ('' when none) and the visitor hash of page views — sha256(daily salt +
 * site host + IP + user agent), 16 hex characters, with the salt from
 * lib/analytics/ingest (random, in memory only, replaced at UTC midnight).
 * It counts visitor-days and links the steps of a conversion within one UTC
 * day; it cannot be linked across days. The IP address and user agent are
 * never stored.
 *
 * Exclusions — the same as page views: Do Not Track / Global Privacy
 * Control, bots (user agent), a signed-in admin (session or hint cookie);
 * the browser additionally skips automated browsers and /admin pages, and
 * the server accepts browser events only for public, published pages
 * (lib/analytics/published) and only from this site (Sec-Fetch-Site /
 * Origin, as for page views). Server-side events skip that cross-site rule
 * on purpose — a link to /cv.pdf on another site (LinkedIn) is a real
 * download — and also skip HEAD requests and browser prefetches.
 *
 * Budgets (lib/analytics/limits): events share the per-client and
 * per-network per-minute counters of the page-view beacon; each client and
 * network may add CLIENT_DAILY_SHARE / NETWORK_DAILY_SHARE event rows per
 * day, and at most EVENTS_DAILY_CAP rows are stored per UTC day. A repeat of
 * the same event by the same visitor within DEDUPE_MS (a double click, a PDF
 * viewer fetching the file again) is counted once.
 *
 * Storage: buffered and written in one transaction every 2 s; the first
 * write of a new UTC day — and the daily maintenance timer and every admin
 * report — roll finished days up into `events_daily` (per name) and
 * `event_props_daily` (per name × property) and prune: raw events
 * after RAW_EVENTS_DAYS, rollups after ROLLUP_EVENTS_DAYS, and everything of
 * `search_empty` (raw and rolled up) after SEARCH_EVENTS_DAYS. Every failure
 * is swallowed: recording an event never breaks the request it rides on.
 */

export const EVENTS_FLUSH_MS = 2000
export const EVENTS_DAILY_CAP = 50_000
export const RAW_EVENTS_DAYS = EVENTS_RAW_DAYS
export const ROLLUP_EVENTS_DAYS = EVENTS_ROLLUP_DAYS
export const SEARCH_EVENTS_DAYS = SEARCH_RETENTION_DAYS
export const DEDUPE_MS = 30_000
const DEDUPE_MAX_KEYS = 5_000
const MINUTE_MS = 60_000
const MAX_BODY = 1024

type EventRow = { ts: number; day: string; name: GoalName; prop: string; visitor: string }

type EventsState = {
  rows: EventRow[]
  timer: ReturnType<typeof setTimeout> | null
  cap: { day: string; count: number } | null
  capWarned: string | null
  rollupDay: string | null
  shares: DailyShares | null
  recent: Map<string, number>
  maintenance: ReturnType<typeof setTimeout> | null
}

type EventsGlobal = typeof globalThis & { __analyticsEvents?: EventsState }

/** Per process (globalThis: API routes are separate webpack runtimes). */
function state(): EventsState {
  const g = globalThis as EventsGlobal
  if (!g.__analyticsEvents) {
    g.__analyticsEvents = {
      rows: [],
      timer: null,
      cap: null,
      capWarned: null,
      rollupDay: null,
      shares: null,
      recent: new Map(),
      maintenance: null,
    }
  }
  return g.__analyticsEvents
}

const headerOf = (req: Pick<NextApiRequest, 'headers'>, name: string): string => {
  const v = req.headers[name]
  return (Array.isArray(v) ? v[0] : v) || ''
}

/** A browser prefetch / prerender (Sec-Purpose, Purpose, X-Moz, X-Purpose): nobody asked for the file yet. */
export function isPrefetch(req: Pick<NextApiRequest, 'headers'>): boolean {
  return ['sec-purpose', 'purpose', 'x-moz', 'x-purpose'].some((h) => /prefetch|prerender|preview/i.test(headerOf(req, h)))
}

/**
 * Why a server-side event must not be recorded, or null: the page-view rules
 * (lib/analytics/ingest dropReason: DNT, GPC, bot, admin) without the
 * cross-site rule, plus HEAD requests and prefetches.
 */
export function serverDropReason(req: Pick<NextApiRequest, 'headers' | 'cookies' | 'method'>): string | null {
  if (req.method === 'HEAD') return 'head'
  if (isPrefetch(req)) return 'prefetch'
  const headers = { ...req.headers }
  delete headers['sec-fetch-site']
  delete headers.origin
  return dropReason({ headers, cookies: req.cookies })
}

// ── Browser beacon (POST /api/g) ──────────────────────────────────────────

/** `path`: the tracked page the event came from (checked against the published pages), or null for a search — its page is never stored, so any public page will do. */
export type ParsedGoal = { name: ClientGoal; path: string | null; prop: string }

/** A same-site path outside /admin (a search may come from any public page, e.g. the 404 page's search field). */
function isPublicSitePath(raw: unknown): boolean {
  return typeof raw === 'string' && raw.length <= 512 && raw.startsWith('/') && !raw.startsWith('//') && !/^\/admin(?:[/?#]|$)/i.test(raw)
}

/**
 * Parse and validate one beacon body: `{ n, p, v? }` as text/plain JSON.
 * `p` (the page) must be a public tracked path — for search_empty any
 * public same-site path — and is stored only as the property of
 * email_click / read_through. `v` is read only for outbound_click (a host)
 * and search_empty (the search text).
 */
export function parseGoalBeacon(body: unknown, siteHost = ''): ParsedGoal | null {
  let data: unknown = body
  if (typeof body === 'string') {
    if (body.length > MAX_BODY) return null
    try {
      data = JSON.parse(body)
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const o = data as Record<string, unknown>
  if (!isClientGoal(o.n)) return null
  if (o.n === 'search_empty') {
    // From any public page — the 404 page of a missing post has a search field too.
    const query = isPublicSitePath(o.p) ? normalizeSearchQuery(o.v) : null
    return query === null ? null : { name: 'search_empty', path: null, prop: query }
  }
  const path = normalizeTrackedPath(o.p)
  if (!path) return null
  let prop: string | null = null
  switch (o.n) {
    case 'email_click':
      prop = path
      break
    case 'read_through':
      prop = isArticlePath(path) ? path : null
      break
    case 'cv_print':
      prop = cvPrintProp(path)
      break
    case 'outbound_click':
      prop = outboundHost(o.v, siteHost)
      break
  }
  return prop === null ? null : { name: o.n, path, prop }
}

export type GoalOutcome = { recorded: boolean; dropped: string | null }

const limiter = () => sharedLimiter('analytics', 20_000)

/**
 * Record one browser goal event (POST /api/g). Drop reasons: dnt, gpc, bot,
 * admin, cross-site, rate-limit, invalid, unpublished, duplicate, cap, share.
 */
export function ingestGoal(req: NextApiRequest, now: number = Date.now()): GoalOutcome {
  const reason = dropReason(req)
  if (reason) return { recorded: false, dropped: reason }
  const ip = ipFromReq(req)
  if (!takeBudget(ip, now)) return { recorded: false, dropped: 'rate-limit' }
  const goal = parseGoalBeacon(req.body, siteHostOf(req))
  if (!goal) return { recorded: false, dropped: 'invalid' }
  if (goal.path && !isRecordablePath(goal.path, now)) return { recorded: false, dropped: 'unpublished' }
  return accept(req, ip, goal.name, goal.prop, now)
}

// ── Server-side events ────────────────────────────────────────────────────

const SERVER_PROPS: Record<ServerGoal, readonly string[]> = {
  cv_download: CV_FILE_PROPS,
  vcard_save: [''],
  contact_sent: CONTACT_PROPS,
}

/**
 * Count a server-side goal for the request being answered: cv_download
 * (prop from cvFileProp), vcard_save (no prop), contact_sent (prop from
 * contactProp). Synchronous and cheap (a buffer push); never throws.
 */
export function recordServerGoal(req: NextApiRequest, name: ServerGoal, prop = '', now: number = Date.now()): GoalOutcome {
  try {
    const clean = name === 'contact_sent' ? contactProp(prop) : prop
    if (!SERVER_PROPS[name]?.includes(clean)) return { recorded: false, dropped: 'invalid' }
    const reason = serverDropReason(req)
    if (reason) return { recorded: false, dropped: reason }
    const ip = ipFromReq(req)
    if (!takeBudget(ip, now)) return { recorded: false, dropped: 'rate-limit' }
    return accept(req, ip, name, clean, now)
  } catch (err) {
    log.warn('analytics: a goal event could not be recorded', { err, name })
    return { recorded: false, dropped: 'error' }
  }
}

// ── Shared acceptance path ────────────────────────────────────────────────

const clientKeyOf = (ip: string) => `c|${ipBucket(ip)}`
const networkKeyOf = (ip: string) => {
  const net = networkOf(ip)
  return net ? `n|${net}` : null
}

/** One unit from the page-view beacon's per-minute counters (client, then network). */
function takeBudget(ip: string, now: number): boolean {
  if (!takeUnits(limiter(), clientKeyOf(ip), CLIENT_EVENTS_PER_MIN, 1, MINUTE_MS, now)) return false
  const network = networkKeyOf(ip)
  return !network || takeUnits(limiter(), network, NETWORK_EVENTS_PER_MIN, 1, MINUTE_MS, now) === 1
}

/** Rows already stored for `day` plus those waiting in the buffer. */
function rawCountFor(day: string): number {
  const s = state()
  if (!s.cap || s.cap.day !== day) {
    const row = getAnalyticsDb().prepare('SELECT count(*) AS n FROM events WHERE day = ?').get(day) as { n: number }
    s.cap = { day, count: row.n }
  }
  return s.cap.count
}

/** True when the same event by the same visitor was accepted less than DEDUPE_MS ago (and remembers this one). */
function isRepeat(key: string, now: number): boolean {
  const recent = state().recent
  const last = recent.get(key)
  if (last !== undefined && now - last >= 0 && now - last < DEDUPE_MS) return true
  if (recent.size >= DEDUPE_MAX_KEYS) {
    for (const [k, at] of recent) if (now - at >= DEDUPE_MS || at > now) recent.delete(k)
    if (recent.size >= DEDUPE_MAX_KEYS) recent.clear()
  }
  recent.set(key, now)
  return false
}

function accept(req: NextApiRequest, ip: string, name: GoalName, prop: string, now: number): GoalOutcome {
  const day = utcDay(now)
  const s = state()
  if (rawCountFor(day) >= EVENTS_DAILY_CAP) {
    if (s.capWarned !== day) {
      s.capWarned = day
      log.warn('analytics daily event cap reached; further goal events today are dropped', { day, cap: EVENTS_DAILY_CAP })
    }
    return { recorded: false, dropped: 'cap' }
  }
  const shares = (s.shares ??= createDailyShares(saltFor))
  const client = clientKeyOf(ip)
  const network = networkKeyOf(ip)
  if (shares.remaining(client, day, CLIENT_DAILY_SHARE) <= 0 || (network && shares.remaining(network, day, NETWORK_DAILY_SHARE) <= 0)) {
    return { recorded: false, dropped: 'share' }
  }
  const visitor = visitorHash(saltFor(day), siteHostOf(req), ip, headerOf(req, 'user-agent'))
  if (isRepeat(`${visitor}\n${name}\n${prop}`, now)) return { recorded: false, dropped: 'duplicate' }

  s.rows.push({ ts: now, day, name, prop, visitor })
  if (s.cap) s.cap.count += 1
  shares.add(client, day, 1)
  if (network) shares.add(network, day, 1)
  scheduleFlush()
  ensureMaintenance()
  return { recorded: true, dropped: null }
}

// ── Buffer, rollup, retention ─────────────────────────────────────────────

function scheduleFlush() {
  const s = state()
  if (s.timer) return
  s.timer = setTimeout(() => {
    s.timer = null
    flushEvents()
  }, EVENTS_FLUSH_MS)
  s.timer.unref?.()
}

/** Write the buffer in one transaction, then roll up if a new UTC day has begun. Never throws. */
export function flushEvents(now: number = Date.now()) {
  const s = state()
  if (s.timer) {
    clearTimeout(s.timer)
    s.timer = null
  }
  const rows = s.rows.splice(0)
  try {
    const db = getAnalyticsDb()
    if (rows.length) {
      const insert = db.prepare('INSERT INTO events (ts, day, name, prop, visitor) VALUES (@ts, @day, @name, @prop, @visitor)')
      db.transaction(() => {
        for (const r of rows) insert.run(r)
      })()
    }
    const today = utcDay(now)
    if (s.rollupDay !== today) {
      rollupEvents(today)
      s.rollupDay = today
    }
  } catch (err) {
    log.error('analytics event flush failed; the buffered events were dropped', { err, events: rows.length })
  }
}

/**
 * Fold every finished UTC day not rolled up yet into events_daily and
 * event_props_daily (idempotent: a day's rows are rebuilt from its raw
 * rows), then prune —
 * raw events older than RAW_EVENTS_DAYS, rollups older than
 * ROLLUP_EVENTS_DAYS, and search_empty (raw and rolled up) older than
 * SEARCH_EVENTS_DAYS. One transaction.
 */
export function rollupEvents(today: string) {
  const db = getAnalyticsDb()
  const rolled = (db.prepare("SELECT value FROM meta WHERE key = 'events_rolled_through'").get() as { value: string } | undefined)?.value ?? null
  const days = (
    db.prepare('SELECT DISTINCT day FROM events WHERE day < ? AND (? IS NULL OR day > ?) ORDER BY day').all(today, rolled, rolled) as Array<{ day: string }>
  ).map((r) => r.day)
  const yesterday = dayMinus(today, 1)
  db.transaction(() => {
    for (const day of days) {
      for (const table of ['events_daily', 'event_props_daily']) db.prepare(`DELETE FROM ${table} WHERE day = ?`).run(day)
      db.prepare(
        `INSERT INTO events_daily (day, name, events, visitors)
         SELECT day, name, count(*), count(DISTINCT visitor) FROM events WHERE day = ? GROUP BY name`,
      ).run(day)
      db.prepare(
        `INSERT INTO event_props_daily (day, name, prop, events, visitors)
         SELECT day, name, prop, count(*), count(DISTINCT visitor) FROM events WHERE day = ? GROUP BY name, prop`,
      ).run(day)
    }
    if (!rolled || yesterday > rolled) {
      db.prepare(
        `INSERT INTO meta (key, value) VALUES ('events_rolled_through', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(yesterday)
    }
    db.prepare('DELETE FROM events WHERE day < ?').run(dayMinus(today, RAW_EVENTS_DAYS))
    db.prepare("DELETE FROM events WHERE name = 'search_empty' AND day < ?").run(dayMinus(today, SEARCH_EVENTS_DAYS))
    for (const table of ['events_daily', 'event_props_daily']) {
      db.prepare(`DELETE FROM ${table} WHERE day < ?`).run(dayMinus(today, ROLLUP_EVENTS_DAYS))
      db.prepare(`DELETE FROM ${table} WHERE name = 'search_empty' AND day < ?`).run(dayMinus(today, SEARCH_EVENTS_DAYS))
    }
  })()
  if (days.length) log.info('analytics event rollup', { days: days.length, through: yesterday })
}

/**
 * Write what is buffered and, once per UTC day, roll up and prune (the
 * admin report and the daily timer call this, so retention never waits for
 * the next event). Never throws.
 */
export function maintainEvents(now: number = Date.now()) {
  flushEvents(now)
}

/** Milliseconds from `now` to five minutes past the next UTC midnight. */
export function msUntilMaintenance(now: number): number {
  const next = Date.parse(`${dayMinus(utcDay(now), -1)}T00:05:00Z`)
  return Math.max(1000, next - now)
}

/**
 * Keep retention running even on days without new events: once per process
 * (from the first event, or startEventsMaintenance at boot), a timer prunes
 * and rolls up every day shortly after UTC midnight. It never keeps the
 * process alive.
 */
function ensureMaintenance() {
  const s = state()
  if (s.maintenance) return
  const arm = () => {
    s.maintenance = setTimeout(() => {
      maintainEvents()
      arm()
    }, msUntilMaintenance(Date.now()))
    s.maintenance.unref?.()
  }
  arm()
}

/** Boot hook (instrumentation): prune / roll up now, then daily. Idempotent. */
export function startEventsMaintenance() {
  maintainEvents()
  ensureMaintenance()
}

/** Stop timers and forget buffered state (tests). */
export function resetEventsState() {
  const s = state()
  if (s.timer) clearTimeout(s.timer)
  if (s.maintenance) clearTimeout(s.maintenance)
  const g = globalThis as EventsGlobal
  delete g.__analyticsEvents
}
