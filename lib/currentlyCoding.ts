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
 */

export type CurrentlyCoding = { label: string; project: string; note: string }

type CvSection = { sessionName?: string } & Record<string, unknown>

const EMPTY: CurrentlyCoding = { label: '', project: '', note: '' }

function pickSection<T extends string>(cv: CvSection[] | undefined | null, name: T): any {
  if (!Array.isArray(cv)) return undefined
  return cv.find((s) => s?.sessionName === name)
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

function isOngoing(endDate: unknown): boolean {
  if (endDate == null) return true
  if (typeof endDate === 'string') {
    const t = endDate.trim().toLowerCase()
    if (!t || t === 'now' || t === 'present' || t === 'current' || t === '至今' || t === '现在')
      return true
  }
  return false
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
    if (isOngoing(e?.endDate)) return true
    const end = ymKey(e?.endDate)
    return end && end >= today
  })

  if (active.length > 0) {
    return [...active].sort((a, b) => ymKey(a?.startDate).localeCompare(ymKey(b?.startDate)))[0]
  }

  return [...experiences].sort((a, b) => ymKey(b?.endDate).localeCompare(ymKey(a?.endDate)))[0]
}

export function deriveCurrentlyCoding(
  cvEn: CvSection[] | undefined | null,
): CurrentlyCoding {
  if (!Array.isArray(cvEn) || cvEn.length === 0) return EMPTY

  const work = pickSection(cvEn, 'workExperience')?.experiences as any[] | undefined
  const projects = pickSection(cvEn, 'project')?.projectExperience as any[] | undefined
  const education = pickSection(cvEn, 'education')?.educationExperience as any[] | undefined

  // ── (b) project line ────────────────────────────────────────────────
  // Most-relevant current job's company. Avoid bolting on the full job
  // title (e.g. "WeGreen AI · CTO & Co-Founder") because the chip is
  // sized for a single short line; the admin can paste a richer string
  // manually if they want it.
  const current = pickCurrentJob(work)
  let project = ''
  if (current?.companyName && typeof current.companyName === 'string') {
    project = current.companyName.trim()
  }

  // ── (c) note line ───────────────────────────────────────────────────
  // Earliest dated entry across work + projects + education → "since YYYY".
  // Preserves the spirit of the original hard-coded "self-taught · since 2022"
  // without inventing personal narrative that isn't in the CV.
  const years: number[] = []
  for (const e of work || []) {
    const y = yearOf(e?.startDate)
    if (y) years.push(y)
  }
  for (const p of projects || []) {
    const y = yearOf(p?.startDate)
    if (y) years.push(y)
  }
  for (const e of education || []) {
    const y = yearOf(e?.startDate)
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
