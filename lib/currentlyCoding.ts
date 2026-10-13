/**
 * Derive the hero's "currently coding" chip from CV data so the owner doesn't
 * have to retype it every time a role changes.
 *
 * The chip only ever names something that is current in the reference month
 * (the page's 'YYYY-MM', lib/clock.ts), judged from the dates the visitor
 * can see — the same rule as the /now page's "Currently" list
 * (components/CVViewerPage/fields entryStatus):
 *
 *   1. a running work role (the earliest-started one if several — usually
 *      the main job rather than a side internship)
 *        → "currently coding" · company · job title
 *   2. otherwise a running study
 *        → "currently studying" · school · degree
 *   3. otherwise nothing: every line is blank and the chip is hidden.
 *
 * A role that has ended is never named, and no "since YYYY" line is derived:
 * a year next to a company name reads as "there since", which the CV does
 * not say.
 *
 * Every renderer — the home hero, /now (lib/nowSignals.ts) and the Home
 * editor's preview (/api/admin/cv-derived) — combines the owner's Home editor
 * lines with this chip through mergeCurrentlyCoding(), so they agree.
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

import { majorAddsInfo, type CvNow } from './cvFormat'
import { isSectionOnWebsite } from './cvVisibility'
import { entryStatus, field, joinParts, list } from '../components/CVViewerPage/fields'

export type CurrentlyCoding = { label: string; project: string; note: string }

/** Label of a chip that names a work role (and the default for an owner-named project). */
export const CODING_LABEL = 'currently coding'
/** Label of a chip that names a study. */
export const STUDYING_LABEL = 'currently studying'

type CvSection = { sessionName?: string } & Record<string, unknown>

const EMPTY: CurrentlyCoding = { label: '', project: '', note: '' }

function websiteSection(cv: readonly CvSection[], name: string): CvSection | undefined {
  return cv.find((s) => s?.sessionName === name && isSectionOnWebsite(s))
}

/** "YYYY-MM" sort key of a start date; entries without a visible start sort last. */
function startKey(entry: unknown): string {
  const m = field(entry, 'startDate').match(/^(\d{4})(?:[-/.](\d{1,2}))?/)
  return m ? `${m[1]}-${(m[2] || '01').padStart(2, '0')}` : '9999-99'
}

/** Visible entries of a website section's list that are running now, earliest start first (CV order breaks ties). */
function runningEntries(cv: readonly CvSection[], sectionName: string, listKey: string, now: CvNow): any[] {
  return list(websiteSection(cv, sectionName), listKey)
    .filter((e) => entryStatus(e, now) === 'current')
    .map((e, i) => ({ e, i, key: startKey(e) }))
    .sort((a, b) => a.key.localeCompare(b.key) || a.i - b.i)
    .map(({ e }) => e)
}

/**
 * The CV-derived chip, or all-blank lines when nothing is current.
 * `now` is the page's reference month ('YYYY-MM') or a Date.
 */
export function deriveCurrentlyCoding(cvEn: readonly CvSection[] | undefined | null, now: CvNow = new Date()): CurrentlyCoding {
  if (!Array.isArray(cvEn) || cvEn.length === 0) return EMPTY

  // The chip is sized for one short line per field: the organisation leads,
  // the role sits in the small note line.
  for (const job of runningEntries(cvEn, 'workExperience', 'experiences', now)) {
    const company = field(job, 'companyName')
    const title = field(job, 'jobTitle')
    if (company || title) return { label: CODING_LABEL, project: company || title, note: company ? title : '' }
  }

  for (const study of runningEntries(cvEn, 'education', 'educationExperience', now)) {
    const school = field(study, 'schoolName')
    const degree = field(study, 'degree')
    const title = joinParts([degree, majorAddsInfo(degree, field(study, 'major')) ? field(study, 'major') : ''], ', ')
    if (school || title) return { label: STUDYING_LABEL, project: school || title, note: school ? title : '' }
  }

  return EMPTY
}

const own = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * The chip a visitor sees: the owner's Home editor lines merged with the
 * CV-derived chip.
 *
 *   - The owner named a project: only their lines are used (a blank label
 *     becomes "currently coding"). The derived label and note describe the
 *     CV's item, so they are never attached to the owner's project.
 *   - Otherwise the derived chip, with any line the owner typed replacing
 *     the derived one.
 *   - Nothing derived either: just the owner's label / note, if any (all
 *     blank hides the chip).
 */
export function mergeCurrentlyCoding(
  manual: Partial<CurrentlyCoding> | null | undefined,
  derived: Partial<CurrentlyCoding> | null | undefined,
): CurrentlyCoding {
  const label = own(manual?.label)
  const project = own(manual?.project)
  const note = own(manual?.note)
  if (project) return { label: label || CODING_LABEL, project, note }
  const derivedProject = own(derived?.project)
  if (derivedProject) return { label: label || own(derived?.label), project: derivedProject, note: note || own(derived?.note) }
  return { label, project: '', note }
}
