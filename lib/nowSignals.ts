/**
 * Live "Now" signals — composed only from data already in the system, so the
 * /now page stays truthful without being hand-edited:
 *
 *   - current / upcoming roles and studies from the public (website) CV,
 *     respecting visibility: an entry whose end date is hidden is never
 *     treated as current
 *   - the "currently coding" chip (home.hero.currentlyCoding merged with the
 *     CV-derived default, exactly like the home page)
 *   - the latest blog post and the latest case study
 *
 * Pure and dependency-light (no DB access) so it is unit-tested; the page's
 * getStaticProps feeds it the public data.
 */

import type { CvSectionLike } from './cvVisibility'
import { formatCvDate, majorAddsInfo, type CvNow } from './cvFormat'
import { deriveCurrentlyCoding, type CurrentlyCoding } from './currentlyCoding'
import { formatPostDate, isoDate } from './postDate'
import { SITE_TIME_ZONE } from './clock'
import { entryRange, entryStatus, field, graduation, joinParts, list } from '../components/CVViewerPage/fields'

export type NowRole = {
  kind: 'work' | 'study'
  status: 'current' | 'upcoming'
  title: string
  org: string
  location: string
  /** Human date line, e.g. "Sep 2026 – Expected Dec 2028" or "Starts Sep 2026". */
  when: string
}

export type NowLink = {
  title: string
  href: string
  description: string
  /** Display date ("May 30, 2026") or the case study's period ("2025 – 2026"); '' when unknown. */
  date: string
  /** Machine date for <time dateTime>; '' when the date is not a calendar date. */
  dateTime: string
}

export type NowSignals = {
  roles: NowRole[]
  coding: CurrentlyCoding | null
  post: NowLink | null
  work: NowLink | null
  /** YYYY-MM-DD the signals were composed (ISR regeneration day). */
  composed: string
}

const section = (cv: CvSectionLike[] | null | undefined, name: string) =>
  (Array.isArray(cv) ? cv : []).find((s) => s?.sessionName === name)

/**
 * Roles and studies that are running now or have a confirmed future start.
 * `now` is a Date or the page's 'YYYY-MM' reference month (lib/clock.ts).
 */
export function currentRoles(cv: CvSectionLike[] | null | undefined, now: CvNow = new Date()): NowRole[] {
  const out: NowRole[] = []

  for (const e of list(section(cv, 'workExperience'), 'experiences')) {
    const status = entryStatus(e, now)
    if (status !== 'current' && status !== 'upcoming') continue
    const title = field(e, 'jobTitle')
    const org = field(e, 'companyName')
    if (!title && !org) continue
    const start = formatCvDate(field(e, 'startDate'), 'en')
    out.push({
      kind: 'work',
      status,
      title: title || org,
      org: title ? org : '',
      location: field(e, 'location'),
      when: status === 'upcoming' ? (start ? `Starts ${start}` : '') : entryRange(e, 'en', { now }),
    })
  }

  for (const e of list(section(cv, 'education'), 'educationExperience')) {
    const status = entryStatus(e, now)
    if (status !== 'current' && status !== 'upcoming') continue
    const degree = field(e, 'degree')
    const major = majorAddsInfo(degree, field(e, 'major')) ? field(e, 'major') : ''
    const title = joinParts([degree, major], ', ')
    const org = field(e, 'schoolName')
    if (!title && !org) continue
    const start = formatCvDate(field(e, 'startDate'), 'en')
    out.push({
      kind: 'study',
      status,
      title: title || org,
      org: title ? org : '',
      location: field(e, 'schoolLocation'),
      when: status === 'upcoming' ? (start ? `Starts ${start}` : '') : joinParts([start, graduation(e, 'en', now)], ' – '),
    })
  }

  // Current before upcoming; otherwise the CV's own order (sort is stable).
  return out.sort((a, b) => (a.status === b.status ? 0 : a.status === 'current' ? -1 : 1))
}

/**
 * The "currently coding" chip as the home page shows it (owner's text wins
 * per line, the CV fills blanks) — with one honesty rule: a CV-derived
 * project line is only used when it names a role that is current right now.
 * (The derivation falls back to the most recent past job, which is fine as a
 * home-page default but would be a false claim on a page called "Now".)
 */
export function currentlyCodingSignal(
  cvWebsiteEn: CvSectionLike[] | null | undefined,
  manual: Partial<CurrentlyCoding> | null | undefined,
  roles: NowRole[],
): CurrentlyCoding | null {
  const auto = deriveCurrentlyCoding(cvWebsiteEn)
  const own = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const autoProject = auto.project.trim()
  const autoIsCurrent =
    !!autoProject && roles.some((r) => r.kind === 'work' && r.status === 'current' && (r.org || r.title) === autoProject)
  const project = own(manual?.project) || (autoIsCurrent ? autoProject : '')
  if (!project) return null
  return {
    label: own(manual?.label) || auto.label.trim(),
    project,
    note: own(manual?.note) || auto.note.trim(),
  }
}

type PostLike = { permalink: string; frontmatter: { title?: string; description?: string; date?: string } }
type WorkLike = { permalink: string; frontmatter: { title?: string; description?: string; period?: string } }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v instanceof Date ? v.toISOString() : '')

/** First (newest) post of a newest-first list. */
export function latestPost(posts: readonly PostLike[] | null | undefined): NowLink | null {
  const p = (posts || []).find((x) => str(x?.frontmatter?.title))
  if (!p) return null
  const raw = str(p.frontmatter.date)
  return {
    title: str(p.frontmatter.title),
    href: p.permalink,
    description: str(p.frontmatter.description),
    date: formatPostDate(raw),
    dateTime: isoDate(raw),
  }
}

/** First (most recently updated) case study of a list. */
export function latestWork(work: readonly WorkLike[] | null | undefined): NowLink | null {
  const w = (work || []).find((x) => str(x?.frontmatter?.title))
  if (!w) return null
  return {
    title: str(w.frontmatter.title),
    href: w.permalink,
    description: str(w.frontmatter.description),
    date: str(w.frontmatter.period),
    dateTime: '',
  }
}

/** True when there is at least one signal worth showing. */
export function hasSignals(s: Pick<NowSignals, 'roles' | 'coding' | 'post' | 'work'>): boolean {
  return s.roles.length > 0 || !!s.coding || !!s.post || !!s.work
}

/**
 * Day (YYYY-MM-DD, in the site's time zone) of the most recent change among
 * the sources a /now page was composed from — content-store `updated_at`
 * stamps in epoch ms; missing or invalid stamps are ignored. '' when none.
 * The page formats it once on the server, so every render shows the same text.
 */
export function signalsUpdatedOn(stamps: ReadonlyArray<number | null | undefined>, timeZone: string = SITE_TIME_ZONE): string {
  const latest = stamps.reduce<number>((max, t) => (typeof t === 'number' && Number.isFinite(t) && t > max ? t : max), 0)
  if (!latest) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(latest))
  const get = (type: string) => parts.find((p) => p.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
