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
  brands: { name: string; href: string; image: string }[]
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
}

/**
 * Stable ID for every [NN] home-page section. Keep this in sync with the
 * `HOME_SECTION_META` table below — the home renderer + admin editor both
 * import this so the two views can't drift.
 */
export type SectionKey =
  | 'introduction' // [01] PersonalInfo
  | 'brands'       // brand strip under hero
  | 'open-source'  // [02] StatsBar + TopRepos
  | 'tech-stack'   // [03] TechCloud + LanguageBars
  | 'activity'     // [04] ActivityFeed
  | 'projects'     // [05] ProjectSpotlight
  | 'experience'   // [06] ExperienceTimeline
  | 'certifications' // [07] CertificationsPeek
  | 'photos'       // [08] ImageScroller (Field Notes)
  | 'contact'      // [09] ContactPro

/** Display metadata for each section — drives the admin checkboxes. */
export const HOME_SECTION_META: Array<{ key: SectionKey; label: string; hint: string }> = [
  { key: 'introduction', label: 'Introduction', hint: '[01] hero + avatar + CTAs' },
  { key: 'brands', label: 'Brand strip', hint: 'logo row under hero' },
  { key: 'open-source', label: 'Open source', hint: '[02] GitHub stats + top repos' },
  { key: 'tech-stack', label: 'Tech stack', hint: '[03] tech cloud + language bars' },
  { key: 'activity', label: 'Recent activity', hint: '[04] GitHub event feed' },
  { key: 'projects', label: 'Selected projects', hint: '[05] horizontal spotlight' },
  { key: 'experience', label: 'Experience', hint: '[06] CV timeline' },
  { key: 'certifications', label: 'Certifications', hint: '[07] CV cert peek' },
  { key: 'photos', label: 'Field notes', hint: '[08] photo scroller' },
  { key: 'contact', label: 'Contact', hint: '[09] form + reach-me panel' },
]

/** Tiny render-time helper. Omitted/undefined → visible. Explicit false → hidden. */
export function isSectionVisible(
  data: HomeData | null | undefined,
  key: SectionKey,
): boolean {
  const v = data?.sections?.[key]
  return v !== false
}
