/**
 * The private share page of a CV variant (/cv/r/<token>, /cv/r/<token>/zh)
 * and its PDF — SERVER-ONLY.
 *
 * Rendered per request (getServerSideProps; never ISR, never cached): the
 * token is checked every time, so a revoked or expired link stops working
 * at once. The CV is the variant's selection over the stored document,
 * pruned for the 'private' surface (lib/cvVisibility) — hidden content and
 * anything the owner keeps off private links never reaches the props.
 * Every way a link can fail answers the same "not available" page (404),
 * so a visitor learns nothing about other links.
 */

import type { CvLang, CvSectionLike } from '../cvVisibility'
import type { CvHeaderExtras } from '../cvLocale'
import type { OwnerNames } from '../publications/names'
import type { SkillEvidence } from '../skillEvidence'
import type { HomeData } from '../homeShape'
import type { CvSource } from '../cvSource'
import type { CvVariant } from '../cvVariants'
import { referenceMonth } from '../clock'

export type SharedCvAvailable = {
  state: 'ok'
  /** BCP-47 language of the page; drives <html lang> in _app. */
  lang: string
  cvLang: CvLang
  token: string
  sections: CvSectionLike[]
  /** The other language, when the variant has something to show in it. */
  otherLang: CvLang | null
  /** Download stem of the PDF ('' when there is nothing to print). */
  fileBase: string
  updatedMonth: string
  clockMonth: string
  ownerNames?: OwnerNames
  headerExtras: CvHeaderExtras | null
  skillEvidence: SkillEvidence[]
  skillLinks: Record<string, string>
  chromeSocials?: HomeData['socials'] | null
  /** Whether /publications exists (the site chrome links it). */
  chromePublications?: boolean
}

export type SharedCvUnavailable = { state: 'unavailable'; lang: string; cvLang: CvLang; clockMonth: string }

export type SharedCvProps = SharedCvAvailable | SharedCvUnavailable

const HTML_LANG: Record<CvLang, string> = { en: 'en', zh: 'zh-Hans' }

export function unavailableProps(cvLang: CvLang = 'en'): SharedCvUnavailable {
  return { state: 'unavailable', lang: HTML_LANG[cvLang], cvLang, clockMonth: referenceMonth() }
}

/** The active link and its variant for a token, or null. */
export async function resolveShare(token: unknown): Promise<{ link: import('./links').ShareLink; variant: CvVariant } | null> {
  try {
    const { resolveShareToken } = await import('./store')
    const link = resolveShareToken(token)
    if (!link) return null
    const { readVariant } = await import('../cvVariantsStore')
    const variant = readVariant(link.variantId)
    return variant ? { link, variant } : null
  } catch {
    return null
  }
}

/** The variant's CV in one language, for the 'private' surface. */
export async function loadShareSource(variant: CvVariant, lang: CvLang, now = referenceMonth()): Promise<CvSource> {
  const { loadCvSource } = await import('../cvSource')
  const { variantSelect } = await import('../cvVariants')
  return loadCvSource(lang, now, { surface: 'private', select: variantSelect(variant) })
}

async function hasPrintable(src: CvSource): Promise<{ ok: boolean; month: string }> {
  const { buildCvModel, hasContent } = await import('../cvExport/model')
  const model = buildCvModel(src.sections, { lang: src.lang, now: src.now, updatedAt: src.updatedAt, canonical: '' })
  return { ok: hasContent(model), month: model.updatedMonth }
}

/**
 * Props of the share page. `requested` is the language in the URL (null:
 * the link's own); a language the variant has nothing in falls back to
 * "not available" with no other details.
 */
export async function loadSharePage(token: unknown, requested: CvLang | null): Promise<SharedCvProps> {
  const resolved = await resolveShare(token)
  if (!resolved || typeof token !== 'string') return unavailableProps(requested ?? 'en')
  const { link, variant } = resolved
  const lang = requested ?? link.lang
  const clockMonth = referenceMonth()
  const src = await loadShareSource(variant, lang, clockMonth)
  if (!src.sections.length) return unavailableProps(lang)
  const mine = await hasPrintable(src)
  const other: CvLang = lang === 'en' ? 'zh' : 'en'
  let otherLang: CvLang | null = null
  try {
    if ((await hasPrintable(await loadShareSource(variant, other, clockMonth))).ok) otherLang = other
  } catch {
    /* no language switch */
  }

  let fileBase = ''
  try {
    const { cvFileBase } = await import('../cvExport/files')
    if (mine.ok) fileBase = cvFileBase(src.enPersonal, lang, mine.month)
  } catch {
    /* no PDF offered */
  }

  let skillEvidence: SkillEvidence[] = []
  let skillLinks: Record<string, string> = {}
  try {
    const { buildSkillEvidence, skillLinkMap } = await import('../skillEvidence')
    const { listPosts } = await import('../mdx')
    const posts = listPosts().map((p) => ({
      slug: p.slug,
      title: String(p.frontmatter?.title || p.slug),
      description: typeof p.frontmatter?.description === 'string' ? p.frontmatter.description : '',
      tags: Array.isArray(p.frontmatter?.tags) ? p.frontmatter.tags : [],
    }))
    const works = src.works.map((w) => ({ slug: w.slug, title: w.title, description: w.description, tags: w.tech }))
    skillEvidence = buildSkillEvidence(src.sections, { lang, works, posts })
    skillLinks = skillLinkMap(src.sections, skillEvidence)
  } catch {
    /* the skills render without evidence links */
  }

  return {
    state: 'ok',
    lang: HTML_LANG[lang],
    cvLang: lang,
    token,
    sections: src.sections,
    otherLang,
    fileBase,
    updatedMonth: mine.month,
    clockMonth,
    ownerNames: src.ownerNames,
    headerExtras: src.headerExtras,
    skillEvidence,
    skillLinks,
    ...(src.socials !== undefined ? { chromeSocials: src.socials as HomeData['socials'] | null } : {}),
  }
}

/** Headers of every share response: private, never stored, never indexed, no Referer. */
export const SHARE_RESPONSE_HEADERS: ReadonlyArray<[string, string]> = [
  ['Cache-Control', 'private, no-store, max-age=0'],
  ['X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet'],
  ['Referrer-Policy', 'no-referrer'],
]
