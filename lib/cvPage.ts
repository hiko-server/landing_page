/**
 * getStaticProps of /cv and /cv/zh (ISR). SERVER-ONLY.
 *
 * Both pages are statically generated and regenerated:
 *   - on demand, right after every write that changes what they show — CV
 *     saves / restores / imports, home saves (header socials, portrait,
 *     GitHub / LinkedIn fallbacks, the availability lines), post and case-study saves (skill
 *     evidence, case-study links), store restores (lib/revalidate);
 *   - and at the latest every CV_REVALIDATE_SECONDS: "Present" / "Expected"
 *     and the Person facts depend on the current month, and the window is
 *     also the longest an edge cache keeps a copy (s-maxage) when edge
 *     purging is not configured — so an entry the owner hides is gone from
 *     every cache within a minute even then (like /now).
 * During `next build` the content store is usually empty (Docker builds
 * carry no data), so a build-time copy asks for regeneration on the first
 * request (revalidate: 1); the boot warm-up (scripts/warm-isr.mjs) replaces
 * it before visitors arrive.
 */

import type { CvLang } from './cvVisibility'
import type { CvHeaderExtras } from './cvLocale'
import type { HomeData } from './homeShape'
import type { PersonFacts } from './schema'
import type { SkillEvidence } from './skillEvidence'
import { referenceMonth } from './clock'

/** Time-based regeneration of /cv and /cv/zh (on-demand revalidation does the rest). */
export const CV_REVALIDATE_SECONDS = 60

/** True while `next build` prerenders pages. */
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build'
}

export type CvPageData = {
  /** Public 'cv'-audience sections of this page's language (evidence links resolved). */
  sections: any[]
  initialLang: CvLang
  /** BCP-47 language of the page ('en' / 'zh-Hans'); drives <html lang> in _app. */
  lang: string
  /** Server reference month ('YYYY-MM', lib/clock.ts) for "Present" / "Expected". */
  clockMonth: string
  /** Chinese name from the public CV ('' when hidden or not set). */
  nameZh: string
  /** The site-wide Person facts (lib/personFacts loadPersonFacts) — identical on every page. */
  personFacts: PersonFacts
  /** Print-only QR code (inline SVG) linking to this page; null when it could not be generated. */
  qrSvg: string | null
  /** 'YYYY-MM' of the last CV save ('' when unknown) — the visible "Updated" marker. */
  updatedMonth: string
  /** ISO timestamp of the last CV save ('' when unknown) — the CV's JSON-LD dateModified. */
  updatedIso: string
  /** Download file stem ("Li-Yanpei-CV-2026-10"); '' when there is nothing to download. */
  fileBase: string
  /** Where each skill is evidenced (lib/skillEvidence); only skills with evidence. */
  skillEvidence: SkillEvidence[]
  /** Skill name as written on this page → its evidence row id (lib/skillEvidence skillLinkMap). */
  skillLinks: Record<string, string>
  /** Public home.socials for the persistent header / footer (null = none set). */
  chromeSocials?: HomeData['socials'] | null
  /**
   * Header lines from the owner's availability (lib/cvLocale cvHeaderExtras):
   * the right-to-work line, and 求职意向 on /cv/zh. null = none.
   */
  headerExtras: CvHeaderExtras | null
}

export async function loadCvPageProps(lang: CvLang): Promise<{ props: CvPageData; revalidate: number }> {
  const clockMonth = referenceMonth()
  const { loadCvSource } = await import('./cvSource')
  const src = await loadCvSource(lang, clockMonth)

  let nameZh = ''
  let fileBase = ''
  let updatedMonth = ''
  let skillEvidence: SkillEvidence[] = []
  let skillLinks: Record<string, string> = {}
  try {
    const { publicNameZh } = await import('../components/CVViewerPage/cvName')
    if (lang === 'zh') nameZh = publicNameZh(src.sections)
    else {
      const { readPublicCvSections } = await import('./cvdata')
      nameZh = publicNameZh(readPublicCvSections('cv', ['personalInformation'], ['zh']).zh)
    }
  } catch {
    /* the title falls back to the English name */
  }
  try {
    const { buildCvModel, hasContent } = await import('./cvExport/model')
    const { cvFileBase } = await import('./cvExport/files')
    const model = buildCvModel(src.sections, { lang, now: clockMonth, updatedAt: src.updatedAt, canonical: '' })
    updatedMonth = model.updatedMonth
    if (hasContent(model)) fileBase = cvFileBase(src.enPersonal, lang, model.updatedMonth)
  } catch {
    /* no downloads offered */
  }
  try {
    const { buildSkillEvidence, skillLinkMap } = await import('./skillEvidence')
    const { listPosts } = await import('./mdx')
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

  let personFacts: PersonFacts = {}
  try {
    personFacts = (await import('./personFacts')).loadPersonFacts(clockMonth)
  } catch {
    /* the node keeps its built-in defaults */
  }
  let qrSvg: string | null = null
  try {
    const { qrSvg: makeQr } = await import('./qr')
    const { absUrl } = await import('./schema')
    qrSvg = await makeQr(absUrl(lang === 'zh' ? '/cv/zh' : '/cv'))
  } catch {
    /* the sheet prints without its QR footer */
  }

  return {
    props: {
      sections: src.sections,
      initialLang: lang,
      lang: lang === 'zh' ? 'zh-Hans' : 'en',
      clockMonth,
      nameZh,
      personFacts,
      qrSvg,
      updatedMonth,
      updatedIso: src.updatedAt > 0 ? new Date(src.updatedAt).toISOString() : '',
      fileBase,
      skillEvidence,
      skillLinks,
      headerExtras: src.headerExtras,
      // Omitted when the home document could not be read: the chrome then loads the public view itself.
      ...(src.socials !== undefined ? { chromeSocials: src.socials as HomeData['socials'] | null } : {}),
    },
    revalidate: isBuildPhase() ? 1 : CV_REVALIDATE_SECONDS,
  }
}
