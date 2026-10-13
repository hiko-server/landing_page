/**
 * The one server-side read behind every CV surface of a language: /cv and
 * /cv/zh (getStaticProps), the downloadable files (/api/cv/export) and the
 * vCard. SERVER-ONLY (content store).
 *
 * Reads the PUBLIC, CV-audience sections (lib/cvdata readPublicCvSections —
 * hidden sections, entries, fields and bullets are already removed),
 * resolves the evidence links (lib/cvLinks: profiles from Home → Socials,
 * published case studies only), the header lines from the owner's public
 * availability (lib/cvLocale cvHeaderExtras: the right-to-work line, and
 * 求职意向 on the Chinese CV) and the CV's last save. Each source is best
 * effort: a failing read contributes nothing instead of failing the page or
 * the file.
 */

import type { CvLang, CvSectionLike } from './cvVisibility'
import { referenceMonth } from './clock'
import { cvHeaderExtras, type CvHeaderExtras } from './cvLocale'
import { withEvidenceLinks, type CvWork, type PublicSocials } from './cvLinks'
import { SHEET_SECTIONS } from '../components/CVViewerPage/fields'

export type CvSource = {
  lang: CvLang
  /** Public 'cv' sections of `lang` (the sheet's section types), evidence links resolved. */
  sections: CvSectionLike[]
  /** Public English Personal Info (file names use its ASCII name parts); null when hidden / absent. */
  enPersonal: CvSectionLike | null
  /** Last save of the CV (kv updated_at, epoch ms); 0 when unknown. */
  updatedAt: number
  /** Reference month 'YYYY-MM' (lib/clock). */
  now: string
  /** Published case studies (slug, title, tech, link, repo). */
  works: CvWork[]
  /** Public Home socials (GitHub / LinkedIn fallbacks); null when none are set, undefined when the read failed. */
  socials: PublicSocials | null | undefined
  /** Header lines from the public availability (right-to-work line; 求职意向 in Chinese); null = none. */
  headerExtras: CvHeaderExtras | null
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

/** Published case studies as the CV needs them. */
export async function publishedWorks(): Promise<CvWork[]> {
  try {
    const { listWork } = await import('./mdx')
    return listWork().map(({ slug, frontmatter: fm }) => ({
      slug,
      title: String(fm?.title || slug),
      ...(typeof fm?.description === 'string' ? { description: fm.description } : {}),
      ...(Array.isArray(fm?.tech) ? { tech: fm.tech.filter((t): t is string => typeof t === 'string') } : {}),
      ...(typeof fm?.link === 'string' ? { link: fm.link } : {}),
      ...(typeof fm?.repo === 'string' ? { repo: fm.repo } : {}),
    }))
  } catch {
    return []
  }
}

export async function loadCvSource(lang: CvLang, now: string = referenceMonth()): Promise<CvSource> {
  const { readPublicCvSections } = await import('./cvdata')
  const { getKvMeta } = await import('./contentStore')
  const { readPublicHome } = await import('./home')
  const works = await publishedWorks()
  const home = safe(() => readPublicHome(), undefined)
  const socials: PublicSocials | null | undefined = home === undefined ? undefined : ((home?.socials as PublicSocials | undefined) ?? null)
  const headerExtras = safe(() => cvHeaderExtras(home?.availability, lang), null)
  const langs: CvLang[] = lang === 'en' ? ['en'] : ['en', 'zh']
  const cv = safe(() => readPublicCvSections('cv', SHEET_SECTIONS, langs), { en: [], zh: [] })
  const raw = lang === 'en' ? cv.en : cv.zh
  return {
    lang,
    sections: withEvidenceLinks(raw, { works, socials }),
    enPersonal: cv.en.find((s) => s.sessionName === 'personalInformation') ?? null,
    updatedAt: safe(() => getKvMeta('cvdata')?.updatedAt ?? 0, 0),
    now,
    works,
    socials,
    headerExtras,
  }
}
