/**
 * Home editor form model (pure, client-safe; unit tested).
 *
 * The editor works on a HomeForm: the stored HomeData with every optional
 * value filled in for controlled inputs, and a stable `_id` on every list
 * item so cards keep their identity while being dragged, removed and
 * restored. `serializeHome` turns it back into exactly the HomeData shape the
 * PUT expects: `_id`s and the preview cache-buster `__ts` are stripped, URLs
 * normalised, empty optional groups omitted. Unknown top-level keys of the
 * loaded document pass through untouched.
 */

import {
  AVAILABILITY_STATUSES,
  DEFAULT_SECTION_ORDER,
  HOME_LIMITS,
  isSameOrder,
  normalizeHomeWrite,
  resolveSectionOrder,
  snapBrandScale,
  type AvailabilityStatus,
  type HomeData,
  type HomeFieldError,
  type SectionKey,
  type SortableSectionKey,
} from '../../../lib/homeShape'
import { cleanIntentMap, type InquiryIntent } from '../../../lib/inquiry'

export type Keyed<T> = T & { _id: string }

export type BrandItem = Keyed<{ name: string; href: string; image: string; scale: number }>
export type QuickItem = Keyed<{ label: string; url: string }>
export type PhotoItem = Keyed<{ url: string; describe: string; redirectTo: string; visible: boolean }>
export type FeaturedItem = Keyed<{ name: string; blurb: string }>
export type HighlightItem = Keyed<{ value: string; label: string; href: string }>

export type HeroForm = {
  welcome: string
  brand: string
  tagline: string
  avatarUrl: string
  phone: string
  email: string
  avatarTransform: { x: number; y: number; scale: number }
  currentlyCoding: { label: string; project: string; note: string }
}

export type SocialsForm = { github: string; gitlab: string; linkedin: string; whatsapp: string }
export type ContactForm = {
  heading: string
  blurb: string
  eyebrow: string
  reasons: string[]
  /** Kind of each custom reason (lib/inquiry.ts); missing = 'other'. */
  intents: Record<string, InquiryIntent>
}

export type AvailabilityForm = {
  /** '' = no availability shown anywhere. */
  status: AvailabilityStatus | ''
  label: string
  label_zh: string
  roles: string[]
  from: string
  bookingUrl: string
  /** Job intent on the Chinese CV (求职意向). */
  roles_zh: string[]
  city_zh: string
  /** Right-to-work line, English and Chinese. */
  workStatus: string
  workStatus_zh: string
  updatedAt: number | null
}

export type OpenSourceForm = { featured: FeaturedItem[]; showVanityStats: boolean }
export type SiteForm = { name: string }

export type HomeForm = {
  hero: HeroForm
  socials: SocialsForm
  brands: BrandItem[]
  quickAccess: QuickItem[]
  photos: PhotoItem[]
  sections: Partial<Record<SectionKey, boolean>>
  /** Every numbered section, in display order (always complete). */
  sectionOrder: SortableSectionKey[]
  /**
   * Whether the stored document has an explicit order. Without one, the
   * built-in order is not written back, so opening and saving the editor
   * does not pin today's default for good.
   */
  sectionOrderSet: boolean
  highlights: HighlightItem[]
  contact: ContactForm
  availability: AvailabilityForm
  openSource: OpenSourceForm
  site: SiteForm
  /** Top-level keys this editor doesn't know about, written back unchanged. */
  extra: Record<string, unknown>
}

const KNOWN_KEYS = new Set([
  'hero',
  'socials',
  'brands',
  'quickAccess',
  'photos',
  'sections',
  'sectionOrder',
  'highlights',
  'contact',
  'availability',
  'openSource',
  'site',
])

export const EMPTY_AVAILABILITY: AvailabilityForm = {
  status: '',
  label: '',
  label_zh: '',
  roles: [],
  from: '',
  bookingUrl: '',
  roles_zh: [],
  city_zh: '',
  workStatus: '',
  workStatus_zh: '',
  updatedAt: null,
}

/** Random id for a list item (crypto.randomUUID where available). */
export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Build the editor form from a stored (admin view) home document. */
export function formFromHome(data: unknown, makeId: () => string = newId): HomeForm {
  const d = obj(data)
  const hero = obj(d.hero)
  const at = obj(hero.avatarTransform)
  const cc = obj(hero.currentlyCoding)
  const socials = obj(d.socials)
  const contact = obj(d.contact)
  const availability = obj(d.availability)
  const openSource = obj(d.openSource)
  const site = obj(d.site)
  const status = (AVAILABILITY_STATUSES as readonly unknown[]).includes(availability.status)
    ? (availability.status as AvailabilityStatus)
    : ''
  const extra: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(d)) if (!KNOWN_KEYS.has(k)) extra[k] = v
  return {
    hero: {
      welcome: str(hero.welcome),
      brand: str(hero.brand),
      tagline: str(hero.tagline),
      avatarUrl: str(hero.avatarUrl),
      phone: str(hero.phone),
      email: str(hero.email),
      avatarTransform: { x: num(at.x, 50), y: num(at.y, 50), scale: num(at.scale, 1) },
      currentlyCoding: { label: str(cc.label), project: str(cc.project), note: str(cc.note) },
    },
    socials: {
      github: str(socials.github),
      gitlab: str(socials.gitlab),
      linkedin: str(socials.linkedin),
      whatsapp: str(socials.whatsapp),
    },
    brands: arr(d.brands).map((raw) => {
      const b = obj(raw)
      return { _id: makeId(), name: str(b.name), href: str(b.href), image: str(b.image), scale: num(b.scale, 1) }
    }),
    quickAccess: arr(d.quickAccess).map((raw) => {
      const q = obj(raw)
      return { _id: makeId(), label: str(q.label), url: str(q.url) }
    }),
    photos: arr(d.photos).map((raw) => {
      const p = obj(raw)
      return { _id: makeId(), url: str(p.url), describe: str(p.describe), redirectTo: str(p.redirectTo), visible: p.visible !== false }
    }),
    sections: Object.fromEntries(
      Object.entries(obj(d.sections)).filter(([, v]) => typeof v === 'boolean'),
    ) as Partial<Record<SectionKey, boolean>>,
    sectionOrder: resolveSectionOrder(d.sectionOrder),
    sectionOrderSet: Array.isArray(d.sectionOrder),
    highlights: arr(d.highlights)
      .map(obj)
      .map((h) => ({ _id: makeId(), value: str(h.value), label: str(h.label), href: str(h.href) })),
    contact: (() => {
      const reasons = arr(contact.reasons).filter((r): r is string => typeof r === 'string')
      return {
        heading: str(contact.heading),
        blurb: str(contact.blurb),
        eyebrow: str(contact.eyebrow),
        reasons,
        intents: cleanIntentMap(reasons, contact.intents),
      }
    })(),
    availability: status
      ? {
          status,
          label: str(availability.label),
          label_zh: str(availability.label_zh),
          roles: arr(availability.roles).filter((r): r is string => typeof r === 'string'),
          from: str(availability.from),
          bookingUrl: str(availability.bookingUrl),
          roles_zh: arr(availability.roles_zh).filter((r): r is string => typeof r === 'string'),
          city_zh: str(availability.city_zh),
          workStatus: str(availability.workStatus),
          workStatus_zh: str(availability.workStatus_zh),
          updatedAt: typeof availability.updatedAt === 'number' ? availability.updatedAt : null,
        }
      : { ...EMPTY_AVAILABILITY },
    openSource: {
      featured: arr(openSource.featured)
        .map(obj)
        .filter((f) => typeof f.name === 'string' && f.name)
        .map((f) => ({ _id: makeId(), name: str(f.name), blurb: str(f.blurb) })),
      showVanityStats: openSource.showVanityStats === true,
    },
    site: { name: str(site.name) },
    extra,
  }
}

/** Give every item of a restored list (e.g. from a local draft) an `_id`. */
export function ensureIds(form: HomeForm, makeId: () => string = newId): HomeForm {
  const fix = <T extends { _id?: string }>(items: T[]): (T & { _id: string })[] =>
    items.map((it) => (typeof it._id === 'string' && it._id ? (it as T & { _id: string }) : { ...it, _id: makeId() }))
  return {
    ...form,
    brands: fix(form.brands),
    quickAccess: fix(form.quickAccess),
    photos: fix(form.photos),
    highlights: fix(Array.isArray(form.highlights) ? form.highlights : []),
    openSource: { ...form.openSource, featured: fix(form.openSource.featured) },
  }
}

/** Relative paths get a leading slash; absolute http(s) URLs stay. */
export function normalizeUrl(u?: string): string {
  if (!u) return ''
  if (/^https?:\/\//i.test(u)) return u
  if (u.startsWith('/')) return u
  return '/' + u.replace(/^\.?\/*/, '')
}

/** Remove the editor's preview cache-buster (`__ts`) from a URL. */
export function stripTs(u: string | undefined, origin = 'http://localhost'): string {
  if (!u) return ''
  try {
    const url = new URL(u, origin)
    url.searchParams.delete('__ts')
    if (url.origin === origin) return url.pathname + (url.search || '') + (url.hash || '')
    return url.toString()
  } catch {
    return u.replace(/([?&])__ts=\d+(&|$)/, (_m, p1: string, p2: string) => (p2 ? p1 : ''))
  }
}

/** A link the home page can use: site-relative or http(s). */
export function isLinkUrl(u: string): boolean {
  return /^\//.test(u) || /^https?:\/\//i.test(u)
}

const cleanUrl = (u: string, origin: string) => normalizeUrl(stripTs(u, origin))

/** The PUT payload for a form: the HomeData shape, without editor-only keys. */
export function serializeHome(form: HomeForm, origin = 'http://localhost'): HomeData {
  const out: HomeData & Record<string, unknown> = {
    ...form.extra,
    hero: {
      ...form.hero,
      avatarUrl: cleanUrl(form.hero.avatarUrl, origin),
      avatarTransform: { ...form.hero.avatarTransform },
      currentlyCoding: { ...form.hero.currentlyCoding },
    },
    socials: { ...form.socials },
    brands: form.brands.map((b) => {
      const scale = snapBrandScale(b.scale)
      return {
        name: b.name,
        href: b.href,
        image: cleanUrl(b.image, origin),
        ...(scale !== 1 ? { scale } : {}),
      }
    }),
    quickAccess: form.quickAccess.map((q) => ({ label: q.label, url: q.url })),
    photos: form.photos.map((p) => ({
      url: cleanUrl(p.url, origin),
      describe: p.describe,
      ...(p.redirectTo ? { redirectTo: cleanUrl(p.redirectTo, origin) } : {}),
      visible: p.visible,
    })),
    sections: { ...form.sections },
    contact: (() => {
      const reasons = form.contact.reasons.map((r) => r.trim()).filter(Boolean)
      const intents = cleanIntentMap(reasons, form.contact.intents)
      return {
        heading: form.contact.heading.trim(),
        blurb: form.contact.blurb.trim(),
        eyebrow: form.contact.eyebrow.trim(),
        reasons,
        ...(Object.keys(intents).length ? { intents } : {}),
      }
    })(),
  }
  const a = form.availability
  if (a.status) {
    const roles = a.roles.map((r) => r.trim()).filter(Boolean)
    const rolesZh = (a.roles_zh || []).map((r) => r.trim()).filter(Boolean)
    const line = (v: string | undefined) => (v || '').trim()
    out.availability = {
      status: a.status,
      ...(a.label.trim() ? { label: a.label.trim() } : {}),
      ...(a.label_zh.trim() ? { label_zh: a.label_zh.trim() } : {}),
      ...(roles.length ? { roles } : {}),
      ...(a.from ? { from: a.from } : {}),
      ...(a.bookingUrl.trim() ? { bookingUrl: a.bookingUrl.trim() } : {}),
      ...(rolesZh.length ? { roles_zh: rolesZh } : {}),
      ...(line(a.city_zh) ? { city_zh: line(a.city_zh) } : {}),
      ...(line(a.workStatus) ? { workStatus: line(a.workStatus) } : {}),
      ...(line(a.workStatus_zh) ? { workStatus_zh: line(a.workStatus_zh) } : {}),
      ...(a.updatedAt ? { updatedAt: a.updatedAt } : {}),
    }
  }
  const featured = form.openSource.featured
    .map((f) => ({ name: f.name.trim(), blurb: f.blurb.trim() }))
    .filter((f) => f.name)
    .map((f) => (f.blurb ? f : { name: f.name }))
  if (featured.length || form.openSource.showVanityStats) {
    out.openSource = {
      ...(featured.length ? { featured } : {}),
      ...(form.openSource.showVanityStats ? { showVanityStats: true } : {}),
    }
  }
  if (form.site.name.trim()) out.site = { name: form.site.name.trim() }
  // A draft saved by an older editor build may lack the newer fields.
  const order = resolveSectionOrder(form.sectionOrder)
  if (form.sectionOrderSet || !isSameOrder(order, DEFAULT_SECTION_ORDER)) out.sectionOrder = order
  const highlights = (Array.isArray(form.highlights) ? form.highlights : [])
    .map((h) => ({ value: str(h.value).trim(), label: str(h.label).trim(), href: str(h.href).trim() }))
    .filter((h) => h.value || h.label || h.href)
  if (highlights.length) out.highlights = highlights
  return out
}

/**
 * Problems that would make the save fail or render wrongly: invalid photo
 * links plus everything the server-side normaliser rejects (booking link,
 * month, repo names, blurb length, logo scale).
 */
export function validateHomeForm(form: HomeForm, origin = 'http://localhost'): HomeFieldError[] {
  const errors: HomeFieldError[] = []
  form.photos.forEach((p, i) => {
    if (p.url && !isLinkUrl(p.url)) errors.push({ path: `photos.${i}.url`, message: `Photo ${i + 1}: the image URL must start with / or http(s)://.` })
    if (p.redirectTo && !isLinkUrl(p.redirectTo)) errors.push({ path: `photos.${i}.redirectTo`, message: `Photo ${i + 1}: the link must start with / or http(s)://.` })
  })
  const checked = normalizeHomeWrite(serializeHome(form, origin))
  if (!checked.ok) errors.push(...checked.errors)
  return errors
}

/** Move one item (array copy). */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) return items
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Insert `item` back at `index` (clamped), e.g. for Undo after a removal. */
export function insertAt<T>(items: T[], index: number, item: T): T[] {
  const next = items.slice()
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item)
  return next
}

/** "today", "1 day ago", "12 days ago" for the availability's last edit. */
export function updatedAgo(updatedAt: number | null, now: number): string {
  if (!updatedAt) return ''
  const days = Math.floor(Math.max(0, now - updatedAt) / 86_400_000)
  if (days === 0) return 'updated today'
  return `updated ${days} day${days === 1 ? '' : 's'} ago`
}

/** Remaining characters for a featured blurb (negative when over). */
export const blurbRemaining = (blurb: string) => HOME_LIMITS.featuredBlurbMax - blurb.trim().length

/** The `suggestedHighlights` of GET /api/admin/cv-derived, defensively parsed. */
export function parseSuggestions(raw: unknown): Array<{ value: string; label: string; href: string; source: string }> {
  return arr(raw)
    .map(obj)
    .filter((s) => typeof s.value === 'string' && s.value && typeof s.label === 'string' && s.label && typeof s.href === 'string' && s.href)
    .map((s) => ({ value: str(s.value), label: str(s.label), href: str(s.href), source: str(s.source) }))
}

/** A highlight already in the form with the same text (suggestions are added once). */
export function hasHighlight(items: readonly { value: string; label: string }[], h: { value: string; label: string }): boolean {
  const key = (v: string, l: string) => `${v.trim().toLowerCase()}\u0000${l.trim().toLowerCase()}`
  const want = key(h.value, h.label)
  return items.some((i) => key(i.value, i.label) === want)
}
