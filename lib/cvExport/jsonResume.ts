/**
 * JSON Resume 1.0.0 (https://jsonresume.org/schema) of the PUBLIC CV
 * (/cv.json, /cv/zh.json). Built from the same pruned, CV-audience sections
 * as the page and the PDF (decorated by lib/cvLinks withEvidenceLinks) and
 * read through components/CVViewerPage/fields, so hidden sections, entries,
 * fields and bullets never appear. Pure; unit-tested.
 *
 * Mapping (empty values are omitted, never written as ""):
 *   personalInformation → basics (location as free text in `address`;
 *                         GitHub / LinkedIn → profiles)
 *   workExperience      → work   (relatedSkills → `keywords`)
 *   education           → education
 *   project             → projects (live / case study / repository URLs)
 *   competitionAwards   → awards
 *   certification       → certificates
 *   patents             → publications (one per listed patent)
 *   skill               → skills (core skills with their level, then groups)
 *   extraSkill          → languages ("Mandarin: Native" → language + fluency)
 * Dates are ISO 8601 (YYYY / YYYY-MM); an open end ("Present", or a future
 * end on a running project) has no endDate.
 */

import type { CvLang, CvSectionLike } from '../cvVisibility'
import { isFuture, isPresent, parseCvDate, safeHref } from '../cvFormat'
import { profileLinks, projectLinks, webHref } from '../cvLinks'
import { bullets, entries, entryStatus, field, indexedCertificates, list } from '../../components/CVViewerPage/fields'

export const JSON_RESUME_SCHEMA = 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json'

type Json = Record<string, unknown>

/** ISO 8601 (YYYY / YYYY-MM) of a stored CV date; '' for blank, open-ended or unparseable values. */
export function isoDate(value: unknown): string {
  if (isPresent(value)) return ''
  const d = parseCvDate(value)
  if (!d) return ''
  return d.m ? `${d.y}-${String(d.m).padStart(2, '0')}` : String(d.y)
}

/** Drop empty strings, empty arrays and undefined values (shallow). */
function compact<T extends Json>(o: T): T {
  const out: Json = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v) && v.length === 0) continue
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue
    out[k] = v
  }
  return out as T
}

const section = (sections: readonly CvSectionLike[], name: string) => sections.find((s) => s?.sessionName === name)

function highlights(node: unknown): string[] {
  return list(node, 'features')
    .map((f) => {
      const text = field(f, 'description')
      const sub = bullets(f, 'furtherExplanation')
      return sub.length ? [text, sub.join('; ')].filter(Boolean).join(': ') : text
    })
    .filter(Boolean)
}

/** "Mandarin: Native" / "普通话：母语" → { language, fluency }; a plain point is just the language. */
export function languageOf(point: string): { language: string; fluency?: string } {
  const m = /^([^:：]{1,40})[:：]\s*(.+)$/.exec(point.trim())
  return m ? { language: m[1].trim(), fluency: m[2].trim() } : { language: point.trim() }
}

function username(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] || ''
  } catch {
    return ''
  }
}

export type JsonResumeOptions = {
  lang: CvLang
  /** Reference month 'YYYY-MM' for open-ended entries. */
  now: string
  /** Absolute URL of this JSON document. */
  canonical: string
  /** Last save of the CV (epoch ms). */
  updatedAt?: number | null
}

/** The JSON Resume document of one language's public CV. */
export function buildJsonResume(input: readonly CvSectionLike[] | null | undefined, opts: JsonResumeOptions): Json {
  const sections = entries(Array.isArray(input) ? input : []).filter((s) => s.isVisible !== false)
  const { lang, now } = opts
  const pi = section(sections, 'personalInformation')

  const first = field(pi, 'firstName')
  const last = field(pi, 'lastName')
  const nick = field(pi, 'nickName')
  const baseName = lang === 'zh' ? `${last}${first}` : [last, first].filter(Boolean).join(' ')
  const name = baseName ? (nick && lang !== 'zh' ? `${baseName} (${nick})` : baseName) : nick

  const work = list(section(sections, 'workExperience'), 'experiences')
  const current = work.find((e) => entryStatus(e, now) === 'current' && field(e, 'jobTitle'))

  const basics = compact({
    name,
    label: current ? field(current, 'jobTitle') : '',
    email: field(pi, 'email'),
    phone: field(pi, 'phoneNumber'),
    url: webHref(field(pi, 'personalWebsite')),
    summary: field(pi, 'introduction'),
    location: compact({ address: field(pi, 'address') }),
    profiles: profileLinks(pi).map((p) => compact({ network: p.label, username: username(p.href), url: p.href })),
  })

  const workOut = work
    .filter((e) => field(e, 'jobTitle') || field(e, 'companyName'))
    .map((e) =>
      compact({
        name: field(e, 'companyName'),
        position: field(e, 'jobTitle'),
        url: webHref(field(e, 'companyURL')),
        location: field(e, 'location'),
        startDate: isoDate(field(e, 'startDate')),
        endDate: isoDate(field(e, 'endDate')),
        summary: field(e, 'jobDescription'),
        highlights: highlights(e),
        keywords: bullets(e, 'relatedSkills'),
      }),
    )

  const education = list(section(sections, 'education'), 'educationExperience')
    .filter((e) => field(e, 'schoolName') || field(e, 'degree'))
    .map((e) =>
      compact({
        institution: field(e, 'schoolName'),
        location: field(e, 'schoolLocation'),
        area: field(e, 'major'),
        studyType: field(e, 'degree'),
        startDate: isoDate(field(e, 'startDate')),
        endDate: isoDate(field(e, 'endDate')),
        score: field(e, 'gpa'),
      }),
    )

  const projects = list(section(sections, 'project'), 'projectExperience')
    .filter((p) => field(p, 'title'))
    .map((p) => {
      const links = projectLinks(p, lang)
      const of = (kind: string) => links.find((l) => l.kind === kind)?.href || ''
      const end = field(p, 'endDate')
      return compact({
        name: field(p, 'title'),
        description: field(p, 'description'),
        highlights: highlights(p),
        startDate: isoDate(field(p, 'startDate')),
        endDate: isFuture(end, now) ? '' : isoDate(end),
        url: of('live') || of('caseStudy') || of('repo'),
        caseStudy: of('caseStudy'),
        repository: of('repo'),
        location: field(p, 'projectLocation'),
      })
    })

  const awards = list(section(sections, 'competitionAwards'), 'awards')
    .filter((a) => field(a, 'contestName') || field(a, 'award'))
    .map((a) => {
      const contest = field(a, 'contestName')
      const award = field(a, 'award')
      return compact({
        title: contest ? (award ? `${contest} — ${award}` : contest) : award,
        date: isoDate(field(a, 'date')),
        awarder: field(a, 'organization'),
        summary: bullets(a, 'description').join(' '),
      })
    })

  const certificates = indexedCertificates(section(sections, 'certification'))
    .filter(({ cert }) => field(cert, 'certificationName'))
    .map(({ org, cert }) =>
      compact({
        name: field(cert, 'certificationName'),
        date: isoDate(field(cert, 'issuedDate')),
        issuer: field(org, 'issuingOrganization'),
        url: webHref(field(cert, 'credentialURL')),
      }),
    )

  const publications = list(section(sections, 'patents'), 'patentExperience').flatMap((g) => {
    const items = bullets(g, 'patents')
    const status = field(g, 'status')
    const summary = [field(g, 'title'), field(g, 'organization'), status].filter(Boolean).join(' · ')
    const base = { publisher: field(g, 'authority'), releaseDate: isoDate(field(g, 'date')) }
    if (!items.length) return field(g, 'title') ? [compact({ name: field(g, 'title'), ...base, summary: [field(g, 'organization'), status].filter(Boolean).join(' · ') })] : []
    return items.map((name) => compact({ name, ...base, summary }))
  })

  const skillSection = section(sections, 'skill')
  const skills = [
    ...list(skillSection, 'languages')
      .filter((l) => field(l, 'language'))
      .map((l) => compact({ name: field(l, 'language'), level: field(l, 'level').replace(/[.。]+$/, '') })),
    ...list(skillSection, 'technical')
      .filter((g) => field(g, 'name') || bullets(g, 'description').length)
      .map((g) => compact({ name: field(g, 'name'), keywords: bullets(g, 'description') })),
  ]

  const languages = bullets(section(sections, 'extraSkill'), 'points').map((p) => compact(languageOf(p)))

  const lastModified =
    typeof opts.updatedAt === 'number' && opts.updatedAt > 0 ? new Date(opts.updatedAt).toISOString().replace(/\.\d{3}Z$/, 'Z') : ''

  return compact({
    $schema: JSON_RESUME_SCHEMA,
    basics,
    work: workOut,
    education,
    awards,
    certificates,
    publications,
    skills,
    languages,
    projects,
    meta: compact({ canonical: safeHref(opts.canonical), version: 'v1.0.0', lastModified }),
  })
}
