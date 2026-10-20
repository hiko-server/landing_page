/**
 * Pure, client-safe shape + helpers for HomeData.
 *
 * **Why a separate file:** `lib/home.ts` imports the SQLite + R2 content
 * store, which only resolves in a Node runtime. Anything client-bundled
 * (every component under `components/` once it ships to the browser)
 * that needs even a type or constant from HomeData must import from
 * THIS module instead — otherwise webpack drags `better-sqlite3` into
 * the client bundle and the build fails with `Module not found: fs`.
 *
 * Keep this file pure: no `fs`, no `path`, no DB, no R2, no environment
 * peeks. Just types, constants, and small synchronous helpers that run
 * the same on server and client.
 */

import type { LogoMetrics } from './logoSize'
import {
  HIGHLIGHT_LIMITS,
  isHighlightHref,
  isHttpsUrl,
  resolveSectionOrder,
  visibleHighlights,
  type SortableSectionKey,
} from './homeSections'

/**
 * Kinds of contact inquiry (lib/inquiry.ts builds the form behaviour on
 * them). Declared here so the home document's validation needs no more than
 * this file — the home page bundles homeShape, not the inquiry model.
 */
export const INQUIRY_INTENTS = ['role', 'freelance', 'collab', 'other'] as const
export type InquiryIntent = (typeof INQUIRY_INTENTS)[number]

export function isInquiryIntent(v: unknown): v is InquiryIntent {
  return typeof v === 'string' && (INQUIRY_INTENTS as readonly string[]).includes(v)
}

/**
 * The owner's reason → kind mapping restricted to the given reasons, without
 * 'other' values (the default) — what is stored in home.contact.intents.
 */
export function cleanIntentMap(reasons: readonly string[], intents: unknown): Record<string, InquiryIntent> {
  const out: Record<string, InquiryIntent> = {}
  if (!intents || typeof intents !== 'object' || Array.isArray(intents)) return out
  const src = intents as Record<string, unknown>
  for (const r of reasons) {
    const key = typeof r === 'string' ? r.trim() : ''
    const v = src[key]
    if (key && isInquiryIntent(v) && v !== 'other') out[key] = v
  }
  return out
}

export type HomeData = {
  hero: {
    welcome: string
    brand: string
    tagline: string
    avatarUrl: string
    phone?: string
    email?: string
    /** Object-position (x,y in %) + scale, set by the admin Home GUI's
     *  drag-to-position avatar editor. Used by PersonalInfo and the home
     *  card. Stored as JSON in data/home.json. */
    avatarTransform?: {
      x?: number
      y?: number
      scale?: number
    }
    /**
     * Three-line "currently coding" chip rendered under the avatar in the
     * intro section. Fully optional — when every field is empty the chip
     * is suppressed in the UI. Used to be hard-coded; lifted to home.json
     * so the admin can change "WeGreen AI · COT / self-taught · since 2022"
     * without redeploying.
     */
    currentlyCoding?: {
      /** Tiny label above the project line, e.g. "currently coding" */
      label?: string
      /** Bold project line, e.g. "WeGreen AI · COT" */
      project?: string
      /** Muted footer line, e.g. "self-taught · since 2022" */
      note?: string
    }
  }
  socials: {
    github?: string
    gitlab?: string
    linkedin?: string
    whatsapp?: string
  }
  brands: HomeBrand[]
  quickAccess: { label: string; url: string }[]
  photos?: { url: string; describe?: string; redirectTo?: string; visible?: boolean }[]
  /**
   * Per-section visibility for the home page. Each key maps to one of the
   * [NN] sections rendered by `components/LandingPage/{LandingContent,
   * Content,PersonalInfo}.tsx`. Omitted keys default to **visible** so a
   * fresh install (or a JSON written by an older admin build) keeps the
   * full page rather than silently hiding sections.
   *
   * Use the SectionKey union — strings prevent typos drifting between
   * renderer and editor.
   */
  sections?: Partial<Record<SectionKey, boolean>>
  /**
   * Order of the numbered home sections ([02]…), set in the Home editor
   * (drag to sort, or the "Recruiter-first" preset). Absent = the built-in
   * order (DEFAULT_SECTION_ORDER). Always read through `resolveSectionOrder`:
   * unknown keys are dropped and sections missing from a stored order (e.g.
   * one added in a later release) are inserted at their default place, so an
   * older document never hides a section.
   */
  sectionOrder?: SortableSectionKey[]
  /**
   * The proof strip under the hero: up to four owner-written highlights, each
   * linking to where it comes from (a CV entry, a case study, an external
   * page). Nothing renders until the owner saves at least one; the editor
   * only *suggests* tiles built verbatim from the public CV.
   */
  highlights?: HomeHighlight[]
  /**
   * Editable contact-form copy + reasons dropdown options. Was hard-coded
   * in `components/Contact/ContactPro.tsx`; lifted here so an operator
   * can tune the heading / blurb / reasons without a redeploy. All fields
   * optional — the renderer falls back to sane defaults when blank.
   */
  contact?: {
    /** Right-column heading on the contact panel. Overrides hero.brand. */
    heading?: string
    /** One-line blurb under the heading (e.g. response-time promise). */
    blurb?: string
    /** Eyebrow mono label above the heading. */
    eyebrow?: string
    /** Dropdown choices. Empty array hides the dropdown entirely. */
    reasons?: string[]
    /**
     * Kind of inquiry behind each custom reason (reason label → intent); it
     * decides which structured fields the form discloses (lib/inquiry.ts).
     * Reasons without an entry are 'other'. Ignored while `reasons` is empty
     * (the built-in reasons have a built-in mapping).
     */
    intents?: Record<string, InquiryIntent>
  }
  /**
   * Work availability shown on the contact page and in the command palette.
   * Absent = no availability UI anywhere (never a guessed default).
   */
  availability?: HomeAvailability
  /** Owner-curated open-source picks for the home page's [02] section. */
  openSource?: HomeOpenSource
  /** Site-wide identity overrides. */
  site?: HomeSite
}

/**
 * One logo of the brand strip. `scale` multiplies the rendered logo size
 * (0.5–2); `metrics` (content box, aspect, ink density) is measured by the
 * server when the document is saved (lib/logoMetrics.ts) and sizes the logo
 * optically (lib/logoSize.ts).
 */
export type HomeBrand = { name: string; href: string; image: string; scale?: number; metrics?: LogoMetrics }

export const AVAILABILITY_STATUSES = ['open', 'limited', 'closed'] as const
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number]

export type HomeAvailability = {
  status: AvailabilityStatus
  /** Short English label, e.g. "Open to senior frontend roles". */
  label?: string
  /** Chinese label for zh pages. */
  label_zh?: string
  roles?: string[]
  /** Available from, `YYYY-MM`. */
  from?: string
  /** https:// booking link (Cal.com, Calendly, …). */
  bookingUrl?: string
  /**
   * Job intent on the Chinese CV (求职意向): target roles in Chinese and the
   * city. Shown on /cv/zh with `from` as the start date (到岗时间), only when
   * filled and the status is not 'closed'.
   */
  roles_zh?: string[]
  city_zh?: string
  /**
   * Right-to-work line in the owner's own words (e.g. "Hong Kong permanent
   * resident — no sponsorship needed"), English and Chinese. Shown on the
   * contact availability card and the CV header when filled; never part of
   * JSON-LD or the vCard, and never inferred.
   */
  workStatus?: string
  workStatus_zh?: string
  /** ms epoch of the last availability edit. */
  updatedAt?: number
}

export type HomeFeaturedRepo = { name: string; blurb?: string }

export type HomeOpenSource = {
  /** Repos pinned in this order; `name` is the GitHub repo name (or owner/name). */
  featured?: HomeFeaturedRepo[]
  /** Show stars / forks totals next to the repos. */
  showVanityStats?: boolean
}

export type HomeSite = {
  /** Display name used across the site; empty = the built-in person name. */
  name?: string
}

/** One tile of the proof strip under the hero. */
export type HomeHighlight = {
  /** The figure or headline, e.g. "18th worldwide". */
  value: string
  /** What it is, e.g. "IEEEXtreme 19.0 global programming competition". */
  label: string
  /** Where it comes from: a site path (/cv#…, /work/…) or an https:// URL. */
  href: string
}

/** Limits enforced on write (lib/home) and mirrored by the admin editor. */
export const HOME_LIMITS = {
  brandScaleMin: 0.5,
  brandScaleMax: 2,
  brandScaleStep: 0.05,
  featuredMax: 12,
  featuredBlurbMax: 140,
  repoNameMax: 100,
  availabilityLabelMax: 120,
  rolesMax: 12,
  roleMax: 60,
  cityMax: 60,
  workStatusMax: 160,
  siteNameMax: 80,
  ...HIGHLIGHT_LIMITS,
} as const

/**
 * Stable ID for every home-page section (the [NN] labels are numbered at
 * render time from the visible sections). Keep this in sync with the
 * `HOME_SECTION_META` table below — the home renderer + admin editor both
 * import this so the two views can't drift.
 */
export type SectionKey =
  | 'introduction' // PersonalInfo (hero)
  | 'highlights'   // ProofStrip (owner-saved highlights) under the hero
  | 'brands'       // brand strip under hero
  | 'open-source'  // StatsBar + contribution graph + language stack + pinned repos
  | 'tech-stack'   // Skills (from the CV)
  | 'activity'     // ActivityFeed
  | 'projects'     // ProjectSpotlight
  | 'publications' // SelectedPublications (public papers from the CV; hidden while there is none)
  | 'experience'   // ExperienceTimeline
  | 'certifications' // CertificationsPeek
  | 'photos'       // Field Notes photo strip
  | 'contact'      // availability + "Write to me" (the form lives on /contact)
  | 'writing'      // latest posts + case studies

/** Display metadata for each section — drives the admin checkboxes. */
export const HOME_SECTION_META: Array<{ key: SectionKey; label: string; hint: string }> = [
  { key: 'introduction', label: 'Introduction', hint: 'hero + avatar + CTAs' },
  { key: 'highlights', label: 'Highlights', hint: 'proof strip under the hero, once you save highlights' },
  { key: 'brands', label: 'Brand strip', hint: 'logo row under hero' },
  { key: 'open-source', label: 'Open source', hint: 'GitHub stats, contribution graph, languages, pinned repos' },
  { key: 'tech-stack', label: 'Skills', hint: 'skills from your CV' },
  { key: 'activity', label: 'Recent activity', hint: 'GitHub event feed' },
  { key: 'projects', label: 'Selected projects', hint: 'horizontal spotlight' },
  { key: 'publications', label: 'Selected publications', hint: 'top papers from /publications, once one is public' },
  { key: 'experience', label: 'Experience', hint: 'CV timeline' },
  { key: 'certifications', label: 'Certifications', hint: 'certifications from your CV' },
  { key: 'photos', label: 'Field notes', hint: 'full-width photo strip' },
  { key: 'contact', label: 'Contact', hint: 'availability + “Write to me” (the form is on /contact)' },
  { key: 'writing', label: 'Writing & case studies', hint: 'latest posts and case studies' },
]

// The read side (section visibility and order, complete highlights) lives in
// lib/homeSections so the public home page can import it without the
// write-time validation below; re-exported here for everything else.
export {
  DEFAULT_SECTION_ORDER,
  FIXED_SECTION_KEYS,
  HIGHLIGHT_LIMITS,
  RECRUITER_SECTION_ORDER,
  isHighlightHref,
  isHttpsUrl,
  isSameOrder,
  isSectionVisible,
  isSortableSectionKey,
  resolveSectionOrder,
  visibleHighlights,
} from './homeSections'
export type { SortableSectionKey } from './homeSections'

/**
 * The home document as visitors may see it. Pure (runs on server and client).
 *
 * Content that the owner switched off never leaves the server:
 *   - photos with `visible: false` are dropped
 *   - a section switched off in `sections` has the data that feeds only that
 *     section emptied (brand strip, field-note photos, highlights);
 *     incomplete highlights are dropped
 * The `sections` map itself is kept so renderers know what to skip.
 * `availability`, `openSource` and `site` are public by design and pass
 * through unchanged.
 */
export function publicHome(home: HomeData | null | undefined): HomeData | null {
  if (!home || typeof home !== 'object') return null
  const off = (key: SectionKey) => home.sections?.[key] === false
  const photos = Array.isArray(home.photos) ? home.photos.filter((p) => p && p.visible !== false) : []
  return {
    ...home,
    brands: off('brands') ? [] : Array.isArray(home.brands) ? home.brands : [],
    photos: off('photos')
      ? []
      : photos.map((p) => {
          const rest = { ...p }
          delete rest.visible
          return rest
        }),
    // The contact copy (kept by the spread above) belongs to the form on
    // /contact: switching off the home page's contact band must not reset
    // that page to its defaults. Never set it to `undefined` here — a home
    // document without a contact block must stay serialisable as page props.
    ...(home.highlights !== undefined ? { highlights: off('highlights') ? [] : visibleHighlights(home.highlights) } : {}),
  }
}


// ── Write-time validation of the owner-editable extras ─────────────────────

export type HomeFieldError = { path: string; message: string }

/** `YYYY-MM` with a real month. */
export function isYearMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** GitHub repo name, optionally `owner/name`. */
export function isRepoName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= HOME_LIMITS.repoNameMax &&
    /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)?$/.test(value)
  )
}

/** Snap a logo scale to the editor's step inside the allowed range. */
export function snapBrandScale(value: number): number {
  const { brandScaleMin: min, brandScaleMax: max, brandScaleStep: step } = HOME_LIMITS
  const snapped = Math.round(Math.min(max, Math.max(min, value)) / step) * step
  return Math.round(snapped * 100) / 100
}

const trimmed = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function normalizeAvailability(
  input: unknown,
  errors: HomeFieldError[],
  now: number,
): HomeAvailability | undefined {
  if (input === undefined || input === null) return undefined
  if (typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ path: 'availability', message: 'Availability must be an object.' })
    return undefined
  }
  const a = input as Record<string, unknown>
  if (!(AVAILABILITY_STATUSES as readonly unknown[]).includes(a.status)) {
    errors.push({ path: 'availability.status', message: 'Status must be open, limited or closed.' })
    return undefined
  }
  const out: HomeAvailability = { status: a.status as AvailabilityStatus }
  for (const key of ['label', 'label_zh'] as const) {
    if (a[key] === undefined || a[key] === null) continue
    if (typeof a[key] !== 'string') {
      errors.push({ path: `availability.${key}`, message: 'Must be text.' })
      continue
    }
    const v = trimmed(a[key])
    if (v.length > HOME_LIMITS.availabilityLabelMax) {
      errors.push({ path: `availability.${key}`, message: `Keep it under ${HOME_LIMITS.availabilityLabelMax} characters.` })
    } else if (v) out[key] = v
  }
  for (const key of ['roles', 'roles_zh'] as const) {
    const list = a[key]
    if (list === undefined || list === null) continue
    if (!Array.isArray(list) || list.some((r) => typeof r !== 'string')) {
      errors.push({ path: `availability.${key}`, message: 'Roles must be a list of text.' })
    } else {
      const roles = Array.from(new Set(list.map((r: string) => r.trim()).filter(Boolean)))
      if (roles.length > HOME_LIMITS.rolesMax) {
        errors.push({ path: `availability.${key}`, message: `At most ${HOME_LIMITS.rolesMax} roles.` })
      } else if (roles.some((r) => r.length > HOME_LIMITS.roleMax)) {
        errors.push({ path: `availability.${key}`, message: `Each role must be under ${HOME_LIMITS.roleMax} characters.` })
      } else if (roles.length) out[key] = roles
    }
  }
  const lines: Array<['city_zh' | 'workStatus' | 'workStatus_zh', number]> = [
    ['city_zh', HOME_LIMITS.cityMax],
    ['workStatus', HOME_LIMITS.workStatusMax],
    ['workStatus_zh', HOME_LIMITS.workStatusMax],
  ]
  for (const [key, max] of lines) {
    if (a[key] === undefined || a[key] === null) continue
    if (typeof a[key] !== 'string') {
      errors.push({ path: `availability.${key}`, message: 'Must be text.' })
      continue
    }
    const v = trimmed(a[key]).replace(/[\r\n]+/g, ' ')
    if (v.length > max) errors.push({ path: `availability.${key}`, message: `Keep it under ${max} characters.` })
    else if (v) out[key] = v
  }
  const from = trimmed(a.from)
  if (from) {
    if (isYearMonth(from)) out.from = from
    else errors.push({ path: 'availability.from', message: 'Use the YYYY-MM format.' })
  } else if (a.from !== undefined && a.from !== null && typeof a.from !== 'string') {
    errors.push({ path: 'availability.from', message: 'Use the YYYY-MM format.' })
  }
  const booking = trimmed(a.bookingUrl)
  if (booking) {
    if (isHttpsUrl(booking)) out.bookingUrl = booking
    else errors.push({ path: 'availability.bookingUrl', message: 'The booking link must be a full https:// URL.' })
  } else if (a.bookingUrl !== undefined && a.bookingUrl !== null && typeof a.bookingUrl !== 'string') {
    errors.push({ path: 'availability.bookingUrl', message: 'The booking link must be a full https:// URL.' })
  }
  out.updatedAt =
    typeof a.updatedAt === 'number' && Number.isFinite(a.updatedAt) && a.updatedAt > 0 ? Math.trunc(a.updatedAt) : now
  return out
}

function normalizeOpenSource(input: unknown, errors: HomeFieldError[]): HomeOpenSource | undefined {
  if (input === undefined || input === null) return undefined
  if (typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ path: 'openSource', message: 'Open source settings must be an object.' })
    return undefined
  }
  const o = input as Record<string, unknown>
  const out: HomeOpenSource = {}
  if (o.featured !== undefined && o.featured !== null) {
    if (!Array.isArray(o.featured)) {
      errors.push({ path: 'openSource.featured', message: 'Featured repos must be a list.' })
    } else {
      if (o.featured.length > HOME_LIMITS.featuredMax) {
        errors.push({ path: 'openSource.featured', message: `Feature at most ${HOME_LIMITS.featuredMax} repos.` })
      }
      const seen = new Set<string>()
      const featured: HomeFeaturedRepo[] = []
      o.featured.slice(0, HOME_LIMITS.featuredMax).forEach((raw: unknown, i: number) => {
        const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
        const name = trimmed(item?.name)
        if (!isRepoName(name)) {
          errors.push({ path: `openSource.featured.${i}.name`, message: 'Enter a GitHub repository name (letters, digits, . _ -).' })
          return
        }
        const key = name.toLowerCase()
        if (seen.has(key)) return
        seen.add(key)
        const entry: HomeFeaturedRepo = { name }
        if (item?.blurb !== undefined && item?.blurb !== null) {
          if (typeof item.blurb !== 'string') {
            errors.push({ path: `openSource.featured.${i}.blurb`, message: 'The blurb must be text.' })
          } else {
            const blurb = item.blurb.trim()
            if (blurb.length > HOME_LIMITS.featuredBlurbMax) {
              errors.push({ path: `openSource.featured.${i}.blurb`, message: `Keep the blurb under ${HOME_LIMITS.featuredBlurbMax} characters.` })
            } else if (blurb) entry.blurb = blurb
          }
        }
        featured.push(entry)
      })
      out.featured = featured
    }
  }
  if (o.showVanityStats !== undefined && o.showVanityStats !== null) {
    if (typeof o.showVanityStats !== 'boolean') {
      errors.push({ path: 'openSource.showVanityStats', message: 'Must be on or off.' })
    } else out.showVanityStats = o.showVanityStats
  }
  return out
}

function normalizeSite(input: unknown, errors: HomeFieldError[]): HomeSite | undefined {
  if (input === undefined || input === null) return undefined
  if (typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ path: 'site', message: 'Site settings must be an object.' })
    return undefined
  }
  const raw = (input as Record<string, unknown>).name
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== 'string') {
    errors.push({ path: 'site.name', message: 'The site name must be text.' })
    return {}
  }
  const name = raw.trim()
  if (name.length > HOME_LIMITS.siteNameMax) {
    errors.push({ path: 'site.name', message: `Keep the site name under ${HOME_LIMITS.siteNameMax} characters.` })
    return {}
  }
  return name ? { name } : {}
}

function normalizeSectionOrder(input: unknown, errors: HomeFieldError[]): SortableSectionKey[] | undefined {
  if (input === undefined || input === null) return undefined
  if (!Array.isArray(input) || input.some((k) => typeof k !== 'string')) {
    errors.push({ path: 'sectionOrder', message: 'The section order must be a list of section names.' })
    return undefined
  }
  return resolveSectionOrder(input)
}

function normalizeHighlights(input: unknown, errors: HomeFieldError[]): HomeHighlight[] | undefined {
  if (input === undefined || input === null) return undefined
  if (!Array.isArray(input)) {
    errors.push({ path: 'highlights', message: 'Highlights must be a list.' })
    return undefined
  }
  if (input.length > HOME_LIMITS.highlightsMax) {
    errors.push({ path: 'highlights', message: `Show at most ${HOME_LIMITS.highlightsMax} highlights.` })
  }
  const out: HomeHighlight[] = []
  input.slice(0, HOME_LIMITS.highlightsMax).forEach((raw: unknown, i: number) => {
    const n = i + 1
    const h = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
    if (!h) {
      errors.push({ path: `highlights.${i}`, message: `Highlight ${n} is not valid.` })
      return
    }
    const value = trimmed(h.value)
    const label = trimmed(h.label)
    const href = trimmed(h.href)
    // A tile left completely blank is simply dropped.
    if (!value && !label && !href) return
    let ok = true
    if (!value) {
      errors.push({ path: `highlights.${i}.value`, message: `Highlight ${n}: enter the headline.` })
      ok = false
    } else if (value.length > HOME_LIMITS.highlightValueMax) {
      errors.push({ path: `highlights.${i}.value`, message: `Highlight ${n}: keep the headline under ${HOME_LIMITS.highlightValueMax} characters.` })
      ok = false
    }
    if (!label) {
      errors.push({ path: `highlights.${i}.label`, message: `Highlight ${n}: say what it is.` })
      ok = false
    } else if (label.length > HOME_LIMITS.highlightLabelMax) {
      errors.push({ path: `highlights.${i}.label`, message: `Highlight ${n}: keep the description under ${HOME_LIMITS.highlightLabelMax} characters.` })
      ok = false
    }
    if (!isHighlightHref(href)) {
      errors.push({
        path: `highlights.${i}.href`,
        message: `Highlight ${n}: link it to its source, a site path such as /cv#… or a full https:// URL.`,
      })
      ok = false
    }
    if (ok) out.push({ value, label, href })
  })
  return out
}

function normalizeBrands(input: HomeBrand[], errors: HomeFieldError[]): HomeBrand[] {
  const { brandScaleMin: min, brandScaleMax: max } = HOME_LIMITS
  return input.map((b, i) => {
    if (!b || typeof b !== 'object') return b
    const scale: unknown = b.scale
    if (scale === undefined) return b
    if (scale === null) {
      const rest = { ...b }
      delete rest.scale
      return rest
    }
    if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < min || scale > max) {
      errors.push({ path: `brands.${i}.scale`, message: `Logo scale must be between ${min} and ${max}.` })
      return b
    }
    return { ...b, scale: snapBrandScale(scale) }
  })
}

/**
 * Validate and normalise the owner-editable extras of a home document before
 * it is stored: availability, open-source picks, the site name, brand logo
 * scales, the section order (completed with any missing section) and the
 * highlights (each needs a headline, a description and a source link). Text
 * is trimmed, empty optional values are dropped, and
 * anything that would render wrongly (a non-https booking link, a bad month,
 * an out-of-range scale) is reported instead of being stored. Every other
 * key passes through untouched.
 */
export function normalizeHomeWrite(
  input: HomeData,
  now: number = Date.now(),
): { ok: true; home: HomeData } | { ok: false; errors: HomeFieldError[] } {
  const errors: HomeFieldError[] = []
  const home: HomeData = { ...input }
  if (Array.isArray(input.brands)) home.brands = normalizeBrands(input.brands, errors)

  const availability = normalizeAvailability(input.availability, errors, now)
  if (availability) home.availability = availability
  else delete home.availability

  const openSource = normalizeOpenSource(input.openSource, errors)
  if (openSource) home.openSource = openSource
  else delete home.openSource

  const site = normalizeSite(input.site, errors)
  if (site) home.site = site
  else delete home.site

  const sectionOrder = normalizeSectionOrder(input.sectionOrder, errors)
  if (sectionOrder) home.sectionOrder = sectionOrder
  else delete home.sectionOrder

  const highlights = normalizeHighlights(input.highlights, errors)
  if (highlights && highlights.length) home.highlights = highlights
  else delete home.highlights

  if (input.contact && typeof input.contact === 'object' && !Array.isArray(input.contact)) {
    const contact = { ...input.contact }
    const raw: unknown = contact.intents
    if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
      errors.push({ path: 'contact.intents', message: 'Reason kinds must map each reason to a kind.' })
    } else {
      // Only the owner's own reasons carry a mapping; 'other' is the default and not stored.
      const own = Array.isArray(contact.reasons)
        ? contact.reasons.map((r) => (typeof r === 'string' ? r.trim() : '')).filter(Boolean)
        : []
      const intents = own.length ? cleanIntentMap(own, raw) : {}
      if (Object.keys(intents).length) contact.intents = intents
      else delete contact.intents
      home.contact = contact
    }
  }

  if (input.sections && typeof input.sections === 'object') {
    for (const [k, v] of Object.entries(input.sections)) {
      if (v !== undefined && typeof v !== 'boolean') errors.push({ path: `sections.${k}`, message: 'Must be on or off.' })
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, home }
}
