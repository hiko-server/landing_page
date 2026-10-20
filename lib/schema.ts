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
import { canonicalOrcid, orcidRecordUrl } from './orcid/uri'

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

/** Short name used in page titles ("Post · Li Yanpei"). */
export const PERSON_SHORT_NAME = 'Li Yanpei'

/** A reference to the canonical Person node (use as about/mainEntity). */
export const personRef = { '@id': PERSON_ID }

/**
 * Author / publisher of articles: the canonical Person @id plus the name and
 * URL, so the entity resolves even for consumers that do not join @ids
 * across the page's JSON-LD blocks.
 */
export const personAuthor = {
  '@type': 'Person',
  '@id': PERSON_ID,
  name: PERSON_NAME,
  url: `${SITE_URL}/about`,
} as const

/** The site's time zone offset (Hong Kong): bare dates are local days there. */
export const SITE_TZ_OFFSET = '+08:00'

/**
 * ISO-8601 with an explicit offset for schema.org dates: a bare YYYY-MM-DD
 * becomes `YYYY-MM-DDT00:00:00+08:00`; full timestamps and anything else
 * pass through trimmed; '' for empty input.
 */
export function isoWithTz(date: unknown): string {
  const raw = typeof date === 'string' ? date.trim() : ''
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00${SITE_TZ_OFFSET}`
  return raw
}

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
  /** Location: free text ("Example District, Hong Kong") or a PostalAddress object. */
  address?: string | Record<string, unknown>
  jobTitle?: string
  sameAs?: readonly string[]
  knowsAbout?: readonly string[]
  image?: string
  description?: string
  /** Other names, e.g. the Chinese name from the PUBLIC CV. 'Lucian' is always included. */
  alternateName?: readonly string[]
  /** Completed degrees only (lib/personExtras). */
  hasCredential?: ReadonlyArray<{ name: string; school?: string; date?: string }>
  /** Competition results / awards. */
  award?: readonly string[]
  /** Spoken languages, with a BCP 47 code when known. */
  knowsLanguage?: ReadonlyArray<{ name: string; code?: string }>
  /** The employer of a role that is running right now. */
  worksFor?: { name: string; url?: string }
  /** Schools of studies that are running right now. */
  affiliation?: ReadonlyArray<{ name: string }>
  /**
   * The owner's ORCID iD (public Personal Info, canonical bare form —
   * lib/personFacts reads it with lib/orcid/cv orcidOf): the record's URI
   * joins `sameAs` and the iD becomes an ORCID `identifier` PropertyValue.
   */
  orcid?: string
  /**
   * When these facts last changed (ISO): the later of the CV and home
   * saves. Not part of the Person node — pages put it on their ProfilePage.
   */
  dateModified?: string
}

const PERSON_FACT_KEYS = new Set([
  'alumniOf',
  'address',
  'jobTitle',
  'sameAs',
  'knowsAbout',
  'image',
  'description',
  'alternateName',
  'hasCredential',
  'award',
  'knowsLanguage',
  'worksFor',
  'affiliation',
  'orcid',
  'dateModified',
])

/**
 * The ORCID `identifier` of a Person node (schema.org PropertyValue: the
 * bare iD as `value`, the record's URI as `url`), or null without a valid iD.
 */
export function orcidIdentifier(id: unknown): { '@type': 'PropertyValue'; propertyID: 'ORCID'; value: string; url: string } | null {
  const bare = canonicalOrcid(id)
  return bare ? { '@type': 'PropertyValue', propertyID: 'ORCID', value: bare, url: orcidRecordUrl(bare) } : null
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const uniq = (list: string[]) => Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)))

/** Skill-name key: case-, width- and space-insensitive, without parenthesised notes ("MongoDB (NoSQL)" = "mongodb"). */
const skillDedupeKey = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Skills de-duplicated by skillDedupeKey, first spelling kept. */
export function uniqueSkills(list: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const s = typeof raw === 'string' ? raw.trim() : ''
    const k = skillDedupeKey(s)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

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
  const knowsAbout = uniqueSkills([...(data.knowsAbout || [])])
  const hasCredential = (data.hasCredential || [])
    .filter((c) => c && nonEmpty(c.name))
    .map((c) => ({
      '@type': 'EducationalOccupationalCredential',
      name: c.name.trim(),
      credentialCategory: 'degree',
      ...(nonEmpty(c.school) ? { recognizedBy: { '@type': 'EducationalOrganization', name: c.school.trim() } } : {}),
      ...(nonEmpty(c.date) ? { dateCreated: c.date.trim() } : {}),
    }))
  const award = uniq([...(data.award || [])].filter(nonEmpty))
  const knowsLanguage = (data.knowsLanguage || [])
    .filter((l) => l && nonEmpty(l.name))
    .map((l) => ({ '@type': 'Language', name: l.name.trim(), ...(nonEmpty(l.code) ? { alternateName: l.code.trim() } : {}) }))
  const worksFor =
    data.worksFor && nonEmpty(data.worksFor.name)
      ? { '@type': 'Organization', name: data.worksFor.name.trim(), ...(nonEmpty(data.worksFor.url) ? { url: data.worksFor.url.trim() } : {}) }
      : undefined
  const affiliation = (data.affiliation || [])
    .filter((a) => a && nonEmpty(a.name))
    .map((a) => ({ '@type': 'EducationalOrganization', name: a.name.trim() }))
  const orcid = orcidRecordUrl(data.orcid)
  const sameAs = uniq([...(data.sameAs && data.sameAs.length ? data.sameAs : DEFAULT_SAME_AS), ...(orcid ? [orcid] : [])])
  const identifier = orcidIdentifier(data.orcid)
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
    alternateName: uniq(['Lucian', ...(data.alternateName || []).filter(nonEmpty)]),
    url: SITE_URL,
    image: absUrl(data.image || '/images/avatar-placeholder.png'),
    jobTitle: nonEmpty(data.jobTitle) ? data.jobTitle.trim() : DEFAULT_JOB_TITLE,
    ...(nonEmpty(data.description) ? { description: data.description.trim() } : {}),
    sameAs,
    ...(identifier ? { identifier } : {}),
    ...(alumniOf.length ? { alumniOf } : {}),
    ...(affiliation.length ? { affiliation } : {}),
    ...(worksFor ? { worksFor } : {}),
    ...(hasCredential.length ? { hasCredential } : {}),
    ...(award.length ? { award } : {}),
    ...(address ? { address } : {}),
    ...(knowsLanguage.length ? { knowsLanguage } : {}),
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
  // Pruned data: a hidden iD arrives blank. Saves store the canonical bare iD
  // (lib/orcid/id withBareOrcid); the light check keeps this module small on
  // every page — lib/personFacts reads the iD with the full normaliser.
  const orcid = info ? canonicalOrcid(info.orcid) : ''
  if (orcid) facts.orcid = orcid

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
  const knowsAbout = uniqueSkills(skills).slice(0, 30)
  if (knowsAbout.length) facts.knowsAbout = knowsAbout

  return facts
}

/**
 * The canonical WebSite entity, published by the Person. `name` is the
 * site name from the home settings (home.site?.name) when set, else the
 * owner's name; undefined values in `extra` never override the defaults.
 */
export function websiteNode(extra: Record<string, unknown> & { name?: string } = {}) {
  const defined = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined && v !== ''))
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: PERSON_NAME,
    alternateName: [SITE_HOST],
    url: `${SITE_URL}/`,
    inLanguage: ['en', 'zh'],
    publisher: personRef,
    ...defined,
  }
}

/**
 * ProfilePage wrapper (/, /about): the page is about, and its main entity
 * is, the canonical Person.
 */
export function profilePageNode({
  path,
  name,
  lang = 'en',
  dateModified,
}: {
  path: string
  name?: string
  lang?: string
  dateModified?: string
}) {
  const url = absUrl(path)
  const modified = isoWithTz(dateModified)
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${url}#profile`,
    url,
    name: name || PERSON_NAME,
    inLanguage: lang,
    isPartOf: { '@id': WEBSITE_ID },
    about: personRef,
    mainEntity: personRef,
    ...(modified ? { dateModified: modified } : {}),
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

export type OgImageOptions = {
  kind: OgKind
  title: string
  subtitle?: string
  /** Card language: 'zh' switches the static strings (简历 / 文章 / 案例). */
  lang?: 'en' | 'zh'
  /** 'square' renders 1200×1200 (schema.org image variants); default 1200×630. */
  size?: 'square'
  /** YYYY-MM-DD shown in the meta row. */
  date?: string
  /** Reading time in minutes (1–99). */
  mins?: number
  /** Up to three tags for the meta row. */
  tags?: readonly string[]
  /** Same-site /uploads/<name>.png|jpg cover shown on the right of the card (other formats are skipped). */
  cover?: string
  /** Cache-buster: the content's last write (epoch ms). */
  v?: number | null
}

/** 'zh' for Chinese page languages ("zh-Hans", "zh-CN"), else 'en'. */
export function ogLangOf(lang: string | undefined): 'en' | 'zh' {
  return (lang || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/**
 * Absolute /api/og social-card URL. Long text is trimmed like the endpoint
 * does; only parameters the endpoint accepts are emitted (see
 * lib/security/ogParams).
 */
export function ogImageUrl(o: OgImageOptions): string {
  const params = new URLSearchParams({ kind: o.kind, title: o.title.trim().slice(0, 120) })
  const sub = (o.subtitle || '').trim()
  if (sub) params.set('subtitle', sub.length > 200 ? `${sub.slice(0, 199)}…` : sub)
  if (o.lang === 'zh') params.set('lang', 'zh')
  if (o.size === 'square') params.set('size', 'square')
  const date = (o.date || '').trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) params.set('date', date)
  if (typeof o.mins === 'number' && Number.isFinite(o.mins) && o.mins >= 1) params.set('mins', String(Math.min(99, Math.round(o.mins))))
  const tags = (o.tags || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 3)
  if (tags.length) params.set('tags', tags.join(','))
  const cover = (o.cover || '').trim()
  if (/^\/uploads\/[^/?#]+\.(?:png|jpe?g)$/i.test(cover)) params.set('cover', cover)
  if (typeof o.v === 'number' && Number.isFinite(o.v) && o.v > 0) params.set('v', String(Math.floor(o.v)))
  return absUrl(`/api/og?${params.toString()}`)
}

/**
 * schema.org `image` for an article: the cover (when there is one), the
 * 1200×630 social card and its 1200×1200 square variant.
 */
export function articleImages(card: OgImageOptions, cover?: string): string[] {
  return articleImageUrls({ card: ogImageUrl({ ...card, size: undefined }), square: ogImageUrl({ ...card, size: 'square' }) }, cover)
}

/**
 * Same, from card URLs computed elsewhere — the signed URLs a page loader
 * passes down (lib/og/sign.ts signedOgImageUrl).
 */
export function articleImageUrls(cards: { card: string; square: string }, cover?: string): string[] {
  const out: string[] = []
  const c = (cover || '').trim()
  if (c && (/^https:\/\//i.test(c) || c.startsWith('/'))) out.push(absUrl(c))
  out.push(cards.card, cards.square)
  return out
}

/** Covers the social card can show (Satori decodes PNG and JPEG only; lib/security/ogParams). */
export const CARD_COVER_RE = /^\/uploads\/[^/?#]+\.(?:png|jpe?g)$/i

/**
 * Alt text of an article's social card (og:image:alt, twitter:image:alt):
 * "<title> — <name>", followed by the owner's description of the cover
 * (`coverAlt`) when the card actually shows that cover (H1).
 */
export function cardImageAlt(title: string, cover?: string, coverAlt?: string): string {
  const base = `${(title || '').replace(/\s+/g, ' ').trim()} — ${PERSON_NAME}`
  const alt = (coverAlt || '').replace(/\s+/g, ' ').trim()
  return alt && CARD_COVER_RE.test((cover || '').trim()) ? `${base}. ${alt}` : base
}

/** The social card options of an article (the page loader signs them; lib/og/sign.ts). */
export type ArticleCards = { card: string; square: string }

type ArticleNodeInput = {
  path: string
  title: string
  description?: string
  lang: string
  images: string[]
  keywords?: readonly string[]
  datePublished?: string
  dateModified?: string
}

/** BlogPosting for /blog/[slug]. */
export function blogPostingNode(a: ArticleNodeInput) {
  const url = absUrl(a.path)
  const published = isoWithTz(a.datePublished)
  const modified = isoWithTz(a.dateModified) || published
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: a.title,
    ...(a.description ? { description: a.description } : {}),
    image: a.images,
    inLanguage: a.lang,
    ...(published ? { datePublished: published } : {}),
    ...(modified ? { dateModified: modified } : {}),
    ...(a.keywords && a.keywords.length ? { keywords: a.keywords.join(', ') } : {}),
    author: personAuthor,
    publisher: personAuthor,
    mainEntityOfPage: url,
    url,
  }
}

/** CreativeWork for a /work/[slug] case study (`abstract`: the owner's one-line outcome; `datePublished`: its publication date). */
export function caseStudyNode(a: ArticleNodeInput & { sameAs?: readonly string[]; abstract?: string }) {
  const url = absUrl(a.path)
  const published = isoWithTz(a.datePublished)
  const modified = isoWithTz(a.dateModified)
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: a.title,
    url,
    mainEntityOfPage: url,
    image: a.images,
    inLanguage: a.lang,
    ...(a.description ? { description: a.description } : {}),
    ...(a.abstract ? { abstract: a.abstract } : {}),
    ...(published ? { datePublished: published, dateCreated: published } : {}),
    ...(modified ? { dateModified: modified } : {}),
    author: personAuthor,
    publisher: personAuthor,
    ...(a.keywords && a.keywords.length ? { keywords: a.keywords.join(', ') } : {}),
    ...(a.sameAs && a.sameAs.length ? { sameAs: [...a.sameAs] } : {}),
  }
}

// ── <title> and meta description ─────────────────────────────────────────

/** Description length search engines show before truncating. */
export const DESCRIPTION_MAX = 155
/** Shorter descriptions are replaced by `fallbackDescription` when one is given. */
export const DESCRIPTION_MIN = 70

const squash = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '')

/**
 * Document title:
 *   home            → "Li Yanpei (Lucian) — Software Engineer"
 *   zh page         → "简历 · 李彦霈" (nameZh, else "Li Yanpei")
 *   any other page  → "Writing · Li Yanpei"
 *   no title        → `fallback` (the site name)
 */
export function composeTitle({
  title,
  home = false,
  lang,
  nameZh,
  jobTitle = DEFAULT_JOB_TITLE,
  fallback = SITE_HOST,
}: {
  title?: string
  home?: boolean
  lang?: string
  nameZh?: string
  jobTitle?: string
  fallback?: string
}): string {
  if (home) return `${PERSON_NAME} — ${squash(jobTitle) || DEFAULT_JOB_TITLE}`
  const t = squash(title)
  if (!t) return fallback
  const zh = (lang || '').toLowerCase().startsWith('zh')
  const owner = zh ? squash(nameZh) || PERSON_SHORT_NAME : PERSON_SHORT_NAME
  return t.endsWith(owner) ? t : `${t} · ${owner}`
}

/** Clamp to `max` chars at a sentence, else word boundary; adds '…' when cut mid-sentence. */
export function clampAtBoundary(text: string, max: number): string {
  const s = squash(text)
  const chars = Array.from(s)
  if (chars.length <= max) return s
  const head = chars.slice(0, max - 1).join('')
  const sentence = Math.max(...['. ', '! ', '? ', '。', '！', '？'].map((m) => head.lastIndexOf(m)))
  if (sentence >= head.length * 0.5) return head.slice(0, sentence + 1).trim()
  const space = head.lastIndexOf(' ')
  const cut = space >= head.length * 0.5 ? head.slice(0, space) : head
  return `${cut.replace(/[\s,;:·—-]+$/u, '')}…`
}

/**
 * Meta description: whitespace collapsed, clamped to ≤ 155 chars at a
 * sentence or word boundary. A description under 70 chars is replaced by
 * a longer `fallback` when one is given (e.g. the article's first paragraph).
 */
export function clampDescription(description: string | undefined, fallback?: string): string {
  const d = squash(description)
  const f = squash(fallback)
  const useFallback = Array.from(d).length < DESCRIPTION_MIN && Array.from(f).length > Array.from(d).length
  return clampAtBoundary(useFallback ? f : d, DESCRIPTION_MAX)
}

export type Alternate = { hrefLang: string; href: string }

/** hreflang alternates for the bilingual CV: /cv (en) and /cv/zh (zh-Hans). */
export const CV_ALTERNATES: readonly Alternate[] = [
  { hrefLang: 'en', href: absUrl('/cv') },
  { hrefLang: 'zh-Hans', href: absUrl('/cv/zh') },
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
