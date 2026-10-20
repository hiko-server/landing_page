/**
 * Evidence links on the CV (A4 sheet, Reading view, PDF, plain text, JSON
 * Resume, vCard) — resolved from PUBLIC data only. Pure; unit-tested.
 *
 *   Profiles   personalInformation `github` / `linkedin`: the CV's own value,
 *              else the matching Home → Socials link. WhatsApp is never a
 *              CV profile. A field the owner HID (CV Studio eye) stays empty
 *              — the Home link is not used for it either.
 *   Projects   projectExperience[].caseStudy is normalised to the slug of the
 *              PUBLISHED case study the project refers to (lib matchCaseStudy:
 *              the owner's slug first, else a strict title match) and is ''
 *              otherwise, so a draft slug never reaches a public payload.
 *              `url` (live site) and `repo` (source code): the CV's value,
 *              else the linked case study's `link` / `repo`, unless hidden.
 *
 * Every href goes through safeHref and must be http(s); anything else is
 * dropped. Inputs are never mutated.
 */

import { isRedacted, type CvLang, type CvSectionLike } from './cvVisibility'
import { displayUrl, safeHref } from './cvFormat'
import { absUrl } from './schema'
import { field, list } from '../components/CVViewerPage/fields'
import { caseStudySlug, matchCaseStudy, type WorkIndexItem } from '../components/LandingPage/projectMatch'

/** The Home socials a CV may print (never WhatsApp). */
export type PublicSocials = { github?: unknown; linkedin?: unknown; [k: string]: unknown }

/** A published case study as the CV needs it (lib/mdx listWork). */
export type CvWork = WorkIndexItem & { link?: string; repo?: string }

export const PROFILE_FIELDS = ['github', 'linkedin'] as const
export type ProfileKey = (typeof PROFILE_FIELDS)[number]

const PROFILE_LABEL: Record<ProfileKey, string> = { github: 'GitHub', linkedin: 'LinkedIn' }

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

/** An absolute http(s) href for an owner-entered URL, or ''. */
export function webHref(value: unknown): string {
  const href = safeHref(value)
  return /^https?:\/\//i.test(href) ? href : ''
}

function decorateProfiles(pi: Record<string, any>, socials: PublicSocials | null | undefined): Record<string, any> {
  const out = { ...pi }
  for (const key of PROFILE_FIELDS) {
    if (isRedacted(pi, key)) {
      out[key] = ''
      continue
    }
    out[key] = webHref(field(pi, key)) || webHref(socials?.[key])
  }
  return out
}

function decorateProject(p: Record<string, any>, works: readonly CvWork[]): Record<string, any> {
  const out = { ...p }
  const hit = isRedacted(p, 'caseStudy') ? null : matchCaseStudy({ title: field(p, 'title'), caseStudy: field(p, 'caseStudy') }, works)
  out.caseStudy = hit ? hit.slug : ''
  for (const [key, from] of [['url', 'link'], ['repo', 'repo']] as const) {
    if (isRedacted(p, key)) {
      out[key] = ''
      continue
    }
    out[key] = webHref(field(p, key)) || webHref(hit?.[from])
  }
  return out
}

/**
 * Public CV sections with the evidence links resolved (see the module
 * comment). Sections other than personalInformation / project pass through.
 */
export function withEvidenceLinks(
  sections: readonly CvSectionLike[] | null | undefined,
  opts: { works?: readonly CvWork[] | null; socials?: PublicSocials | null } = {},
): CvSectionLike[] {
  const works = Array.isArray(opts.works) ? opts.works : []
  return (Array.isArray(sections) ? sections : []).map((s) => {
    if (!isObject(s)) return s
    if (s.sessionName === 'personalInformation') return decorateProfiles(s, opts.socials)
    if (s.sessionName === 'project' && Array.isArray(s.projectExperience)) {
      return { ...s, projectExperience: s.projectExperience.map((p: unknown) => (isObject(p) ? decorateProject(p, works) : p)) }
    }
    return s
  })
}

/**
 * Public CV sections in which a project's `caseStudy` is the slug of a
 * PUBLISHED case study or '' — the rule of the evidence links above, for
 * public data that is not decorated (GET /api/cvdata and every other reader
 * of lib/cvdata readPublicCvData), so a draft's or a deleted case study's
 * slug never leaves the server. Entries without the field stay without it.
 */
export function withPublishedCaseStudies(
  sections: readonly CvSectionLike[] | null | undefined,
  published: ReadonlySet<string>,
): CvSectionLike[] {
  return (Array.isArray(sections) ? sections : []).map((s) => {
    if (!isObject(s) || s.sessionName !== 'project' || !Array.isArray(s.projectExperience)) return s
    return {
      ...s,
      projectExperience: s.projectExperience.map((p: unknown) => {
        if (!isObject(p) || !('caseStudy' in p)) return p
        const slug = caseStudySlug(p.caseStudy)
        return { ...p, caseStudy: slug && published.has(slug) ? slug : '' }
      }),
    }
  })
}

export type CvLink = {
  kind: ProfileKey | 'caseStudy' | 'live' | 'repo'
  /** Short label ("GitHub", "Case study" / "案例"). */
  label: string
  /** Absolute href (what the PDF, text and JSON exports print). */
  href: string
  /** Same-site path for in-site navigation ("/work/swcs"), when there is one. */
  path?: string
  /** Display text without the protocol ("github.com/HikoPLi"). */
  text: string
}

/** Profile links of a (decorated) personalInformation section, GitHub first. */
export function profileLinks(pi: unknown): CvLink[] {
  const out: CvLink[] = []
  for (const key of PROFILE_FIELDS) {
    const href = webHref(field(pi, key))
    if (href) out.push({ kind: key, label: PROFILE_LABEL[key], href, text: displayUrl(href).replace(/^www\./i, '') })
  }
  return out
}

const PROJECT_LABELS: Record<CvLang, { caseStudy: string; live: string; repo: string }> = {
  en: { caseStudy: 'Case study', live: 'Live', repo: 'Code' },
  zh: { caseStudy: '案例', live: '线上', repo: '代码' },
}

/** Case study, live site and repository links of a (decorated) project entry. */
export function projectLinks(project: unknown, lang: CvLang = 'en'): CvLink[] {
  const L = PROJECT_LABELS[lang] || PROJECT_LABELS.en
  const out: CvLink[] = []
  const slug = field(project, 'caseStudy')
  if (/^[a-z0-9][a-z0-9-_]*$/.test(slug)) {
    const path = `/work/${slug}`
    out.push({ kind: 'caseStudy', label: L.caseStudy, href: absUrl(path), path, text: displayUrl(absUrl(path)) })
  }
  const live = webHref(field(project, 'url'))
  if (live) out.push({ kind: 'live', label: L.live, href: live, text: displayUrl(live) })
  const repo = webHref(field(project, 'repo'))
  if (repo) out.push({ kind: 'repo', label: L.repo, href: repo, text: displayUrl(repo) })
  return out
}

/** Every evidence link of a decorated CV (profiles + every project's links), for the vCard / tests. */
export function allEvidenceLinks(sections: readonly CvSectionLike[] | null | undefined, lang: CvLang = 'en'): CvLink[] {
  const list_ = Array.isArray(sections) ? sections : []
  const pi = list_.find((s) => s?.sessionName === 'personalInformation')
  const projects = list(list_.find((s) => s?.sessionName === 'project'), 'projectExperience')
  return [...profileLinks(pi), ...projects.flatMap((p) => projectLinks(p, lang))]
}
