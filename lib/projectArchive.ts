import { isFuture, isPresent, parseCvDate, safeHref, type CvNow } from './cvFormat'
import { bullets, field, list } from '../components/CVViewerPage/fields'
import { matchCaseStudy } from '../components/LandingPage/projectMatch'

/**
 * The /work archive (E8): every project of the public (website) CV, newest
 * first, below the case studies. Pure; computed in getStaticProps from
 * readPublicCvSections('website', ['project']) — hidden projects and hidden
 * fields are already gone, and field() treats a redacted value as empty.
 *
 * A row: years, title, the CV summary, role, stack and links. When a case
 * study is about the project (the CV entry's `caseStudy` slug, else a strict
 * title match — components/LandingPage/projectMatch) the row links to it and
 * borrows what the CV entry leaves empty: role, stack, site and repository.
 * Optional CV fields read when present: `role`, `relatedSkills` (stack),
 * `url`, `repo`.
 */

export type ArchiveLink = { kind: 'site' | 'repo'; url: string }

export type ArchiveRow = {
  key: string
  title: string
  /** "2024 – 2026", "2023", "2025 – now"; '' without dates. */
  years: string
  /** Machine-readable start / end years for <time> ('' when unknown). */
  startYear: string
  endYear: string
  summary: string
  role: string
  stack: string[]
  links: ArchiveLink[]
  caseStudy: { slug: string; title: string; permalink: string } | null
}

export type ArchiveWork = {
  slug: string
  title: string
  permalink: string
  role?: string
  tech?: string[]
  link?: string
  repo?: string
  status?: string
  period?: string
  description?: string
}

const STACK_MAX = 6

type Ym = { y: number; m: number | null }

function ymIndex(d: Ym | null): number {
  return d ? d.y * 12 + ((d.m ?? 12) - 1) : -Infinity
}

/** Years of a CV range: "2024 – 2026", one year once, an open or future end as "now". */
export function archiveYears(start: unknown, end: unknown, now: CvNow = new Date()): { years: string; startYear: string; endYear: string } {
  const s = parseCvDate(start)
  const ongoing = isPresent(end) || (typeof end === 'string' && !!end.trim() && isFuture(end, now))
  const e = ongoing ? null : parseCvDate(end)
  const sy = s ? String(s.y) : ''
  const ey = e ? String(e.y) : ''
  if (ongoing) return { years: sy ? `${sy} – now` : 'now', startYear: sy, endYear: '' }
  if (sy && ey) return { years: sy === ey ? sy : `${sy} – ${ey}`, startYear: sy, endYear: ey }
  return { years: sy || ey, startYear: sy, endYear: ey }
}

function uniq(items: string[], max: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const t = raw.trim()
    const k = t.toLowerCase()
    if (!t || seen.has(k)) continue
    seen.add(k)
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

/** Rows for every project of the website CV's `project` section(s), newest activity first. */
export function archiveRows(sections: readonly unknown[] | null | undefined, works: readonly ArchiveWork[], now: CvNow = new Date()): ArchiveRow[] {
  const items: Array<{ row: ArchiveRow; end: number; start: number; order: number }> = []
  let order = 0
  for (const section of sections || []) {
    if (!section || typeof section !== 'object' || (section as { sessionName?: unknown }).sessionName !== 'project') continue
    for (const item of list(section, 'projectExperience')) {
      const title = field(item, 'title')
      if (!title) continue
      const startRaw = field(item, 'startDate')
      const endRaw = field(item, 'endDate')
      const { years, startYear, endYear } = archiveYears(startRaw, endRaw, now)
      const work = matchCaseStudy({ title, caseStudy: field(item, 'caseStudy') }, works)
      const cvStack = bullets(item, 'relatedSkills')
      const site = safeHref(field(item, 'url')) || safeHref(work?.link)
      const repo = safeHref(field(item, 'repo')) || safeHref(work?.repo)
      const links: ArchiveLink[] = []
      if (/^https?:\/\//i.test(site)) links.push({ kind: 'site', url: site })
      if (/^https?:\/\//i.test(repo) && repo !== site) links.push({ kind: 'repo', url: repo })
      const ongoing = isPresent(endRaw) || (!!endRaw && isFuture(endRaw, now))
      items.push({
        row: {
          key: `${order}-${title}`,
          title,
          years,
          startYear,
          endYear,
          summary: field(item, 'description'),
          role: field(item, 'role') || (work?.role || '').trim(),
          stack: uniq(cvStack.length ? cvStack : work?.tech || [], STACK_MAX),
          links,
          caseStudy: work ? { slug: work.slug, title: work.title, permalink: work.permalink } : null,
        },
        end: ongoing ? Infinity : ymIndex(parseCvDate(endRaw) || parseCvDate(startRaw)),
        start: ymIndex(parseCvDate(startRaw)),
        order: order++,
      })
    }
  }
  return items.sort((a, b) => b.end - a.end || b.start - a.start || a.order - b.order).map((x) => x.row)
}
