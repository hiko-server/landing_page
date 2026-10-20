/**
 * Goal events (H9): the fixed allow-list of event names and the rules for
 * their one optional property. Pure — shared by the browser senders
 * (lib/analytics/goalBeacon, readThrough, printGoal, searchEmpty), the
 * server (lib/analytics/events), the report (lib/analytics/goalsQuery) and
 * the admin panel. No Node or DOM APIs here.
 *
 * Every event is a name plus at most one bounded property from a fixed set
 * of shapes. Nothing else is accepted: no addresses, no full URLs or query
 * strings, no free text — except the normalised search text of
 * `search_empty`, under the rules of normalizeSearchQuery().
 */

import { isPlausibleHost, type Kpi } from './shared'

export const GOAL_NAMES = [
  'cv_download',
  'cv_print',
  'vcard_save',
  'email_click',
  'outbound_click',
  'contact_sent',
  'read_through',
  'search_empty',
] as const
export type GoalName = (typeof GOAL_NAMES)[number]

/** Counted by the server while answering the request itself; the browser beacon can never send these. */
export const SERVER_GOALS = ['cv_download', 'vcard_save', 'contact_sent'] as const
export type ServerGoal = (typeof SERVER_GOALS)[number]

/** Sent by the browser to POST /api/g. */
export const CLIENT_GOALS = ['cv_print', 'email_click', 'outbound_click', 'read_through', 'search_empty'] as const
export type ClientGoal = (typeof CLIENT_GOALS)[number]

export function isGoalName(v: unknown): v is GoalName {
  return typeof v === 'string' && (GOAL_NAMES as readonly string[]).includes(v)
}

export function isClientGoal(v: unknown): v is ClientGoal {
  return typeof v === 'string' && (CLIENT_GOALS as readonly string[]).includes(v)
}

export function isServerGoal(v: unknown): v is ServerGoal {
  return typeof v === 'string' && (SERVER_GOALS as readonly string[]).includes(v)
}

// ── Properties ────────────────────────────────────────────────────────────

/** cv_download: the language and file of the downloaded CV ("en-pdf" … "zh-json"). */
export const CV_FILE_PROPS = ['en-pdf', 'en-txt', 'en-json', 'zh-pdf', 'zh-txt', 'zh-json'] as const
export type CvFileProp = (typeof CV_FILE_PROPS)[number]

export function cvFileProp(lang: unknown, format: unknown): CvFileProp | null {
  const prop = `${String(lang)}-${String(format)}`
  return (CV_FILE_PROPS as readonly string[]).includes(prop) ? (prop as CvFileProp) : null
}

/** cv_print: the CV page's language, from its path (/cv → en, /cv/zh → zh). */
export function cvPrintProp(path: string): 'en' | 'zh' | null {
  return path === '/cv' ? 'en' : path === '/cv/zh' ? 'zh' : null
}

/** contact_sent: the inquiry intent of the accepted message ('' when the form sent none). */
export const CONTACT_PROPS = ['role', 'freelance', 'collab', 'other', ''] as const

export function contactProp(intent: unknown): string {
  return typeof intent === 'string' && (CONTACT_PROPS as readonly string[]).includes(intent) ? intent : ''
}

/** read_through: a post or case study path (/blog/<slug>, /work/<slug>). */
export function isArticlePath(path: string): boolean {
  return /^\/(blog|work)\/[^/]+$/.test(path)
}

/**
 * outbound_click: the destination's host name only — lowercased, without
 * "www.", and only when it is a plausible public name that is not this
 * site. Never the path or query of the link.
 */
export function outboundHost(raw: unknown, siteHost = ''): string | null {
  if (typeof raw !== 'string' || raw.length > 253) return null
  const host = raw.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
  const own = siteHost.toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '')
  if (!isPlausibleHost(host) || (own && host === own)) return null
  return host
}

/** Raw events are kept this many days (with the daily visitor hash). */
export const EVENTS_RAW_DAYS = 35
/** Daily event totals are kept this many days. */
export const EVENTS_ROLLUP_DAYS = 400
/** search_empty — raw and daily totals — is kept this many days only. */
export const SEARCH_RETENTION_DAYS = 35

/** Longest stored search text, in characters (code points). */
export const SEARCH_MAX_CHARS = 40
/** A search with this many digits or more (anywhere in it) is never stored. */
export const SEARCH_MAX_DIGITS = 6
/** Shorter searches are noise (a single letter matches nothing useful). */
export const SEARCH_MIN_CHARS = 2

/**
 * The normalised text of a search that found nothing, or null when it must
 * not be stored. In order:
 *   1. Unicode NFKC (full-width letters and digits, "＠" and "﹫" become
 *      their plain forms), control and format characters become spaces;
 *   2. trimmed, runs of whitespace collapsed to one space, lowercased;
 *   3. dropped when it contains "@" (an e-mail address), or when it holds
 *      SEARCH_MAX_DIGITS or more decimal digits in total, counted over the
 *      whole text (any script's digits: a phone, ID or order number) —
 *      checked BEFORE shortening, so a long address cannot slip through;
 *   4. cut to SEARCH_MAX_CHARS characters (whole code points, re-trimmed);
 *   5. dropped when shorter than SEARCH_MIN_CHARS characters.
 */
export function normalizeSearchQuery(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null
  const text = raw
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  if (!text || text.includes('@')) return null
  if ((text.match(/\p{Nd}/gu) || []).length >= SEARCH_MAX_DIGITS) return null
  const chars = Array.from(text)
  const cut = (chars.length > SEARCH_MAX_CHARS ? chars.slice(0, SEARCH_MAX_CHARS).join('') : text).trim()
  return Array.from(cut).length >= SEARCH_MIN_CHARS ? cut : null
}

// ── Labels (admin panel) ──────────────────────────────────────────────────

export const GOAL_LABEL: Record<GoalName, string> = {
  cv_download: 'CV downloads',
  cv_print: 'CV printed',
  vcard_save: 'vCard saved',
  email_click: 'E-mail link clicks',
  outbound_click: 'Outbound link clicks',
  contact_sent: 'Contact form sent',
  read_through: 'Read to the end',
  search_empty: 'Searches with no results',
}

/** What exactly is counted, in one line (admin panel). */
export const GOAL_HINT: Record<GoalName, string> = {
  cv_download: '/cv.pdf, /cv.txt, /cv.json and the /cv/zh files, counted on the server',
  cv_print: 'print dialog opened on /cv or /cv/zh',
  vcard_save: '/api/vcard downloaded, counted on the server',
  email_click: 'a mailto: link clicked',
  outbound_click: 'a link to another site clicked',
  contact_sent: 'a message the server accepted',
  read_through: 'the end of a post or case study reached after scrolling and reading',
  search_empty: '⌘K searches that found nothing',
}

/** Name of a goal's property in the breakdown table. */
export const GOAL_PROP_LABEL: Record<GoalName, string> = {
  cv_download: 'File',
  cv_print: 'Language',
  vcard_save: '',
  email_click: 'Page',
  outbound_click: 'Site',
  contact_sent: 'Topic',
  read_through: 'Page',
  search_empty: 'Search',
}

const LANG_NAME: Record<string, string> = { en: 'English', zh: 'Chinese' }
const FORMAT_NAME: Record<string, string> = { pdf: 'PDF', txt: 'Plain text', json: 'JSON Resume' }
const TOPIC_NAME: Record<string, string> = {
  role: 'Role / hiring',
  freelance: 'Freelance project',
  collab: 'Collaboration',
  other: 'Other',
  '': 'Not given',
}

/** Human label of a stored property value. */
export function propLabel(name: GoalName, prop: string): string {
  if (name === 'cv_download') {
    const [lang, format] = prop.split('-')
    return `${LANG_NAME[lang] || lang} · ${FORMAT_NAME[format] || format}`
  }
  if (name === 'cv_print') return LANG_NAME[prop] || prop
  if (name === 'contact_sent') return TOPIC_NAME[prop] ?? prop
  return prop
}

/** The goals shown in the admin's Goals table, in order (search_empty has its own section). */
export const GOAL_TABLE_ORDER: readonly GoalName[] = [
  'cv_download',
  'cv_print',
  'vcard_save',
  'contact_sent',
  'email_click',
  'outbound_click',
  'read_through',
]

// ── Report shape (GET /api/admin/goals) ───────────────────────────────────

export type GoalPropRow = { key: string; events: number; visitors: number }

export type GoalRow = {
  name: GoalName
  /** Events in the period. */
  events: number
  /** Visitor-days: the sum over days of each day's unique visitors (the hash changes daily). */
  visitors: Kpi
  /** visitors / the site's visitor-days in the period; null when the site had none. */
  rate: number | null
  /** Top property values (at most 10), by visitor-days. */
  props: GoalPropRow[]
}

export type FunnelStep = { label: string; visitors: number }

export type GoalsFunnel = {
  /** Window actually used: the raw rows (35 days at most) overlapping the period. */
  from: string
  to: string
  days: number
  /** Referrer host of step 1, or null for every visitor. */
  source: string | null
  /** Referrer hosts to pick from (raw window), by visitor-days. */
  sources: Array<{ key: string; visitors: number }>
  steps: FunnelStep[]
  /** Visitor-days that downloaded a CV file without viewing any page that day (e.g. a direct link to /cv.pdf). */
  directDownloads: number
}

export type EmptySearchRow = { query: string; visitors: number; events: number; lastSeen: string }

export type GoalsReport = {
  range: string
  from: string
  to: string
  /** The site's visitor-days in the period (denominator of the conversion rates). */
  siteVisitors: number
  /** First UTC day with goal tracking (null on a store that predates it). */
  since: string | null
  /** Goal tracking had started by the beginning of the previous period: deltas are meaningful. */
  comparable: boolean
  goals: GoalRow[]
  funnel: GoalsFunnel
  searches: { from: string; to: string; days: number; rows: EmptySearchRow[] }
  generatedAt: number
}
