/**
 * SEO origin + structured-data (JSON-LD) builders.
 *
 * Client+server safe — NO node-only imports, so pages and components can both
 * use it. Every URL is pinned to ONE canonical origin (NEXT_PUBLIC_SITE_HOST,
 * default lucian-dev.com) regardless of the host a request arrives on, so
 * Google never sees duplicate URLs/entities across hiko.dev and lucian-dev.com.
 *
 * Personal facts that the owner can hide in the CV (schools, location,
 * skills) are NOT hard-coded here: callers pass them from PUBLIC data
 * (see personFactsFromCv), so hidden CV content never reaches structured data.
 */

import type { CvSectionLike } from './cvVisibility'

const HOST = process.env.NEXT_PUBLIC_SITE_HOST || 'lucian-dev.com'

export const SITE_HOST = HOST
export const SITE_URL = `https://${HOST}`

/** Absolute URL on the canonical origin. Pass-through for already-absolute URLs. */
export function absUrl(path = '/'): string {
  if (!path) return SITE_URL
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

// Stable @id anchors so every page references the SAME Person / WebSite node
// instead of re-declaring a near-duplicate entity (which splits ranking signals).
export const PERSON_ID = `${SITE_URL}/#person`
export const WEBSITE_ID = `${SITE_URL}/#website`

/** Public display name — kept in one place so it stays consistent everywhere. */
export const PERSON_NAME = 'Li Yanpei (Lucian)'

/** A reference to the canonical Person node (use as author/publisher/mainEntity). */
export const personRef = { '@id': PERSON_ID }

/** The public profiles linked from the site header and footer on every page. */
export const DEFAULT_SAME_AS: readonly string[] = [
  'https://github.com/HikoPLi',
  'https://gitlab.com/HikoPLi',
  'https://www.linkedin.com/in/liyanpeihiko/',
]

/** Role shown in every public page description. */
export const DEFAULT_JOB_TITLE = 'Software Engineer'

type Organization = string | { name: string; [k: string]: unknown }

/** Optional facts for personNode(), taken from PUBLIC data only. */
export type PersonFacts = {
  /** Schools — plain names or schema.org organisation objects. */
  alumniOf?: Organization[]
  /** Location: free text ("Kowloon, Hong Kong") or a PostalAddress object. */
  address?: string | Record<string, unknown>
  jobTitle?: string
  sameAs?: readonly string[]
  knowsAbout?: readonly string[]
  image?: string
  description?: string
}

const PERSON_FACT_KEYS = new Set(['alumniOf', 'address', 'jobTitle', 'sameAs', 'knowsAbout', 'image', 'description'])

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const uniq = (list: string[]) => Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)))

function organization(o: Organization): Record<string, unknown> | null {
  if (typeof o === 'string') return o.trim() ? { '@type': 'EducationalOrganization', name: o.trim() } : null
  if (o && nonEmpty(o.name)) return { '@type': 'EducationalOrganization', ...o }
  return null
}

/**
 * The canonical Person entity. Callable with no argument (name, url, image,
 * default job title and the site-wide profile links only). Known fact keys
 * (PersonFacts) are normalised; any other key is merged verbatim, as before.
 */
export function personNode(data: PersonFacts & Record<string, unknown> = {}) {
  const extra: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) if (!PERSON_FACT_KEYS.has(k) && v !== undefined) extra[k] = v

  const alumniOf = (data.alumniOf || []).map(organization).filter((o): o is Record<string, unknown> => !!o)
  const knowsAbout = uniq([...(data.knowsAbout || [])])
  const sameAs = uniq([...(data.sameAs && data.sameAs.length ? data.sameAs : DEFAULT_SAME_AS)])
  const address =
    typeof data.address === 'string'
      ? data.address.trim() || undefined
      : data.address && Object.keys(data.address).length
        ? { '@type': 'PostalAddress', ...data.address }
        : undefined

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': PERSON_ID,
    name: PERSON_NAME,
    alternateName: 'Lucian',
    url: SITE_URL,
    image: absUrl(data.image || '/images/hikoAvator.png'),
    jobTitle: nonEmpty(data.jobTitle) ? data.jobTitle.trim() : DEFAULT_JOB_TITLE,
    ...(nonEmpty(data.description) ? { description: data.description.trim() } : {}),
    sameAs,
    ...(alumniOf.length ? { alumniOf } : {}),
    ...(address ? { address } : {}),
    ...(knowsAbout.length ? { knowsAbout } : {}),
    ...extra,
  }
}

/**
 * PersonFacts from PUBLIC (already pruned) CV sections — e.g.
 * `readPublicCvSections('cv', ['personalInformation', 'education', 'skill'], ['en']).en`.
 * Hidden fields arrive blank and are skipped; sections the caller did not
 * load simply contribute nothing.
 */
export function personFactsFromCv(sections: readonly CvSectionLike[] | null | undefined): PersonFacts {
  const list = Array.isArray(sections) ? sections : []
  const find = (name: string) => list.find((s) => s?.sessionName === name)
  const facts: PersonFacts = {}

  const info = find('personalInformation')
  if (info && nonEmpty(info.address)) facts.address = info.address.trim()

  const education = find('education')
  const schools = Array.isArray(education?.educationExperience)
    ? uniq(education.educationExperience.map((e: any) => (nonEmpty(e?.schoolName) ? e.schoolName : '')))
    : []
  if (schools.length) facts.alumniOf = schools

  const skill = find('skill')
  const skills: string[] = []
  if (Array.isArray(skill?.languages)) for (const s of skill.languages) if (nonEmpty(s?.language)) skills.push(s.language)
  if (Array.isArray(skill?.technical))
    for (const g of skill.technical) if (Array.isArray(g?.description)) skills.push(...g.description.filter(nonEmpty))
  const knowsAbout = uniq(skills).slice(0, 30)
  if (knowsAbout.length) facts.knowsAbout = knowsAbout

  return facts
}

/** The canonical WebSite entity, published by the Person. */
export function websiteNode(extra: Record<string, unknown> = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_HOST,
    url: SITE_URL,
    inLanguage: ['en', 'zh'],
    publisher: personRef,
    ...extra,
  }
}

/** BreadcrumbList from a Home → … → page trail (paths are made absolute). */
export function breadcrumb(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absUrl(it.path),
    })),
  }
}

/**
 * JSON for an inline `<script type="application/ld+json">`. Escapes the
 * characters that could end the script element or break JS parsers
 * (`<`, `>`, `&`, U+2028, U+2029) as \uXXXX — still valid JSON, so the
 * parsed data is unchanged, but a "</script>" inside a title can never
 * break out of the tag.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/** Social-card kinds understood by /api/og (shown as the card's [kind] label). */
export type OgKind = 'home' | 'blog' | 'work' | 'cv' | 'page'

/** Absolute /api/og social-card URL (1200×630). Long text is trimmed like the endpoint does. */
export function ogImageUrl({ kind, title, subtitle }: { kind: OgKind; title: string; subtitle?: string }): string {
  const params = new URLSearchParams({ kind, title: title.trim().slice(0, 120) })
  const sub = (subtitle || '').trim()
  if (sub) params.set('subtitle', sub.length > 200 ? `${sub.slice(0, 199)}…` : sub)
  return absUrl(`/api/og?${params.toString()}`)
}

export type Alternate = { hrefLang: string; href: string }

/** hreflang alternates for the bilingual CV (pass to CustomHead `alternates`). */
export const CV_ALTERNATES: readonly Alternate[] = [
  { hrefLang: 'en', href: absUrl('/cv') },
  { hrefLang: 'zh-Hans', href: absUrl('/cv?lang=zh') },
  { hrefLang: 'x-default', href: absUrl('/cv') },
]

/**
 * Alternates with an x-default entry guaranteed (the first alternate unless
 * one is given), de-duplicated by hrefLang.
 */
export function withXDefault(alternates: readonly Alternate[] | undefined): Alternate[] {
  const out: Alternate[] = []
  const seen = new Set<string>()
  for (const a of alternates || []) {
    if (!a || !nonEmpty(a.hrefLang) || !nonEmpty(a.href)) continue
    const key = a.hrefLang.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ hrefLang: a.hrefLang, href: absUrl(a.href) })
  }
  if (out.length && !seen.has('x-default')) out.push({ hrefLang: 'x-default', href: out[0].href })
  return out
}

/** Open Graph locale for a BCP-47 page language ("zh-Hans" → "zh_CN"). */
export function ogLocale(lang: string | undefined): string {
  const l = (lang || 'en').toLowerCase()
  if (l.startsWith('zh-hant') || l === 'zh-tw') return 'zh_TW'
  if (l === 'zh-hk') return 'zh_HK'
  if (l.startsWith('zh')) return 'zh_CN'
  if (l.startsWith('ja')) return 'ja_JP'
  if (l.startsWith('ko')) return 'ko_KR'
  return 'en_US'
}
