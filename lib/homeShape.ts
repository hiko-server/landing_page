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
  siteNameMax: 80,
} as const

/**
 * Stable ID for every home-page section (the [NN] labels are numbered at
 * render time from the visible sections). Keep this in sync with the
 * `HOME_SECTION_META` table below — the home renderer + admin editor both
 * import this so the two views can't drift.
 */
export type SectionKey =
  | 'introduction' // PersonalInfo (hero)
  | 'brands'       // brand strip under hero
  | 'open-source'  // StatsBar + contribution graph + TopRepos
  | 'tech-stack'   // Skills (from the CV) + LanguageBars
  | 'activity'     // ActivityFeed
  | 'projects'     // ProjectSpotlight
  | 'experience'   // ExperienceTimeline
  | 'certifications' // CertificationsPeek
  | 'photos'       // Field Notes photo strip
  | 'contact'      // ContactPro
  | 'writing'      // latest posts + case studies

/** Display metadata for each section — drives the admin checkboxes. */
export const HOME_SECTION_META: Array<{ key: SectionKey; label: string; hint: string }> = [
  { key: 'introduction', label: 'Introduction', hint: 'hero + avatar + CTAs' },
  { key: 'brands', label: 'Brand strip', hint: 'logo row under hero' },
  { key: 'open-source', label: 'Open source', hint: 'GitHub stats, contribution graph, top repos' },
  { key: 'tech-stack', label: 'Skills', hint: 'skills from your CV + language bars' },
  { key: 'activity', label: 'Recent activity', hint: 'GitHub event feed' },
  { key: 'projects', label: 'Selected projects', hint: 'horizontal spotlight' },
  { key: 'experience', label: 'Experience', hint: 'CV timeline' },
  { key: 'certifications', label: 'Certifications', hint: 'certifications from your CV' },
  { key: 'photos', label: 'Field notes', hint: 'full-width photo strip' },
  { key: 'contact', label: 'Contact', hint: 'form + reach-me panel' },
  { key: 'writing', label: 'Writing & case studies', hint: 'latest posts and case studies' },
]

/** Tiny render-time helper. Omitted/undefined → visible. Explicit false → hidden. */
export function isSectionVisible(
  data: HomeData | null | undefined,
  key: SectionKey,
): boolean {
  const v = data?.sections?.[key]
  return v !== false
}

/**
 * The home document as visitors may see it. Pure (runs on server and client).
 *
 * Content that the owner switched off never leaves the server:
 *   - photos with `visible: false` are dropped
 *   - a section switched off in `sections` has the data that feeds only that
 *     section emptied (brand strip, field-note photos, contact copy)
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
    contact: off('contact') ? {} : home.contact,
  }
}


// ── Write-time validation of the owner-editable extras ─────────────────────

export type HomeFieldError = { path: string; message: string }

/** An absolute https:// URL with a host and no embedded credentials. */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || /\s/.test(value.trim())) return false
  try {
    const u = new URL(value.trim())
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password
  } catch {
    return false
  }
}

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
  if (a.roles !== undefined && a.roles !== null) {
    if (!Array.isArray(a.roles) || a.roles.some((r) => typeof r !== 'string')) {
      errors.push({ path: 'availability.roles', message: 'Roles must be a list of text.' })
    } else {
      const roles = Array.from(new Set(a.roles.map((r: string) => r.trim()).filter(Boolean)))
      if (roles.length > HOME_LIMITS.rolesMax) {
        errors.push({ path: 'availability.roles', message: `At most ${HOME_LIMITS.rolesMax} roles.` })
      } else if (roles.some((r) => r.length > HOME_LIMITS.roleMax)) {
        errors.push({ path: 'availability.roles', message: `Each role must be under ${HOME_LIMITS.roleMax} characters.` })
      } else if (roles.length) out.roles = roles
    }
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
 * it is stored: availability, open-source picks, the site name and brand
 * logo scales. Text is trimmed, empty optional values are dropped, and
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

  if (input.sections && typeof input.sections === 'object') {
    for (const [k, v] of Object.entries(input.sections)) {
      if (v !== undefined && typeof v !== 'boolean') errors.push({ path: `sections.${k}`, message: 'Must be on or off.' })
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, home }
}
