/**
 * Derive a "currently coding" chip from CV data so the admin doesn't have
 * to retype it every time the latest job changes.
 *
 * The renderer (components/LandingPage/PersonalInfo.tsx) merges the admin's
 * manual home.json fields with this derived fallback per-line:
 *
 *     final[line] = (admin[line].trim()) || derived[line] || ''
 *
 * i.e. anything the admin typed wins; blank fields auto-fill from the CV;
 * if both are blank the line is omitted (chip hides when all three are empty).
 *
 * Pure / sync / no side-effects so it runs identically on server and client.
 *
 * Visibility-aware: it accepts either the pruned public view or the full
 * editor document. Anything the owner hid — a website-hidden section, a
 * hidden entry, or a hidden field (pruned `redacted` marker or full-doc
 * `hiddenFields`) — is treated as absent. In particular a hidden end date is
 * "unknown", never "still ongoing", so it cannot turn a past job into the
 * current one or leak through the derived chip.
 */

import { isPresent } from './cvFormat'
import { isEntryHidden, isRedacted, isSectionOnWebsite } from './cvVisibility'

export type CurrentlyCoding = { label: string; project: string; note: string }

type CvSection = { sessionName?: string } & Record<string, unknown>

const EMPTY: CurrentlyCoding = { label: '', project: '', note: '' }

function pickSection<T extends string>(cv: CvSection[] | undefined | null, name: T): any {
  if (!Array.isArray(cv)) return undefined
  return cv.find((s) => s?.sessionName === name && isSectionOnWebsite(s))
}

/** Visible entries of a section's list (the list itself may be hidden). */
function visibleEntries(section: any, listKey: string): any[] {
  if (!section || isRedacted(section, listKey)) return []
  const list = section[listKey]
  return Array.isArray(list) ? list.filter((e) => e && typeof e === 'object' && !isEntryHidden(e)) : []
}

/** A field's value, or undefined when the owner hid it. */
function field(entry: any, key: string): unknown {
  return isRedacted(entry, key) ? undefined : entry?.[key]
}

/** Parse "YYYY-MM" or "YYYY-MM-DD" → YYYY (number) or null. */
function yearOf(s: unknown): number | null {
  if (typeof s !== 'string') return null
  const m = s.match(/^\s*(\d{4})/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** "YYYY-MM" comparable string (zero-pad). Returns '' if input doesn't parse. */
function ymKey(s: unknown): string {
  if (typeof s !== 'string') return ''
  const m = s.match(/^\s*(\d{4})[-/]?(\d{1,2})?/)
  if (!m) return ''
  const y = m[1]
  const mo = (m[2] || '01').padStart(2, '0')
  return `${y}-${mo}`
}

/** Today as "YYYY-MM". */
function todayYm(now = new Date()): string {
  const y = String(now.getUTCFullYear())
  const mo = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${mo}`
}

function isOngoing(entry: any): boolean {
  // A hidden end date is unknown, not "present".
  if (isRedacted(entry, 'endDate')) return false
  const endDate = entry?.endDate
  if (endDate == null) return true
  return typeof endDate === 'string' && (endDate.trim() === '' || isPresent(endDate))
}

/**
 * Pick the "current" workExperience:
 *
 *   1. Prefer entries whose endDate is empty / "present" / "now" / future.
 *      If multiple are still active, pick the one with the earliest startDate
 *      (i.e. the longest-running active role — typically the operator's main
 *      gig rather than a side internship).
 *   2. Fallback: the entry whose endDate is the most recent (last job held).
 *   3. Return null if no experiences exist at all.
 */
function pickCurrentJob(experiences: any[] | undefined, today = todayYm()): any | null {
  if (!Array.isArray(experiences) || experiences.length === 0) return null

  const active = experiences.filter((e) => {
    if (isOngoing(e)) return true
    const end = ymKey(field(e, 'endDate'))
    return end && end >= today
  })

  if (active.length > 0) {
    return [...active].sort((a, b) => ymKey(field(a, 'startDate')).localeCompare(ymKey(field(b, 'startDate'))))[0]
  }

  return [...experiences].sort((a, b) => ymKey(field(b, 'endDate')).localeCompare(ymKey(field(a, 'endDate'))))[0]
}

export function deriveCurrentlyCoding(
  cvEn: CvSection[] | undefined | null,
): CurrentlyCoding {
  if (!Array.isArray(cvEn) || cvEn.length === 0) return EMPTY

  const work = visibleEntries(pickSection(cvEn, 'workExperience'), 'experiences')
  const projects = visibleEntries(pickSection(cvEn, 'project'), 'projectExperience')
  const education = visibleEntries(pickSection(cvEn, 'education'), 'educationExperience')

  // ── (b) project line ────────────────────────────────────────────────
  // Most-relevant current job's company. Avoid bolting on the full job
  // title (e.g. "WeGreen AI · CTO & Co-Founder") because the chip is
  // sized for a single short line; the admin can paste a richer string
  // manually if they want it.
  const current = pickCurrentJob(work)
  const company = current ? field(current, 'companyName') : undefined
  const project = typeof company === 'string' ? company.trim() : ''

  // ── (c) note line ───────────────────────────────────────────────────
  // Earliest dated entry across work + projects + education → "since YYYY".
  // Preserves the spirit of the original hard-coded "self-taught · since 2022"
  // without inventing personal narrative that isn't in the CV.
  const years: number[] = []
  for (const e of [...work, ...projects, ...education]) {
    const y = yearOf(field(e, 'startDate'))
    if (y) years.push(y)
  }
  let note = ''
  if (years.length > 0) {
    const min = years.reduce((a, b) => (b < a ? b : a), years[0])
    note = `since ${min}`
  }

  // ── (a) label ──────────────────────────────────────────────────────
  // Static. Kept as a derived "default" so the admin can override
  // (e.g. "now working on" / "shipping").
  return {
    label: 'currently coding',
    project,
    note,
  }
}
