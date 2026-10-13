/**
 * The /about section nav (pure, client-safe; unit tested): one entry per
 * block the page renders, in page order — the owner's bio when written, then
 * each CV section that has at least one visible entry. Ids match the anchors
 * the page sets (`about-bio`, `about-<sessionName>`).
 */

import { list } from '../CVViewerPage/fields'
import { PERSON_NAME } from '../../lib/schema'
import type { HeroIdentity } from '../LandingPage/heroIdentity'

export type AboutNavEntry = { id: string; label: string; lang?: string }

/**
 * The h1 of /about: the public identity name (website-pruned CV, same rule
 * as the home hero), then the nickname, then the site-wide person name.
 */
export function aboutHeading(identity: HeroIdentity | null | undefined): string {
  return identity?.name || identity?.nick || PERSON_NAME
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

const FALLBACK_LABEL: Record<string, string> = {
  education: 'Education',
  workExperience: 'Experience',
  project: 'Projects',
  patents: 'Patents',
  competitionAwards: 'Awards',
  skill: 'Skills',
  extraSkill: 'More skills',
  certification: 'Certifications',
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

/** "WORK EXPERIENCE" → "Work experience"; mixed-case and non-Latin names stay as written. */
export function navLabel(headerName: unknown, sessionName: string): string {
  const raw = typeof headerName === 'string' ? headerName.trim() : ''
  if (!raw) return FALLBACK_LABEL[sessionName] || sessionName
  if (/[A-Z]/.test(raw) && raw === raw.toUpperCase() && /^[\x20-\x7e]+$/.test(raw)) return raw.charAt(0) + raw.slice(1).toLowerCase()
  return raw
}

/** The nav for the page: bio first (when written), then the rendered CV sections. */
export function aboutNavEntries(
  sections: ReadonlyArray<{ sessionName?: unknown; headerName?: unknown; [key: string]: unknown }>,
  opts: { hasBio: boolean; lang?: 'en' | 'zh' },
): AboutNavEntry[] {
  const out: AboutNavEntry[] = []
  if (opts.hasBio) out.push({ id: 'about-bio', label: 'Bio' })
  for (const s of sections) {
    const name = String(s?.sessionName || '')
    if (!name || !cvSectionHasEntries(s)) continue
    const entry: AboutNavEntry = { id: `about-${name}`, label: navLabel(s.headerName, name) }
    if (opts.lang === 'zh') entry.lang = 'zh-Hans'
    out.push(entry)
  }
  return out
}
