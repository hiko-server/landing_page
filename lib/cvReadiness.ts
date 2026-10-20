/**
 * Recruiter-readiness checks for the CV (E9) — deterministic, pure and
 * client-safe (the CV Studio panel and the admin status hub run the same
 * code; unit-tested). Nothing is rewritten: every finding names a place in
 * the editor (`path`, the Studio's data-cvpath) and says what to look at.
 *
 * Checks judge what a recruiter gets — the A4 CV / PDF view: sections off
 * the CV, hidden entries, hidden fields and hidden bullets are skipped
 * (except where hiding itself is the point, e.g. a hidden project whose case
 * study is public). Publications are judged wherever they are public — the
 * CV or the /publications page — and only papers that render (a title and
 * a real status, lib/publications).
 *
 *   high    date-order        an end date before its start date
 *           date-mismatch     EN and 中文 disagree on a date of the same entry
 *           email-mismatch    the CV's e-mail differs between EN / 中文 or from
 *                             the home page's
 *           stale-expected    "expected 2025", "预计 2025年6月", "in progress" … after the date
 *           stale-tense       future tense ("Will …", "将…") in a role that has ended
 *           case-study-missing a project links to a case study that is not published
 *   medium  summary-missing   no visible summary at the top
 *           missing-date      an entry without its start / end (or award / certificate) date
 *           thin-entry        a role or project with neither summary nor highlights
 *           weak-opening      a highlight that opens with "Participated in", "Responsible
 *                             for", "参与", "负责" … (with or without a result)
 *           low-quantified    under a third of the highlights state a measurable result
 *           too-long          the A4 preview runs past two pages
 *           paper-incomplete  a published paper without its venue, its date, or any
 *                             way to find it (DOI, paper page or PDF)
 *           stale-review      a paper still "under review" more than 18 months after
 *                             its date
 *   low     missing-link      no website; a credential ID without its URL; a project
 *                             that matches a published case study but does not link it
 *           case-study-unlisted a published case study no CV project points to
 *           hidden-referenced a project hidden on the CV while its case study is public
 *           visibility-mismatch an entry shown in one language and hidden in the other
 *           no-permission     a recommendation without the person's permission (never shown)
 *
 * Dismissals: a finding's `id` is a fingerprint of its check, language and
 * content (never of positions), stored in the `readinessDismissed` list of
 * the section it belongs to (lib/cvVisibility EDITOR_META_KEYS — stripped
 * from every public view, ignored by the validator). Editing the content
 * changes the fingerprint, so a dismissed finding comes back only if the
 * problem is new.
 */

import type { CvLang, CvPath } from './cvVisibility'
import { hiddenIndices, isEntryHidden, isFieldHidden, isSectionOnCv, isSectionOnWebsite } from './cvVisibility'
import { normalizeDoi } from './publications/doi'
import { PUB_DATE_RE, publicationHref } from './publications/normalize'
import { PAPERS_KEY, PUBLICATIONS_SECTION, isPublicationStatus } from './publications/types'
import { isPresent, parseCvDate } from './cvFormat'
import { monthIndex } from './clock'
import { SECTION_BY_NAME } from './cvSections'
import { caseStudySlug, matchCaseStudy, type WorkIndexItem } from '../components/LandingPage/projectMatch'

export type ReadinessSeverity = 'high' | 'medium' | 'low'

export type ReadinessCheck =
  | 'date-order'
  | 'date-mismatch'
  | 'email-mismatch'
  | 'stale-expected'
  | 'stale-tense'
  | 'case-study-missing'
  | 'summary-missing'
  | 'missing-date'
  | 'thin-entry'
  | 'weak-opening'
  | 'low-quantified'
  | 'too-long'
  | 'paper-incomplete'
  | 'stale-review'
  | 'missing-link'
  | 'case-study-unlisted'
  | 'hidden-referenced'
  | 'visibility-mismatch'
  | 'no-permission'

export const CHECK_SEVERITY: Record<ReadinessCheck, ReadinessSeverity> = {
  'date-order': 'high',
  'date-mismatch': 'high',
  'email-mismatch': 'high',
  'stale-expected': 'high',
  'stale-tense': 'high',
  'case-study-missing': 'high',
  'summary-missing': 'medium',
  'missing-date': 'medium',
  'thin-entry': 'medium',
  'weak-opening': 'medium',
  'low-quantified': 'medium',
  'too-long': 'medium',
  'paper-incomplete': 'medium',
  'stale-review': 'medium',
  'missing-link': 'low',
  'case-study-unlisted': 'low',
  'hidden-referenced': 'low',
  'visibility-mismatch': 'low',
  'no-permission': 'low',
}

export const CHECK_LABEL: Record<ReadinessCheck, string> = {
  'date-order': 'Dates out of order',
  'date-mismatch': 'EN / 中文 dates differ',
  'email-mismatch': 'E-mail differs',
  'stale-expected': 'Out-of-date “expected”',
  'stale-tense': 'Future tense after the fact',
  'case-study-missing': 'Case study not published',
  'summary-missing': 'No visible summary',
  'missing-date': 'Missing date',
  'thin-entry': 'Nothing to read',
  'weak-opening': 'Weak opening',
  'low-quantified': 'Few measurable results',
  'too-long': 'Longer than two pages',
  'paper-incomplete': 'Published paper incomplete',
  'stale-review': 'Under review for long',
  'missing-link': 'Missing link',
  'case-study-unlisted': 'Case study not on the CV',
  'hidden-referenced': 'Hidden, but its case study is public',
  'visibility-mismatch': 'Shown in one language only',
  'no-permission': 'No permission to publish',
}

export type ReadinessFinding = {
  /** Stable fingerprint (check, language, content) — the dismissal key. */
  id: string
  check: ReadinessCheck
  severity: ReadinessSeverity
  lang: CvLang
  /** The section the finding belongs to (where its dismissal is stored). */
  sectionIdx: number
  sectionName: string
  /** Editor path to jump to ([sectionIdx, key, index, …]); null = nothing to focus (e.g. page count). */
  path: CvPath | null
  /** Human trail: ["Experience", "Engineering Intern", "Highlight 1"]. */
  crumbs: string[]
  /** One line: what is wrong. */
  title: string
  /** What to do about it. */
  detail: string
}

export type ReadinessCaseStudy = { slug: string; title: string; draft?: boolean }

export type ReadinessContext = {
  /** Reference month 'YYYY-MM' (lib/clock referenceMonth). */
  now: string
  /** The home page's public e-mail (home.hero.email), if any. */
  homeEmail?: string
  /** Every case study, drafts included (drafts count as not published). */
  caseStudies?: readonly ReadinessCaseStudy[]
  /** Measured A4 page counts per language (the Studio preview); unknown = not checked. */
  pages?: Partial<Record<CvLang, number>>
}

export type CvDocLike = { en?: unknown; zh?: unknown }

type Node = Record<string, any>

const LANGS: CvLang[] = ['en', 'zh']
const LANG_NAME: Record<CvLang, string> = { en: 'EN', zh: '中文' }
export const MAX_PAGES = 2
/** A paper "under review" for longer than this (months after its date) is flagged. */
export const REVIEW_STALE_MONTHS = 18
const QUANTIFIED_MIN_BULLETS = 4
const QUANTIFIED_MIN_RATIO = 1 / 3

const isObj = (v: unknown): v is Node => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** FNV-1a (32-bit) as 8 hex chars — short, stable fingerprints. */
export function fingerprint(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function shorten(s: string, n = 60): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

// ── Text heuristics ─────────────────────────────────────────────────────

/**
 * Openings that describe presence or learning instead of an action and its
 * result. Group 1 is the phrase shown to the owner; a group 2 (the noun that
 * makes "gained …" weak) is appended as "… experience".
 */
const WEAK_EN: RegExp[] = [
  /^((?:participated|participating|participate) in)\b/i,
  /^((?:was |were )?responsible for)\b/i,
  /^((?:was |were )?(?:involved|engaged) in)\b/i,
  /^(helped|helping|assisted|assisting|supported|supporting)\b/i,
  /^(worked (?:on|with|in))\b/i,
  /^(tasked with|duties included|in charge of)\b/i,
  /^(gained|learned|learnt|acquired)\b.{0,48}?\b(experience|exposure|knowledge|skills?|insights?|understanding|proficiency|familiarity)\b/i,
  /^((?:strengthened|improved|developed|built|deepened|enhanced) (?:my |our )?(?:proficiency|skills?|knowledge|understanding|familiarity))\b/i,
  /^(exposure to)\b/i,
]

const WEAK_ZH: RegExp[] = [
  /^(参与|参加)/,
  /^(负责)/,
  /^(协助|辅助|帮助|配合|支持)/,
  /^(学习|了解|熟悉|接触)/,
  /^(获得|积累|增强|提升)了?.{0,24}?(经验|能力|知识|理解|认识)/,
]

/** The weak phrase a bullet opens with, or '' (EN and 中文 lists). */
export function weakOpening(text: string): string {
  const t = text.replace(/^[\s\-–—•·*]+/, '').trim()
  for (const re of [...WEAK_EN, ...WEAK_ZH]) {
    const m = re.exec(t)
    if (!m) continue
    const lead = m[1].replace(/\s+/g, ' ')
    return shorten(m[2] ? `${lead} … ${m[2]}` : lead, 40)
  }
  return ''
}

/**
 * True when a highlight states a measurable result: a percentage, an amount
 * of money, a multiple, a rank ("top 5%", "1st", "第1名", "前5%"), or a number
 * with a unit of scale (users, ms, hours, 万, 人, 倍, …). Version numbers
 * ("Next.js 13", "Bluetooth 5.2") do not count.
 */
export function hasMetric(text: string): boolean {
  const t = text.replace(/\s+/g, ' ')
  const patterns: RegExp[] = [
    /\d+(?:[.,]\d+)?\s?%/,
    /(?:HK\$|US\$|S\$|A\$|\$|€|£|¥|￥|RMB|HKD|USD|CNY|EUR|GBP)\s?\d/i,
    /\d(?:[\d,.]*)\s?(?:k|m|bn|million|billion|thousand)\b/i,
    /\b\d+(?:\.\d+)?\s?(?:x|×)\b|\b(?:doubled|tripled|quadrupled|halved)\b/i,
    /\b(?:top|ranked|rank)\s?#?\d+/i,
    /#\d+\b/,
    /\b\d+(?:st|nd|rd|th)\b/i,
    /\b\d[\d,]*\+?\s?(?:users?|customers?|clients?|visitors?|downloads?|installs?|requests?|transactions?|orders?|students?|people|members?|engineers?|developers?|teams?|countries|cities|schools?|partners?|patents?|papers?|publications?|awards?|projects?|repos(?:itories)?|stars?|services?|devices?|units?|sites?|pages?|languages?|markets?)\b/i,
    /\b\d+(?:\.\d+)?\s?(?:ms|milliseconds?|seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|GB|MB|TB|kb|qps|rps|fps)\b/i,
    /\d+(?:\.\d+)?\s?(?:倍|万|千|百|亿|人|名|位|项|个|次|家|所|篇|件|台|套|小时|天|周|个月|年|毫秒|秒|分钟)/,
    /(?:前|第)\s?\d+/,
  ]
  return patterns.some((re) => re.test(t))
}

const EXPECTED_EN = /\b(?:expected|exp\.|anticipated|graduating|graduation|to graduate|est\.)\b[^0-9\n]{0,14}((?:19|20)\d{2})(?:[-./ ](0?[1-9]|1[0-2])\b)?/i
const EXPECTED_ZH = /(?:预计|预期|将于|计划于)[^0-9\n]{0,6}((?:19|20)\d{2})(?:[年.\-/](0?[1-9]|1[0-2]))?/
const IN_PROGRESS = /\b(?:candidate|in progress|ongoing|pursuing|currently studying)\b|在读|攻读中|就读中/i
const FUTURE_EN = /^(?:will|shall|going to|plan(?:ning)? to|aim(?:ing)? to)\b/i
const FUTURE_ZH = /^(?:将|即将|计划|预计|准备)/

/** The stale "expected <date>" phrase in a text, judged against `now` ('YYYY-MM'), or ''. */
export function staleExpected(text: string, now: string): string {
  const nowIdx = monthIndex(now)
  if (!Number.isFinite(nowIdx)) return ''
  for (const re of [EXPECTED_EN, EXPECTED_ZH]) {
    const m = re.exec(text)
    if (!m) continue
    const y = Number(m[1])
    const mo = m[2] ? Number(m[2]) : 12
    if (y * 12 + (mo - 1) < nowIdx) return shorten(m[0], 40)
  }
  return ''
}

/** Month index of a stored CV date ('YYYY', 'YYYY-MM', 'YYYY-MM-DD'), NaN when unusable. */
function dateIdx(v: unknown, end = false): number {
  const d = parseCvDate(v)
  if (!d) return Number.NaN
  return d.y * 12 + ((d.m ?? (end ? 12 : 1)) - 1)
}

const ym = (v: unknown) => {
  const d = parseCvDate(v)
  return d ? (d.m ? `${d.y}-${String(d.m).padStart(2, '0')}` : String(d.y)) : ''
}

// ── Walk helpers ────────────────────────────────────────────────────────

/** Visible object entries of node[key] with their positions (hidden list / entries / indices skipped). */
function visibleEntries(node: Node, key: string): Array<{ item: Node; index: number }> {
  if (isFieldHidden(node, key)) return []
  const list = Array.isArray(node[key]) ? node[key] : []
  const skip = new Set(hiddenIndices(node, key))
  return list
    .map((item: unknown, index: number) => ({ item, index }))
    .filter((e: { item: unknown; index: number }) => isObj(e.item) && !isEntryHidden(e.item) && !skip.has(e.index)) as Array<{
    item: Node
    index: number
  }>
}

/** Visible, non-blank string bullets of node[key] with their positions. */
function visibleBullets(node: Node, key: string): Array<{ text: string; index: number }> {
  if (isFieldHidden(node, key)) return []
  const list = Array.isArray(node[key]) ? node[key] : []
  const skip = new Set(hiddenIndices(node, key))
  return list
    .map((text: unknown, index: number) => ({ text: str(text), index }))
    .filter((b: { text: string; index: number }) => b.text && !skip.has(b.index))
}

/** A visible field's trimmed value ('' when hidden or not text). */
const shown = (node: Node, key: string) => (isFieldHidden(node, key) ? '' : str(node[key]))

type ListSpec = {
  section: string
  list: string
  title: (e: Node) => string
  start?: string
  end?: string
  date?: string
  bullets?: boolean
}

const DATED_LISTS: ListSpec[] = [
  { section: 'education', list: 'educationExperience', title: (e) => str(e.schoolName) || str(e.degree), start: 'startDate', end: 'endDate' },
  { section: 'workExperience', list: 'experiences', title: (e) => str(e.jobTitle) || str(e.companyName), start: 'startDate', end: 'endDate', bullets: true },
  { section: 'project', list: 'projectExperience', title: (e) => str(e.title), start: 'startDate', end: 'endDate', bullets: true },
  { section: 'competitionAwards', list: 'awards', title: (e) => str(e.contestName) || str(e.award), date: 'date' },
  { section: 'patents', list: 'patentExperience', title: (e) => str(e.title), date: 'date' },
]

const sectionLabel = (name: string) => SECTION_BY_NAME[name]?.label || name

// ── Runner ──────────────────────────────────────────────────────────────

/** Every finding for the document, high severity first, dismissed ones included (see isDismissed). */
export function runReadinessChecks(doc: CvDocLike, ctx: ReadinessContext): ReadinessFinding[] {
  const out: ReadinessFinding[] = []
  const sections: Record<CvLang, Node[]> = {
    en: Array.isArray(doc?.en) ? (doc.en as unknown[]).filter(isObj) : [],
    zh: Array.isArray(doc?.zh) ? (doc.zh as unknown[]).filter(isObj) : [],
  }
  const nowIdx = monthIndex(ctx.now)
  const published = (ctx.caseStudies || []).filter((w) => w && w.slug && !w.draft)
  const publishedWork: WorkIndexItem[] = published.map((w) => ({ slug: w.slug, title: w.title || w.slug }))

  const add = (
    check: ReadinessCheck,
    lang: CvLang,
    sectionIdx: number,
    path: CvPath | null,
    crumbs: string[],
    title: string,
    detail: string,
    signal: string,
  ) => {
    const sectionName = String(sections[lang][sectionIdx]?.sessionName || '')
    out.push({
      id: `${check}:${lang}:${fingerprint(signal)}`,
      check,
      severity: CHECK_SEVERITY[check],
      lang,
      sectionIdx,
      sectionName,
      path,
      crumbs: [sectionLabel(sectionName), ...crumbs],
      title,
      detail,
    })
  }

  /**
   * Papers that render (a title and a real status): a published one needs
   * where it appeared, when, and a way to find it; one under review should
   * not stay so for more than REVIEW_STALE_MONTHS. A field the owner hid is
   * a decision, not a gap, and is not reported.
   */
  const checkPapers = (section: Node, si: number, lang: CvLang) => {
    for (const { item, index } of visibleEntries(section, PAPERS_KEY)) {
      const status = isFieldHidden(item, 'status') ? '' : str(item.status)
      const name = shown(item, 'title')
      if (!name || !isPublicationStatus(status)) continue
      const title = shorten(name, 48)
      const base: CvPath = [si, PAPERS_KEY, index]
      const date = shown(item, 'date')
      const dated = PUB_DATE_RE.test(date)
      if (status === 'published') {
        if (!shown(item, 'venue') && !isFieldHidden(item, 'venue')) {
          add('paper-incomplete', lang, si, [...base, 'venue'], [title], `“${title}” is published but names no venue`, 'A paper is cited by where it appeared: add the journal, the proceedings or the repository.', `paper:${name}:venue`)
        }
        if (!dated && !isFieldHidden(item, 'date')) {
          add('paper-incomplete', lang, si, [...base, 'date'], [title], `“${title}” is published but has no date`, 'Add the year (and month) it was published: citations and the order of your list depend on it.', `paper:${name}:date`)
        }
        const findable = normalizeDoi(shown(item, 'doi')) || publicationHref(shown(item, 'url')) || publicationHref(shown(item, 'pdfUrl'))
        if (!findable && !isFieldHidden(item, 'doi')) {
          add('paper-incomplete', lang, si, [...base, 'doi'], [title], `“${title}” has no DOI or link`, 'Add its DOI (or a link to the paper or its PDF) so a reader can open and verify it in one click.', `paper:${name}:link`)
        }
      }
      if (status === 'under-review' && dated) {
        const months = nowIdx - dateIdx(date, true)
        if (months > REVIEW_STALE_MONTHS) {
          add('stale-review', lang, si, [...base, 'status'], [title], `“${title}” has been under review since ${date}`, `That is ${months} months — longer than most reviews take. Set the status to where the paper stands now (accepted, in press, published, a preprint), or hide it if it was withdrawn.`, `paper:${name}:review:${date}`)
        }
      }
    }
  }

  for (const lang of LANGS) {
    const list = sections[lang]
    if (!list.length) continue
    const L = LANG_NAME[lang]
    let highlightTotal = 0
    let highlightQuantified = 0
    let firstUnquantified: { idx: number; path: CvPath; crumbs: string[] } | null = null
    const linkedSlugs = new Set<string>()

    list.forEach((section, si) => {
      const name = String(section.sessionName || '')
      if (name === PUBLICATIONS_SECTION) {
        if (isSectionOnCv(section) || isSectionOnWebsite(section)) checkPapers(section, si, lang)
        return
      }
      if (!isSectionOnCv(section)) return

      if (name === 'personalInformation') {
        if (!shown(section, 'introduction')) {
          add(
            'summary-missing',
            lang,
            si,
            [si, 'introduction'],
            ['Summary'],
            isFieldHidden(section, 'introduction') ? `The ${L} summary is hidden` : `The ${L} CV has no summary`,
            'Recruiters read the top first: two or three lines on what you do, for whom and with what result help them place you.',
            `${lang}:summary`,
          )
        }
        if (!shown(section, 'personalWebsite') && !isFieldHidden(section, 'personalWebsite')) {
          add('missing-link', lang, si, [si, 'personalWebsite'], ['Website'], 'No website or portfolio link', 'Add the site’s address so a printed CV leads back to your work.', `${lang}:website`)
        }
        return
      }

      const spec = DATED_LISTS.find((d) => d.section === name)
      if (spec) {
        for (const { item, index } of visibleEntries(section, spec.list)) {
          const title = shorten(spec.title(item) || `${SECTION_BY_NAME[name]?.lists?.[0]?.itemNoun || 'entry'} ${index + 1}`, 48)
          const base: CvPath = [si, spec.list, index]
          const dateFields = spec.date ? [spec.date] : [spec.start!, spec.end!]
          for (const f of dateFields) {
            if (isFieldHidden(item, f)) continue
            if (!str(item[f])) {
              const what = f === spec.start ? 'start date' : f === spec.end ? 'end date' : 'date'
              add('missing-date', lang, si, [...base, f], [title], `“${title}” has no ${what}`, 'Recruiters scan dates first to follow your timeline; an entry without one reads as incomplete.', `${name}:${title}:${f}`)
            }
          }
          if (spec.start && spec.end) {
            const s = shown(item, spec.start)
            const e = shown(item, spec.end)
            if (s && e && !isPresent(e)) {
              const si0 = dateIdx(s)
              const ei0 = dateIdx(e, true)
              if (Number.isFinite(si0) && Number.isFinite(ei0) && si0 > ei0) {
                add('date-order', lang, si, [...base, spec.end], [title], `“${title}” ends before it starts`, `Start ${ym(s)}, end ${ym(e)}: one of the two is wrong.`, `${name}:${title}:${s}:${e}`)
              }
            }
            // Education still "in progress" after it ended.
            if (name === 'education' && e && !isPresent(e)) {
              const ended = dateIdx(e, true) < nowIdx
              const words = [shown(item, 'degree'), shown(item, 'major')].join(' ')
              if (ended && IN_PROGRESS.test(words)) {
                add('stale-expected', lang, si, [...base, 'degree'], [title], `“${title}” still reads as in progress`, `It ended ${ym(e)}, but the degree says “${shorten(words, 40)}”. Name the degree you hold.`, `${name}:${title}:${words}`)
              }
            }
          }

          // Text of the entry: summary + highlights (+ sub-points), and plain bullet lists.
          const texts: Array<{ text: string; path: CvPath; label: string; highlight: boolean }> = []
          for (const key of ['jobDescription', 'description', 'degree', 'award']) {
            const v = shown(item, key)
            if (v && typeof item[key] === 'string') texts.push({ text: v, path: [...base, key], label: 'Summary', highlight: false })
          }
          const features = visibleEntries(item, 'features')
          for (const { item: f, index: fi } of features) {
            const d = shown(f, 'description')
            if (d) texts.push({ text: d, path: [...base, 'features', fi, 'description'], label: `Highlight ${fi + 1}`, highlight: true })
            for (const b of visibleBullets(f, 'furtherExplanation')) {
              texts.push({ text: b.text, path: [...base, 'features', fi, 'furtherExplanation', b.index], label: `Highlight ${fi + 1} › point ${b.index + 1}`, highlight: false })
            }
          }
          if (Array.isArray(item.description)) {
            for (const b of visibleBullets(item, 'description')) texts.push({ text: b.text, path: [...base, 'description', b.index], label: `Point ${b.index + 1}`, highlight: false })
          }

          const endIdx = spec.end ? dateIdx(shown(item, spec.end), true) : Number.NaN
          const ended = spec.end && !isPresent(shown(item, spec.end)) && Number.isFinite(endIdx) && endIdx < nowIdx

          if (spec.bullets) {
            const hasSummary = !!(shown(item, 'jobDescription') || (typeof item.description === 'string' && shown(item, 'description')))
            if (!hasSummary && !features.some(({ item: f }) => shown(f, 'description'))) {
              add('thin-entry', lang, si, base, [title], `“${title}” has no summary or highlights`, 'Add a line on what you did and what came of it, or hide the entry if it does not support the roles you want.', `${name}:${title}:thin`)
            }
          }

          for (const t of texts) {
            // Summaries, highlights and their points of roles and projects.
            const weak = spec.bullets ? weakOpening(t.text) : ''
            if (weak) {
              const metric = hasMetric(t.text)
              add(
                'weak-opening',
                lang,
                si,
                t.path,
                [title, t.label],
                `Opens with “${weak}”${metric ? '' : ' and states no result'}`,
                lang === 'zh'
                  ? '以动作和结果开头：做了什么、用什么方法、带来了什么可衡量的结果。'
                  : 'Lead with what you did and what changed: an action verb, how, and a measurable result.',
                `${name}:${t.text}`,
              )
            }
            const stale = staleExpected(t.text, ctx.now)
            if (stale) {
              add('stale-expected', lang, si, t.path, [title, t.label], `“${stale}” is in the past`, 'The date has passed — say what happened instead.', `${name}:${t.text}:expected`)
            }
            if (ended && (FUTURE_EN.test(t.text) || FUTURE_ZH.test(t.text))) {
              add('stale-tense', lang, si, t.path, [title, t.label], `Future tense in a finished ${name === 'project' ? 'project' : 'role'}`, `It ended ${ym(shown(item, spec.end!))}; describe what you did, in the past tense.`, `${name}:${t.text}:tense`)
            }
            if (t.highlight) {
              highlightTotal++
              if (hasMetric(t.text)) highlightQuantified++
              else if (!firstUnquantified) firstUnquantified = { idx: si, path: t.path, crumbs: [title, t.label] }
            }
          }

          if (name === 'project') {
            const chosen = caseStudySlug(item.caseStudy)
            if (chosen) {
              const known = (ctx.caseStudies || []).find((w) => w.slug === chosen)
              if (!known || known.draft) {
                add('case-study-missing', lang, si, [...base, 'caseStudy'], [title], `“${title}” links to /work/${chosen}, which is ${known ? 'a draft' : 'not there'}`, 'Publish the case study, or clear the link so the CV and home page do not point to a missing page.', `${title}:${chosen}:${known ? 'draft' : 'missing'}`)
              }
            }
            const match = matchCaseStudy(item, publishedWork)
            if (match) {
              linkedSlugs.add(match.slug)
              if (!chosen) {
                add('missing-link', lang, si, [...base, 'caseStudy'], [title], `“${title}” matches the case study “${shorten(match.title, 40)}”`, `Set its case study slug to “${match.slug}” so the CV, /about and the home page link the write-up.`, `${title}:${match.slug}:match`)
              }
            }
          }
        }

        if (name === 'project') {
          // Hidden projects whose case study is public.
          const all: unknown[] = Array.isArray(section.projectExperience) ? section.projectExperience : []
          all.forEach((p, index) => {
            if (!isObj(p) || !isEntryHidden(p)) return
            const match = matchCaseStudy(p, publishedWork)
            if (!match) return
            linkedSlugs.add(match.slug)
            const title = shorten(str(p.title) || `project ${index + 1}`, 48)
            add('hidden-referenced', lang, si, [si, 'projectExperience', index], [title], `“${title}” is hidden on the CV, but /work/${match.slug} is published`, 'Someone who reads the case study will not find the project on your CV. Show it, or unpublish the case study if it no longer represents you.', `${title}:${match.slug}:hidden`)
          })
        }
        return
      }

      if (name === 'certification') {
        for (const { item: org, index: oi } of visibleEntries(section, 'certifications')) {
          for (const { item: cert, index: ci } of visibleEntries(org, 'CertificationList')) {
            const title = shorten(str(cert.certificationName) || `certificate ${ci + 1}`, 48)
            const base: CvPath = [si, 'certifications', oi, 'CertificationList', ci]
            if (!isFieldHidden(cert, 'issuedDate') && !str(cert.issuedDate)) {
              add('missing-date', lang, si, [...base, 'issuedDate'], [title], `“${title}” has no issue date`, 'A date shows how current the certificate is.', `cert:${title}:issued`)
            }
            if (shown(cert, 'credentialID') && !shown(cert, 'credentialURL') && !isFieldHidden(cert, 'credentialURL')) {
              add('missing-link', lang, si, [...base, 'credentialURL'], [title], `“${title}” has a credential ID but no link`, 'A verification link lets a recruiter confirm it in one click.', `cert:${title}:url`)
            }
          }
        }
        return
      }

      if (name === 'recommendations') {
        const items: unknown[] = Array.isArray(section.items) ? section.items : []
        items.forEach((r, index) => {
          if (!isObj(r) || isEntryHidden(r) || r.permission === true) return
          const who = shorten(str(r.name) || `recommendation ${index + 1}`, 40)
          add('no-permission', lang, si, [si, 'items', index, 'permission'], [who], `The recommendation from ${who} is not shown`, 'It appears only once you confirm the person agreed to have it published.', `rec:${who}:${str(r.quote)}`)
        })
      }
    })

    if (highlightTotal >= QUANTIFIED_MIN_BULLETS && highlightQuantified / highlightTotal < QUANTIFIED_MIN_RATIO && firstUnquantified) {
      const f = firstUnquantified as { idx: number; path: CvPath; crumbs: string[] }
      add(
        'low-quantified',
        lang,
        f.idx,
        f.path,
        f.crumbs,
        `${highlightQuantified} of ${highlightTotal} ${L} highlights state a measurable result`,
        'Numbers make impact concrete: %, time saved, money, users, rank or scale. Start with the highlights that already have one in the role.',
        `${lang}:quantified`,
      )
    }

    const pages = ctx.pages?.[lang]
    if (typeof pages === 'number' && pages > MAX_PAGES) {
      add('too-long', lang, 0, null, [], `The ${L} CV runs to ${pages} pages`, `Most recruiters expect one or two pages. Hide older or less relevant entries for the CV (they can stay on the website).`, `${lang}:pages:${pages}`)
    }

    // Published case studies no visible CV project points to.
    const projectIdx = list.findIndex((s) => s.sessionName === 'project')
    for (const w of published) {
      if (linkedSlugs.has(w.slug)) continue
      const visibleMatch = projectIdx >= 0 && isSectionOnCv(list[projectIdx])
        ? visibleEntries(list[projectIdx], 'projectExperience').some(({ item }) => matchCaseStudy(item, [{ slug: w.slug, title: w.title }]))
        : false
      if (visibleMatch) continue
      add(
        'case-study-unlisted',
        lang,
        projectIdx >= 0 ? projectIdx : 0,
        projectIdx >= 0 ? [projectIdx, 'projectExperience'] : null,
        [],
        `The case study “${shorten(w.title || w.slug, 48)}” is not on the ${L} CV`,
        `A published write-up is strong evidence: set “${w.slug}” as the case study slug of the project it belongs to, or add that project.`,
        `${lang}:${w.slug}:unlisted`,
      )
    }
  }

  // ── Across languages ───────────────────────────────────────────────────
  const piOf = (lang: CvLang) => sections[lang].findIndex((s) => s.sessionName === 'personalInformation' && isSectionOnCv(s))
  const emails = LANGS.map((lang) => {
    const i = piOf(lang)
    return { lang, i, email: i >= 0 ? shown(sections[lang][i], 'email').toLowerCase() : '' }
  })
  const [enMail, zhMail] = emails
  if (enMail.email && zhMail.email && enMail.email !== zhMail.email) {
    add('email-mismatch', 'zh', zhMail.i, [zhMail.i, 'email'], ['E-mail'], 'EN and 中文 list different e-mails', `EN: ${enMail.email} · 中文: ${zhMail.email}. Use one address everywhere.`, `${enMail.email}|${zhMail.email}`)
  }
  const home = str(ctx.homeEmail).toLowerCase()
  if (home) {
    const first = emails.find((e) => e.email)
    if (first && first.email !== home) {
      add('email-mismatch', first.lang, first.i, [first.i, 'email'], ['E-mail'], 'The CV and the home page list different e-mails', `CV: ${first.email} · home page: ${home}. Recruiters may write to either — pick one.`, `${first.email}|home:${home}`)
    }
  }

  for (const spec of [...DATED_LISTS, { section: 'certification', list: 'certifications', title: (e: Node) => str(e.issuingOrganization) }] as ListSpec[]) {
    const ei = sections.en.findIndex((s) => s.sessionName === spec.section)
    const zi = sections.zh.findIndex((s) => s.sessionName === spec.section)
    if (ei < 0 || zi < 0) continue
    const enList: unknown[] = Array.isArray(sections.en[ei][spec.list]) ? sections.en[ei][spec.list] : []
    const zhList: unknown[] = Array.isArray(sections.zh[zi][spec.list]) ? sections.zh[zi][spec.list] : []
    if (enList.length !== zhList.length) continue
    enList.forEach((en, index) => {
      const zh = zhList[index]
      if (!isObj(en) || !isObj(zh)) return
      const title = shorten(spec.title(en) || spec.title(zh) || `entry ${index + 1}`, 48)
      // Visibility differs between the languages.
      if (isSectionOnCv(sections.en[ei]) && isSectionOnCv(sections.zh[zi]) && isEntryHidden(en) !== isEntryHidden(zh)) {
        const hiddenIn: CvLang = isEntryHidden(en) ? 'en' : 'zh'
        const shownIn: CvLang = hiddenIn === 'en' ? 'zh' : 'en'
        add('visibility-mismatch', hiddenIn, hiddenIn === 'en' ? ei : zi, [hiddenIn === 'en' ? ei : zi, spec.list, index], [title], `“${title}” is shown in ${LANG_NAME[shownIn]} but hidden in ${LANG_NAME[hiddenIn]}`, 'Readers of both versions should see the same history — unless that is on purpose.', `${spec.section}:${title}:${hiddenIn}`)
      }
      if (isEntryHidden(en) || isEntryHidden(zh)) return
      const fields = spec.date ? [spec.date] : spec.start ? [spec.start, spec.end!] : []
      for (const f of fields) {
        if (isFieldHidden(en, f) || isFieldHidden(zh, f)) continue
        const a = str(en[f])
        const b = str(zh[f])
        if (!a || !b) continue
        const same = isPresent(a) && isPresent(b) ? true : ym(a) === ym(b)
        if (!same) {
          const which = f === spec.start ? 'start date' : f === spec.end ? 'end date' : 'date'
          add(
            'date-mismatch',
            'en',
            ei,
            [ei, spec.list, index, f],
            [title],
            `“${title}”: EN ${isPresent(a) ? 'Present' : ym(a)} · 中文 ${isPresent(b) ? '至今' : ym(b)}`,
            `The ${which} differs between the two languages; one of them is out of date.`,
            `${spec.section}:${title}:${f}:${a}|${b}`,
          )
        }
      }
    })
  }

  const rank: Record<ReadinessSeverity, number> = { high: 0, medium: 1, low: 2 }
  // De-duplicate (the same fingerprint can arise twice, e.g. a repeated bullet).
  const seen = new Set<string>()
  return out
    .filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
    .sort((a, b) => rank[a.severity] - rank[b.severity] || (a.lang === b.lang ? 0 : a.lang === 'en' ? -1 : 1) || a.sectionIdx - b.sectionIdx)
}

/** The dismissed fingerprints stored on a section. */
export function dismissedOf(section: unknown): string[] {
  const list = isObj(section) ? section.readinessDismissed : undefined
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
}

/** True when the finding's fingerprint is in its section's dismissed list. */
export function isDismissed(doc: CvDocLike, f: ReadinessFinding): boolean {
  const list = Array.isArray(doc?.[f.lang]) ? (doc[f.lang] as unknown[]) : []
  return dismissedOf(list[f.sectionIdx]).includes(f.id)
}

/** Split findings into the open and the dismissed ones. */
export function partitionFindings(doc: CvDocLike, findings: readonly ReadinessFinding[]): { open: ReadinessFinding[]; dismissed: ReadinessFinding[] } {
  const open: ReadinessFinding[] = []
  const dismissed: ReadinessFinding[] = []
  for (const f of findings) (isDismissed(doc, f) ? dismissed : open).push(f)
  return { open, dismissed }
}

/**
 * The document with the finding dismissed (or restored) — an immutable edit
 * of its section's `readinessDismissed` list. Fingerprints that no longer
 * match any finding are pruned at the same time, so the list never grows.
 */
export function withDismissal<D extends { en: any[]; zh: any[] }>(
  doc: D,
  f: Pick<ReadinessFinding, 'id' | 'lang' | 'sectionIdx'>,
  dismissed: boolean,
  liveIds?: ReadonlySet<string>,
): D {
  const sections = doc[f.lang]
  const section = sections[f.sectionIdx]
  if (!isObj(section)) return doc
  const current = dismissedOf(section).filter((id) => !liveIds || liveIds.has(id) || id === f.id)
  const next = dismissed ? Array.from(new Set([...current, f.id])) : current.filter((id) => id !== f.id)
  const updated: Node = { ...section }
  if (next.length) updated.readinessDismissed = next
  else delete updated.readinessDismissed
  const list = sections.slice()
  list[f.sectionIdx] = updated
  return { ...doc, [f.lang]: list }
}

/** Counts for the status hub. */
export function readinessSummary(doc: CvDocLike, findings: readonly ReadinessFinding[]): { open: number; high: number; dismissed: number } {
  const { open, dismissed } = partitionFindings(doc, findings)
  return { open: open.length, high: open.filter((f) => f.severity === 'high').length, dismissed: dismissed.length }
}
