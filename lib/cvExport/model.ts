/**
 * The CV document model behind the downloadable CVs (PDF, plain text).
 *
 * ONE pure function turns the PUBLIC, CV-audience sections of one language
 * (lib/cvdata readPublicCvSections('cv', …), decorated with the evidence
 * links of lib/cvLinks) into a neutral tree of strings. Every value is read
 * through components/CVViewerPage/fields, exactly like the A4 sheet and the
 * Reading view: a field, entry, bullet or section the owner hid is already
 * gone from the input, and a hidden date never turns into "Present". The
 * renderers draw only what this model contains, so nothing hidden can reach
 * a file (tests/cv-docs-leak.test.ts).
 *
 * Dates use the page's reference month (lib/clock.ts) for "Present" /
 * "Expected", so a file and the page rendered in the same month agree.
 *
 * The header also carries the lines from the owner's PUBLIC availability
 * (lib/cvLocale cvHeaderExtras: the right-to-work line, and 求职意向 on the
 * Chinese CV), formatted like the A4 sheet (headerExtrasLines). The optional
 * PDF photo is not part of the model: it is binary, private to the PDF and
 * passed to the renderer separately (lib/cvExport/photo).
 */

import type { CvLang, CvSectionLike } from '../cvVisibility'
import { cvLabels, displayUrl, formatCvDate, majorAddsInfo, safeHref } from '../cvFormat'
import { SECTION_BY_NAME } from '../cvSections'
import { profileLinks, projectLinks, webHref, type CvLink } from '../cvLinks'
import {
  bullets,
  certificateValidity,
  cvEntryAnchor,
  entries,
  entryRange,
  field,
  graduation,
  indexedCertificates,
  indexedList,
  joinParts,
  labelled,
  list,
} from '../../components/CVViewerPage/fields'
import { composeName } from '../../components/CVViewerPage/cvName'
import { extrasLines } from '../../components/CVViewerPage/headerExtrasLines'
import { recommendationCredit, recommendationItems } from '../../components/CVViewerPage/recommendationView'
import type { CvHeaderExtras } from '../cvLocale'
import { monthOf, updatedLabel } from './updated'

export { monthLabel, monthOf, updatedLabel } from './updated'

export type ModelBullet = { text: string; sub: string[] }

export type ModelEntry = {
  /** Stable anchor of the entry on the page (`cv-<section>-<index>`). */
  anchor: string
  title: string
  subtitle: string
  /** Safe http(s) link for the subtitle (a company website), or ''. */
  subtitleHref: string
  date: string
  place: string
  text: string
  /** A short extra line (GPA, patent status). */
  note: string
  bullets: ModelBullet[]
  tags: string[]
  links: CvLink[]
}

/** A recommendation as printed: the quote, then "— name, credit". */
export type ModelQuote = {
  anchor: string
  quote: string
  name: string
  /** "Engineering manager · managed me · Mar 2026" — whatever is set. */
  credit: string
  /** Safe http(s) link to where it was published, or ''. */
  href: string
}

export type ModelSection =
  | { kind: 'entries'; id: string; title: string; entries: ModelEntry[] }
  | { kind: 'skills'; id: string; title: string; core: Array<{ name: string; level: string }>; groups: Array<{ name: string; items: string[] }> }
  | { kind: 'points'; id: string; title: string; items: string[] }
  /** Self-assessment (自我评价): a statement and / or points. */
  | { kind: 'statement'; id: string; title: string; text: string; items: string[] }
  /** Recommendations given with permission (public data holds no other). */
  | { kind: 'quotes'; id: string; title: string; items: ModelQuote[] }

/** A labelled header line from the public availability ("求职意向：…", "Work authorisation: …"). */
export type ModelHeaderLine = { key: 'jobIntent' | 'workStatus'; label: string; value: string }

export type ModelContacts = {
  website: CvLink | null
  email: string
  phone: string
  location: string
  profiles: CvLink[]
}

export type CvDocModel = {
  lang: CvLang
  /** Display name ("Lucian LI, Yanpei" / "李彦霈"); '' when hidden. */
  name: string
  /** Preferred name shown beside the Chinese name ("Lucian"); '' otherwise. */
  nameAside: string
  contacts: ModelContacts
  /** Personal Info summary ('' when hidden or empty). */
  summary: string
  /** Header lines from the owner's public availability ([] when none). */
  headerLines: ModelHeaderLine[]
  sections: ModelSection[]
  /** 'YYYY-MM' of the CV's last save (Hong Kong time), '' when unknown. */
  updatedMonth: string
  /** "Updated October 2026" / "更新于 2026 年 10 月" ('' when unknown). */
  updatedLabel: string
  /** Absolute URL of the live CV page in this language. */
  canonical: string
  /** Skill names for the PDF keywords (public, de-duplicated). */
  keywords: string[]
}

export type ModelOptions = {
  lang: CvLang
  /** Reference month 'YYYY-MM' for "Present" / "Expected". */
  now: string
  /** Last save of the CV (epoch ms; 0 / undefined when unknown). */
  updatedAt?: number | null
  canonical: string
  /** Header lines from the public availability (lib/cvLocale cvHeaderExtras for this language). */
  headerExtras?: CvHeaderExtras | null
}

function features(node: unknown): ModelBullet[] {
  return list(node, 'features')
    .map((f) => ({ text: field(f, 'description'), sub: bullets(f, 'furtherExplanation') }))
    .filter((f) => f.text || f.sub.length)
}

const plain = (items: string[]): ModelBullet[] => items.map((text) => ({ text, sub: [] }))

function entry(partial: Partial<ModelEntry> & { anchor: string }): ModelEntry {
  return {
    title: '',
    subtitle: '',
    subtitleHref: '',
    date: '',
    place: '',
    text: '',
    note: '',
    bullets: [],
    tags: [],
    links: [],
    ...partial,
  }
}

function sectionTitle(section: CvSectionLike, lang: CvLang): string {
  return field(section, 'headerName') || SECTION_BY_NAME[String(section.sessionName)]?.headerDefault[lang] || String(section.sessionName || '')
}

function entriesOf(section: CvSectionLike, lang: CvLang, now: string): ModelEntry[] {
  const L = cvLabels(lang)
  const dot = ' · '
  switch (section.sessionName) {
    case 'education':
      return indexedList(section, 'educationExperience')
        .filter(({ item: e }) => field(e, 'schoolName') || field(e, 'degree') || field(e, 'major') || field(e, 'gpa'))
        .map(({ item: e, index }) => {
          const degree = field(e, 'degree')
          const major = majorAddsInfo(degree, field(e, 'major')) ? field(e, 'major') : ''
          const title = joinParts([degree, major], lang === 'zh' ? ' · ' : ', ')
          const school = joinParts([field(e, 'schoolName'), field(e, 'schoolLocation')], lang === 'zh' ? '，' : ', ')
          return entry({
            anchor: cvEntryAnchor('education', index),
            title: title || school,
            subtitle: title ? school : '',
            date: joinParts([formatCvDate(field(e, 'startDate'), lang), graduation(e, lang, now)], ' – '),
            note: labelled(L.gpa, field(e, 'gpa'), lang),
          })
        })
    case 'workExperience':
      return indexedList(section, 'experiences')
        .filter(({ item: e }) => field(e, 'jobTitle') || field(e, 'companyName') || field(e, 'jobDescription') || features(e).length)
        .map(({ item: e, index }) => {
          const title = field(e, 'jobTitle')
          const company = field(e, 'companyName')
          return entry({
            anchor: cvEntryAnchor('workExperience', index),
            title: title || company,
            subtitle: title ? company : '',
            subtitleHref: title && company ? webHref(field(e, 'companyURL')) : '',
            date: entryRange(e, lang),
            place: field(e, 'location'),
            text: field(e, 'jobDescription'),
            bullets: features(e),
            tags: bullets(e, 'relatedSkills'),
          })
        })
    case 'project':
      return indexedList(section, 'projectExperience')
        .filter(({ item: p }) => field(p, 'title') || field(p, 'description') || features(p).length)
        .map(({ item: p, index }) =>
          entry({
            anchor: cvEntryAnchor('project', index),
            title: field(p, 'title'),
            date: entryRange(p, lang, { futureEndAsPresent: true, now }),
            place: field(p, 'projectLocation'),
            text: field(p, 'description'),
            bullets: features(p),
            links: projectLinks(p, lang),
          }),
        )
    case 'competitionAwards':
      return indexedList(section, 'awards')
        .filter(({ item: a }) => field(a, 'contestName') || field(a, 'award') || bullets(a, 'description').length)
        .map(({ item: a, index }) => {
          const contest = field(a, 'contestName')
          return entry({
            anchor: cvEntryAnchor('competitionAwards', index),
            title: contest || field(a, 'award'),
            subtitle: joinParts([contest ? field(a, 'award') : '', field(a, 'organization')], dot),
            date: formatCvDate(field(a, 'date'), lang),
            place: field(a, 'location'),
            bullets: plain(bullets(a, 'description')),
          })
        })
    case 'patents':
      return indexedList(section, 'patentExperience')
        .filter(({ item: p }) => field(p, 'title') || bullets(p, 'patents').length)
        .map(({ item: p, index }) =>
          entry({
            anchor: cvEntryAnchor('patents', index),
            title: field(p, 'title'),
            subtitle: field(p, 'organization'),
            note: labelled(L.status, field(p, 'status'), lang),
            date: formatCvDate(field(p, 'date'), lang),
            place: field(p, 'authority'),
            bullets: plain(bullets(p, 'patents')),
          }),
        )
    case 'certification':
      return indexedCertificates(section)
        .filter(({ cert }) => field(cert, 'certificationName'))
        .map(({ org, cert, index }) => {
          const url = field(cert, 'credentialURL')
          const href = webHref(url)
          return entry({
            anchor: cvEntryAnchor('certification', index),
            title: field(cert, 'certificationName'),
            subtitle: joinParts([field(org, 'issuingOrganization'), labelled(L.credentialId, field(cert, 'credentialID'), lang)], dot),
            date: certificateValidity(cert, lang),
            links: href ? [{ kind: 'live', label: L.viewCredential, href, text: displayUrl(url) }] : [],
          })
        })
    default:
      return []
  }
}

function sectionOf(section: CvSectionLike, lang: CvLang, now: string): ModelSection | null {
  const id = String(section.sessionName || '')
  const title = sectionTitle(section, lang)
  if (id === 'skill') {
    const core = list(section, 'languages')
      .map((l) => ({ name: field(l, 'language'), level: field(l, 'level') }))
      .filter((l) => l.name || l.level)
    const groups = list(section, 'technical')
      .map((g) => ({ name: field(g, 'name'), items: bullets(g, 'description') }))
      .filter((g) => g.name || g.items.length)
    return core.length || groups.length ? { kind: 'skills', id, title, core, groups } : null
  }
  if (id === 'extraSkill') {
    const items = bullets(section, 'points')
    return items.length ? { kind: 'points', id, title, items } : null
  }
  if (id === 'selfAssessment') {
    const text = field(section, 'text')
    const items = bullets(section, 'points')
    return text || items.length ? { kind: 'statement', id, title, text, items } : null
  }
  if (id === 'recommendations') {
    const items = recommendationItems(section).map(({ item, index }) => ({
      anchor: cvEntryAnchor('recommendations', index),
      quote: item.quote,
      name: item.name,
      credit: recommendationCredit(item, lang),
      href: item.sourceUrl,
    }))
    return items.length ? { kind: 'quotes', id, title, items } : null
  }
  const items = entriesOf(section, lang, now)
  return items.length ? { kind: 'entries', id, title, entries: items } : null
}

const uniqueCi = (items: string[]) => {
  const seen = new Set<string>()
  return items.filter((s) => {
    const k = s.trim().toLowerCase()
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * The document model of one language's public CV. `sections` must be the
 * CV-audience public view (already pruned), decorated by withEvidenceLinks.
 */
export function buildCvModel(sections: readonly CvSectionLike[] | null | undefined, opts: ModelOptions): CvDocModel {
  const lang = opts.lang
  const visible = entries(Array.isArray(sections) ? sections : []).filter((s) => s.isVisible !== false)
  const pi = visible.find((s) => s.sessionName === 'personalInformation')
  const { main, aside } = composeName(pi, lang)
  const website = field(pi, 'personalWebsite')
  const websiteHref = safeHref(website)
  const contacts: ModelContacts = {
    website: website ? { kind: 'live', label: lang === 'zh' ? '网站' : 'Website', href: /^https?:/i.test(websiteHref) ? websiteHref : '', text: displayUrl(website) } : null,
    email: field(pi, 'email'),
    phone: field(pi, 'phoneNumber'),
    location: field(pi, 'address'),
    profiles: profileLinks(pi),
  }
  const out: ModelSection[] = []
  for (const s of visible) {
    if (s.sessionName === 'personalInformation') continue
    const m = sectionOf(s, lang, opts.now)
    if (m) out.push(m)
  }
  const skills = out.find((s): s is Extract<ModelSection, { kind: 'skills' }> => s.kind === 'skills')
  const keywords = skills ? uniqueCi([...skills.core.map((c) => c.name), ...skills.groups.flatMap((g) => g.items)]).slice(0, 24) : []
  const updatedMonth = monthOf(opts.updatedAt)
  return {
    lang,
    name: main,
    nameAside: aside,
    contacts,
    summary: field(pi, 'introduction'),
    headerLines: extrasLines(opts.headerExtras, lang),
    sections: out,
    updatedMonth,
    updatedLabel: updatedLabel(updatedMonth, lang),
    canonical: opts.canonical,
    keywords,
  }
}

/** True when the model has anything to print besides the name. */
export function hasContent(model: CvDocModel): boolean {
  return model.sections.length > 0 || !!model.summary
}

/**
 * Every string the model holds, flattened — the renderers may print only
 * these (plus their own fixed labels). Used by the leak tests.
 */
export function modelStrings(model: CvDocModel): string[] {
  const out: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      if (v) out.push(v)
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(model)
  return out
}
