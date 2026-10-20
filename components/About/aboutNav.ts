/**
 * The /about section nav (pure, client-safe; unit tested): one entry per
 * block the page renders, in page order — the owner's bio when written, the
 * recommendations when one may be shown, then each CV section that has at
 * least one visible entry. Ids match the anchors the page sets (`about-bio`,
 * `about-recommendations`, `about-<sessionName>`).
 */

import { list } from '../CVViewerPage/fields'
import { PERSON_NAME } from '../../lib/schema'
import { fillUi } from '../../lib/uiStrings'
import { ABOUT_EN, type AboutStrings } from '../../lib/uiStrings/about'
import type { HeroIdentity } from '../LandingPage/heroIdentity'

export type AboutNavEntry = { id: string; label: string; lang?: string }

/**
 * The h1 of /about: the public identity name (website-pruned CV, same rule
 * as the home hero), then the nickname, then the site-wide person name. On
 * /zh/about (`zh`, F3) the Chinese name leads when the CV shows one.
 */
export function aboutHeading(identity: HeroIdentity | null | undefined, zh = false): string {
  if (zh && identity?.nameZh) return identity.nameZh
  return identity?.name || identity?.nick || PERSON_NAME
}

/** "1 paper" / "3 papers" ("3 篇论文") — the count the rail's Publications link names (and screen readers hear). */
export function paperCount(n: number, t: Pick<AboutStrings['rail'], 'paperOne' | 'paperMany'> = ABOUT_EN.rail): string {
  return n === 1 ? t.paperOne : fillUi(t.paperMany, { n })
}

/** The list each CV section's entries live in (a section without entries renders nothing). */
const ENTRY_KEYS: Record<string, readonly string[]> = {
  education: ['educationExperience'],
  workExperience: ['experiences'],
  project: ['projectExperience'],
  patents: ['patentExperience'],
  competitionAwards: ['awards'],
  skill: ['technical', 'languages'],
  extraSkill: ['points'],
  certification: ['certifications'],
}


/** True when the section has at least one visible entry (string lists count non-blank items). */
export function cvSectionHasEntries(section: { sessionName?: unknown; [key: string]: unknown } | null | undefined): boolean {
  const keys = ENTRY_KEYS[String(section?.sessionName)] || []
  return keys.some((k) => {
    const raw = section?.[k]
    if (Array.isArray(raw) && raw.some((v) => typeof v === 'string' && v.trim())) return true
    return list(section, k).length > 0
  })
}

/** "WORK EXPERIENCE" → "Work experience"; mixed-case and non-Latin names stay as written; a blank one is `fallback`'s. */
export function navLabel(headerName: unknown, sessionName: string, fallback: Readonly<Record<string, string>> = ABOUT_EN.sections): string {
  const raw = typeof headerName === 'string' ? headerName.trim() : ''
  if (!raw) return fallback[sessionName] || sessionName
  if (/[A-Z]/.test(raw) && raw === raw.toUpperCase() && /^[\x20-\x7e]+$/.test(raw)) return raw.charAt(0) + raw.slice(1).toLowerCase()
  return raw
}

/**
 * The nav for the page: bio first (when written), recommendations (when
 * shown), then the rendered CV sections. `lang` is the CV's language, `t`
 * the page's words (English by default); on /zh/about (`zh`, F3) the
 * Chinese CV's entries need no lang and the English CV's are marked "en".
 */
export function aboutNavEntries(
  sections: ReadonlyArray<{ sessionName?: unknown; headerName?: unknown; [key: string]: unknown }>,
  opts: { hasBio: boolean; hasRecommendations?: boolean; lang?: 'en' | 'zh'; t?: AboutStrings; zh?: boolean },
): AboutNavEntry[] {
  const t = opts.t ?? ABOUT_EN
  const out: AboutNavEntry[] = []
  if (opts.hasBio) out.push({ id: 'about-bio', label: t.bio })
  if (opts.hasRecommendations) out.push({ id: 'about-recommendations', label: t.recommendations })
  // A section without its own heading is named in the CV's language.
  const fallback = opts.lang === 'zh' ? (opts.zh ? t.sections : null) : opts.zh ? null : t.sections
  for (const s of sections) {
    const name = String(s?.sessionName || '')
    if (!name || !cvSectionHasEntries(s)) continue
    const entry: AboutNavEntry = { id: `about-${name}`, label: navLabel(s.headerName, name, fallback ?? undefined) }
    const cvLang = opts.lang === 'zh' ? 'zh-Hans' : 'en'
    if (cvLang !== (opts.zh ? 'zh-Hans' : 'en')) entry.lang = cvLang
    out.push(entry)
  }
  return out
}
