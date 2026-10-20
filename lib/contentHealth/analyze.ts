import { internalTarget, isFilenameAlt } from '../../components/Admin/shell/publishChecks'
import { COVER_RECOMMENDED_MIN, COVER_SHARP_MIN, cleanOutcomes } from '../caseStudy'
import { SECTION_BY_NAME, type FieldDef, type ListDef } from '../cvSections'
import {
  CONSENT_LISTS,
  PRIVATE_SECTION_FIELDS,
  isEntryHidden,
  isFieldHidden,
  isSectionOnCv,
  isSectionOnWebsite,
} from '../cvVisibility'
import { safeHref } from '../url'
import { isPersistentFailure, linkKey, type LinkRecord } from './linkCheck'
import { scanBody, type BreakFix } from './mdxScan'
import { stripTrackingParams, trackingParamsIn } from './tracking'
import {
  countIssues,
  type HealthCheck,
  type HealthFix,
  type HealthIssue,
  type HealthItem,
  type Severity,
} from './types'

/**
 * The content health rules (pure; unit-tested). The server gathers the
 * inputs (lib/contentHealth/collect.ts): the PUBLISHED posts, case studies
 * and pages, the CV and the home document, the stored link-check results
 * and a file-info lookup for images. Nothing here reads the disk or the
 * network, and every rule reports only what a visitor would really meet:
 *
 *   broken-link       a link answered 404 / 410, or has failed (5xx,
 *                     timeout, DNS…) on runs ≥ 20 h apart — once is a warning
 *   redirect          every hop is a permanent redirect (notice); the fix
 *                     points the link at the new address when that is safe
 *   internal-link     /blog/… or /work/… that does not exist (error) or is
 *                     still a draft (warning)
 *   tracking          utm_*, fbclid, gclid, si on YouTube / Spotify, … —
 *                     the fix strips them (lib/contentHealth/tracking.ts)
 *   image-missing     a local image file that is not on the server, or a
 *                     remote image that answers 404 / 410
 *   remote-image      an image hosted elsewhere (https: import fix) or over
 *                     http:// (blocked by the CSP: error)
 *   image-srcset      an upload that could have responsive WebP sizes but
 *                     lacks some — every visitor downloads the original
 *   image-weight      over HEAVY_IMAGE_BYTES where no resized copy can help
 *   image-dimensions  an upload over MAX_EDGE px; a cover under 960 / 1600 px
 *   image-alt         no alt, or a file name / camera name as alt
 *   heading           an h1 in the body, an empty heading, a skipped level
 *   hard-break        breaks used as blank lines, a stray "\" ending a
 *                     paragraph, invisible two-space breaks
 *   description       the same description on several items, one equal to
 *                     the title, none at all
 *   mdx               the body cannot be parsed
 */

/** An image heavier than this, which no responsive copy replaces, is worth re-exporting. */
export const HEAVY_IMAGE_BYTES = 1_000_000
/** Uploads are stored at most this large since the upload pipeline (lib/imageVariants MAX_EDGE). */
export const MAX_EDGE = 2560

export type ImageInfo = {
  kind: 'upload' | 'static' | 'other'
  /** null = unknown (an upload that is only in R2, served from there). */
  exists: boolean | null
  bytes: number | null
  width: number | null
  height: number | null
  format: 'jpeg' | 'png' | 'webp' | 'gif' | 'svg' | 'avif' | 'other' | null
  animated: boolean
  /** An upload the upload pipeline / media-optimize can give responsive WebP sizes. */
  variantEligible: boolean
  /** Variant widths it should have but does not. */
  missingVariants: number[]
  /** The upload's file name (uploads only). */
  upload: string | null
}

export type HealthDoc = {
  key: string
  kind: 'post' | 'work' | 'page'
  slug: string
  title: string
  description: string
  body: string
  frontmatter: Record<string, unknown>
  version: number
  editHref: string
  publicHref: string
}

export type AnalyzeInput = {
  siteHost: string
  now: number
  docs: HealthDoc[]
  /** Every post and case study, drafts included (internal links). */
  known: { blog: Record<string, { draft: boolean }>; work: Record<string, { draft: boolean }> }
  cv: { version: number; doc: { en?: unknown; zh?: unknown } } | null
  home: { version: number; doc: Record<string, any> } | null
  links: Readonly<Record<string, LinkRecord>>
  imageInfo: (src: string) => ImageInfo
}

/** Where a fix writes: the MDX body, or one string field of a document. */
export type Place = { at: 'body' } | { at: 'field'; path: Array<string | number>; value: string }

/** How the server applies a fix (never sent to the browser). */
export type ApplySpec =
  | { op: 'strip-tracking'; item: string; place: Place; key: string }
  | { op: 'use-new-url'; item: string; place: Place; key: string; to: string }
  | { op: 'import-image'; item: string; place: Place; url: string }
  | { op: 'generate-variants'; upload: string }
  | { op: 'breaks'; item: string; fix: BreakFix }

export type InternalIssue = HealthIssue & { apply?: ApplySpec }

export type ExternalRef = { item: string; where: string; image: boolean }

export type Analysis = {
  items: Record<string, HealthItem>
  issues: InternalIssue[]
  /** Every external URL the public content references, by link key. */
  external: Map<string, { url: string; refs: ExternalRef[] }>
  images: number
}

// ── Small helpers ─────────────────────────────────────────────────────────

/** 53-bit FNV-1a: short, stable ids without crypto (pure and fast). */
function hash(text: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 12)
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, notice: 2 }

export function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`
  if (n >= 1000) return `${Math.round(n / 1000)} KB`
  return `${n} B`
}

function hostOf(url: string): string {
  try {
    return new URL(url.startsWith('//') ? `https:${url}` : url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function isOwnHost(host: string, siteHost: string): boolean {
  const site = siteHost.toLowerCase()
  return host === site || host === `www.${site}`
}

/** Alt text that names a file or a camera rather than the picture. */
export function isMeaninglessAlt(alt: string): boolean {
  const a = alt.trim()
  if (!a) return false
  return (
    isFilenameAlt(a) ||
    /^(img|dsc|dscn|dcim|pxl|mvimg|vid|photo|image|screenshot)[\s_-]?\d{3,}/i.test(a) ||
    /^screen ?shot[\s_-]+\d{4}/i.test(a) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a) ||
    /^\d{6,}$/.test(a)
  )
}

function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?。！？…]+$/u, '')
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const lineLabel = (line: number) => `Line ${line}`

/** A URL's fragment ("#x"), or ''. */
function fragmentOf(raw: string): string {
  const i = raw.indexOf('#')
  return i === -1 ? '' : raw.slice(i)
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

// ── The analysis ──────────────────────────────────────────────────────────

type LinkRef = {
  item: string
  url: string
  /** As written (body) or as stored (field); null when it cannot be rewritten. */
  raw: string | null
  where: string
  line?: number
  place: Place
}

type ImageRef = LinkRef & {
  /** Body images: alt as written; null = a JSX image without an alt attribute; undefined = not checked. */
  alt?: string | null
  /** A JSX image with an explicit alt="": decorative on purpose. */
  decorative?: boolean
  cover?: boolean
}

class Collector {
  readonly issues: InternalIssue[] = []
  readonly external = new Map<string, { url: string; refs: ExternalRef[] }>()
  images = 0
  private readonly seen = new Map<string, InternalIssue & { places: number }>()

  readonly input: AnalyzeInput

  constructor(input: AnalyzeInput) {
    this.input = input
  }

  /** Add an issue; the same (check, item, subject) in a body is reported once, with its count. */
  add(issue: Omit<InternalIssue, 'id'>, subject: string) {
    const id = `${issue.check}-${hash(`${issue.item}\u0000${subject}`)}`
    const dup = this.seen.get(id)
    if (dup) {
      dup.places++
      return
    }
    const full = { ...issue, id, places: 1 }
    this.seen.set(id, full)
    this.issues.push(full)
  }

  finish(): InternalIssue[] {
    for (const i of this.issues as Array<InternalIssue & { places?: number }>) {
      if (i.places && i.places > 1) i.where = `${i.where} (+${i.places - 1} more)`
      delete i.places
    }
    return this.issues.sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        a.item.localeCompare(b.item) ||
        (a.line ?? 0) - (b.line ?? 0) ||
        a.message.localeCompare(b.message)
    )
  }

  // ── Links ──

  link(ref: LinkRef) {
    const { siteHost } = this.input
    const href = ref.url.trim()
    if (!href || href.startsWith('#') || /^(mailto|tel|sms):/i.test(href)) return
    const absolute = /^https?:\/\//i.test(href) || href.startsWith('//')
    if (!absolute || isOwnHost(hostOf(href), siteHost)) {
      this.internal(ref, href)
      return
    }
    const key = linkKey(href)
    if (!key) return
    this.register(key, ref, false)

    const params = trackingParamsIn(ref.raw ?? href)
    if (params.length) {
      const fix: HealthFix | undefined =
        ref.raw !== null ? { type: 'strip-tracking', to: stripTrackingParams(ref.raw) } : undefined
      this.add(
        {
          check: 'tracking',
          severity: 'warning',
          item: ref.item,
          where: ref.where,
          line: ref.line,
          url: href,
          message: `Tracking parameters in a link to ${hostOf(href)}`,
          detail: `${params.join(', ')} tell${params.length === 1 ? 's' : ''} the other site where the click came from — sometimes who shared the link. The page opens the same without ${params.length === 1 ? 'it' : 'them'}.`,
          ...(fix
            ? { fix, apply: { op: 'strip-tracking', item: ref.item, place: ref.place, key } }
            : {}),
        },
        `${key}\u0000${ref.place.at === 'field' ? ref.place.path.join('.') : 'body'}`
      )
    }

    const record = this.input.links[key]
    if (record) this.linkResult(ref, href, key, record)
  }

  private register(key: string, ref: LinkRef, image: boolean) {
    const entry = this.external.get(key) || { url: key, refs: [] }
    if (!entry.refs.some((r) => r.item === ref.item && r.where === ref.where))
      entry.refs.push({ item: ref.item, where: ref.where, image })
    this.external.set(key, entry)
  }

  private subject(key: string, ref: LinkRef) {
    return `${key}\u0000${ref.place.at === 'field' ? ref.place.path.join('.') : 'body'}`
  }

  private linkResult(ref: LinkRef, href: string, key: string, r: LinkRecord) {
    const { now } = this.input
    const host = hostOf(href)
    const checked = `Checked ${new Date(r.checkedAt).toISOString().slice(0, 10)}.`
    if (r.outcome === 'broken' || (r.outcome === 'failing' && isPersistentFailure(r, now))) {
      const since = r.failingSince
        ? ` since ${new Date(r.failingSince).toISOString().slice(0, 10)}`
        : ''
      this.add(
        {
          check: 'broken-link',
          severity: 'error',
          item: ref.item,
          where: ref.where,
          line: ref.line,
          url: href,
          message: `Broken link to ${host}`,
          detail:
            r.outcome === 'broken'
              ? `${r.reason || `HTTP ${r.status}`}: visitors land on an error page. Update the address or remove the link. ${checked}`
              : `${r.reason || 'It does not answer'} on every check${since}. Update the address or remove the link. ${checked}`,
        },
        this.subject(key, ref)
      )
    } else if (r.outcome === 'failing') {
      this.add(
        {
          check: 'broken-link',
          severity: 'warning',
          item: ref.item,
          where: ref.where,
          line: ref.line,
          url: href,
          message: `Link to ${host} did not respond`,
          detail: `${r.reason || 'The request failed'}. It may be a passing outage; the next daily check confirms it. ${checked}`,
        },
        this.subject(key, ref)
      )
    } else if (r.outcome === 'blocked') {
      this.add(
        {
          check: 'broken-link',
          severity: 'warning',
          item: ref.item,
          where: ref.where,
          line: ref.line,
          url: href,
          message: `Link to ${host} points to a private network`,
          detail:
            'Its address is not on the public internet, so visitors cannot open it (and the checker never requests it).',
        },
        this.subject(key, ref)
      )
    } else if (r.outcome === 'moved' && r.finalUrl) {
      const canFix =
        r.safeMove && ref.raw !== null && /^https?:\/\//i.test(ref.raw) && linkKey(ref.raw) === key
      const to = canFix
        ? `${r.finalUrl}${fragmentOf(r.finalUrl) ? '' : fragmentOf(ref.raw as string)}`
        : r.finalUrl
      this.add(
        {
          check: 'redirect',
          severity: 'notice',
          item: ref.item,
          where: ref.where,
          line: ref.line,
          url: href,
          message: `Link to ${host} has moved permanently`,
          detail: canFix
            ? `It redirects to ${displayUrl(to)}. Linking there directly skips the detour. ${checked}`
            : `It now redirects to ${displayUrl(r.finalUrl)} on another site or page — check that it is still what you meant, then update it in the editor. ${checked}`,
          // The spec keeps the bare new address: every occurrence keeps its own #fragment.
          ...(canFix
            ? {
                fix: { type: 'use-new-url', to },
                apply: { op: 'use-new-url', item: ref.item, place: ref.place, key, to: r.finalUrl },
              }
            : {}),
        },
        this.subject(key, ref)
      )
    }
  }

  private internal(ref: LinkRef, href: string) {
    const target = internalTarget(href, this.input.siteHost)
    if (!target) return
    const known = this.input.known[target.collection][target.slug]
    const noun = target.collection === 'blog' ? 'post' : 'case study'
    if (!known) {
      this.add(
        {
          check: 'internal-link',
          severity: 'error',
          item: ref.item,
          where: ref.where,
          line: ref.line,
          url: href,
          message: `Link to /${target.collection}/${target.slug} goes nowhere`,
          detail: `There is no ${noun} with that slug, so visitors get the 404 page. Fix the slug or remove the link.`,
        },
        `/${target.collection}/${target.slug}\u0000${ref.place.at === 'field' ? ref.place.path.join('.') : 'body'}`
      )
    } else if (known.draft) {
      this.add(
        {
          check: 'internal-link',
          severity: 'warning',
          item: ref.item,
          where: ref.where,
          line: ref.line,
          url: href,
          message: `Link to a draft: /${target.collection}/${target.slug}`,
          detail: `That ${noun} is not published, so visitors get the 404 page until it is.`,
        },
        `/${target.collection}/${target.slug}\u0000${ref.place.at === 'field' ? ref.place.path.join('.') : 'body'}`
      )
    }
  }

  // ── Images ──

  image(ref: ImageRef) {
    const src = ref.url.trim()
    if (!src || /^(data|blob):/i.test(src)) return
    this.images++
    const subject = `${src}\u0000${ref.place.at === 'field' ? ref.place.path.join('.') : 'body'}`
    const what = ref.cover ? 'Cover' : 'Image'

    if (ref.alt !== undefined && !ref.decorative) {
      if (ref.alt === null || ref.alt.trim() === '') {
        this.add(
          {
            check: 'image-alt',
            severity: 'warning',
            item: ref.item,
            where: ref.where,
            line: ref.line,
            url: src,
            message: 'Image without alt text',
            detail:
              'Screen readers announce it as an unlabeled image. Describe what it shows (or what it is for) in a few words.',
          },
          subject
        )
      } else if (isMeaninglessAlt(ref.alt)) {
        this.add(
          {
            check: 'image-alt',
            severity: 'warning',
            item: ref.item,
            where: ref.where,
            line: ref.line,
            url: src,
            message: `Alt text “${ref.alt.trim().slice(0, 60)}” is a file name`,
            detail:
              'Screen readers read it out as it is. Replace it with a few words on what the image shows — only you can write those.',
          },
          subject
        )
      }
    }

    const absolute = /^https?:\/\//i.test(src) || src.startsWith('//')
    if (absolute && !isOwnHost(hostOf(src), this.input.siteHost)) {
      const host = hostOf(src)
      const key = linkKey(src)
      if (key) this.register(key, ref, true)
      if (/^http:\/\//i.test(src)) {
        this.add(
          {
            check: 'remote-image',
            severity: 'error',
            item: ref.item,
            where: ref.where,
            line: ref.line,
            url: src,
            message: `${what} over insecure http:// from ${host}`,
            detail:
              'The site’s security policy blocks http:// images on its https pages, so it does not show. Upload a copy, or use the https:// address.',
          },
          subject
        )
        return
      }
      const record = key ? this.input.links[key] : undefined
      if (record && (record.outcome === 'broken' || isPersistentFailure(record, this.input.now))) {
        this.add(
          {
            check: 'image-missing',
            severity: 'error',
            item: ref.item,
            where: ref.where,
            line: ref.line,
            url: src,
            message: `${what} from ${host} no longer loads`,
            detail: `${record.reason || `HTTP ${record.status}`}: the page shows a broken image. Upload the picture again or remove it.`,
          },
          subject
        )
        return
      }
      const canFix = ref.raw !== null
      this.add(
        {
          check: 'remote-image',
          severity: 'warning',
          item: ref.item,
          where: ref.where,
          line: ref.line,
          url: src,
          message: `${what} hosted on ${host}`,
          detail:
            'It can disappear or change without notice and loads at full size on every screen. Importing copies it into the uploads (resized, metadata removed, responsive sizes) and points the page at the copy.',
          ...(canFix
            ? {
                fix: { type: 'import-image' },
                apply: { op: 'import-image', item: ref.item, place: ref.place, url: src },
              }
            : {}),
        },
        subject
      )
      return
    }
    if (!src.startsWith('/') || src.startsWith('//')) return

    const info = this.input.imageInfo(src)
    if (info.exists === false) {
      this.add(
        {
          check: 'image-missing',
          severity: 'error',
          item: ref.item,
          where: ref.where,
          line: ref.line,
          url: src,
          message: `${what} file is missing`,
          detail: `${src} is not on the server, so the page shows a broken image. Upload it again or remove it.`,
        },
        subject
      )
      return
    }
    if (!info.exists) return
    const size = info.width && info.height ? `${info.width}×${info.height} px` : ''
    const weight = info.bytes !== null ? formatBytes(info.bytes) : ''

    if (info.variantEligible && info.missingVariants.length && info.upload) {
      this.add(
        {
          check: 'image-srcset',
          severity: 'warning',
          item: ref.item,
          where: ref.where,
          line: ref.line,
          url: src,
          message: `${what} has no responsive sizes`,
          detail: `Every visitor downloads the full original${size || weight ? ` (${[size, weight].filter(Boolean).join(', ')})` : ''}. Generating the ${info.missingVariants.join(' / ')} px WebP copies lets each screen load the size it needs; the original stays untouched.`,
          fix: { type: 'generate-variants' },
          apply: { op: 'generate-variants', upload: info.upload },
        },
        subject
      )
    } else if (
      !info.variantEligible &&
      info.bytes !== null &&
      info.bytes > HEAVY_IMAGE_BYTES &&
      info.kind === 'upload'
    ) {
      this.add(
        {
          check: 'image-weight',
          severity: 'warning',
          item: ref.item,
          where: ref.where,
          line: ref.line,
          url: src,
          message: `Heavy ${info.format === 'gif' ? 'animated GIF' : info.animated ? 'animated image' : 'image'} (${weight})`,
          detail:
            info.format === 'gif' || info.animated
              ? 'Every visitor downloads all of it, and animations get no resized copies. A short MP4 / WebM video is usually several times smaller.'
              : 'Every visitor downloads all of it and no resized copy can stand in. Export it smaller (well under 1 MB) and upload it again.',
        },
        subject
      )
    }
    if (
      info.kind === 'upload' &&
      info.width &&
      info.height &&
      Math.max(info.width, info.height) > MAX_EDGE
    ) {
      this.add(
        {
          check: 'image-dimensions',
          severity: 'notice',
          item: ref.item,
          where: ref.where,
          line: ref.line,
          url: src,
          message: `Very large original (${size})`,
          detail: `Uploads are kept at most ${MAX_EDGE} px on the long side today; this older one is bigger, and large screens or the lightbox may still load it (${weight}). Uploading it again stores a resized copy.`,
        },
        `${subject}\u0000edge`
      )
    }
    if (ref.cover && info.width) {
      if (info.width < COVER_SHARP_MIN) {
        this.add(
          {
            check: 'image-dimensions',
            severity: 'warning',
            item: ref.item,
            where: ref.where,
            url: src,
            message: `Cover is ${info.width} px wide`,
            detail: `The page shows it at its own size on a tinted panel instead of stretching it. Upload one at least ${COVER_RECOMMENDED_MIN} px wide.`,
          },
          `${subject}\u0000cover`
        )
      } else if (info.width < COVER_RECOMMENDED_MIN) {
        this.add(
          {
            check: 'image-dimensions',
            severity: 'notice',
            item: ref.item,
            where: ref.where,
            url: src,
            message: `Cover is ${info.width} px wide`,
            detail: `Fine, but ${COVER_RECOMMENDED_MIN} px or wider stays sharp on large and high-density screens.`,
          },
          `${subject}\u0000cover`
        )
      }
    }
  }
}

// ── Per source ────────────────────────────────────────────────────────────

/** Frontmatter fields that hold links, with readable names (anything else that is an http(s) URL is still checked). */
const FIELD_LABEL: Record<string, string> = {
  link: 'Live link',
  repo: 'Repository',
  canonical: 'Canonical URL',
}
const NOT_LINK_FIELDS = new Set([
  'cover',
  'coverAlt',
  'coverFocus',
  'title',
  'seoTitle',
  'description',
  'summary',
  'date',
  'updated',
  'tags',
  'tech',
  'lang',
  'draft',
  'featured',
  'status',
  'role',
  'period',
  'team',
  'project',
])

function frontmatterLinks(doc: HealthDoc): LinkRef[] {
  const out: LinkRef[] = []
  const fm = doc.frontmatter || {}
  const push = (path: Array<string | number>, value: unknown, where: string) => {
    if (typeof value !== 'string' || !value.trim()) return
    const v = value.trim()
    if (!/^https?:\/\//i.test(v) && !/^\/(blog|work)\//.test(v)) return
    out.push({ item: doc.key, url: v, raw: value, where, place: { at: 'field', path, value } })
  }
  for (const [key, value] of Object.entries(fm)) {
    if (NOT_LINK_FIELDS.has(key)) continue
    if (typeof value === 'string') push([key], value, FIELD_LABEL[key] || key)
    else if (key === 'links' && Array.isArray(value)) {
      value.forEach((l, i) => {
        if (l && typeof l === 'object')
          push(['links', i, 'url'], (l as any).url, `Links › ${String((l as any).label || i + 1)}`)
      })
    } else if (key === 'outcomes' && Array.isArray(value)) {
      value.forEach((o, i) => {
        if (o && typeof o === 'object')
          push(['outcomes', i, 'sourceUrl'], (o as any).sourceUrl, `Metric ${i + 1} › Source`)
      })
    }
  }
  return out
}

function analyzeDoc(c: Collector, doc: HealthDoc) {
  const fmLinks = frontmatterLinks(doc)
  for (const l of fmLinks) c.link(l)
  const cover = typeof doc.frontmatter.cover === 'string' ? doc.frontmatter.cover : ''
  if (cover.trim())
    c.image({
      item: doc.key,
      url: cover,
      raw: cover,
      where: 'Cover',
      place: { at: 'field', path: ['cover'], value: cover },
      cover: true,
    })

  if (!doc.body.trim()) return
  const scan = scanBody(doc.body)
  if (!scan.ok) {
    c.add(
      {
        check: 'mdx',
        severity: 'error',
        item: doc.key,
        where: scan.line ? lineLabel(scan.line) : 'Body',
        line: scan.line ?? undefined,
        message: 'The body cannot be read',
        detail: `${scan.error}. The page may fail to update; open it in the editor, which points at the line.`,
      },
      'parse'
    )
    return
  }
  const body = { at: 'body' } as const
  for (const l of scan.links)
    c.link({
      item: doc.key,
      url: l.url,
      raw: l.raw,
      where: lineLabel(l.line),
      line: l.line,
      place: body,
    })
  for (const img of scan.images) {
    c.image({
      item: doc.key,
      url: img.url,
      raw: img.raw,
      where: lineLabel(img.line),
      line: img.line,
      place: body,
      alt: img.alt,
      decorative: img.jsx && img.alt === '',
    })
  }

  // Headings: the page title is the h1; a case study's "At a glance" and the
  // /about "Bio" section put the body under an h2.
  const glance =
    doc.kind === 'work' &&
    (String(doc.frontmatter.summary || '').trim() || cleanOutcomes(doc.frontmatter.outcomes).length)
  let prev = glance || doc.key === 'page/about' ? 2 : 1
  scan.headings.forEach((h, n) => {
    const subject = `${n}\u0000${h.depth}\u0000${h.text}`
    if (!h.text) {
      c.add(
        {
          check: 'heading',
          severity: 'warning',
          item: doc.key,
          where: lineLabel(h.line),
          line: h.line,
          message: `Empty heading (h${h.depth})`,
          detail:
            'It shows as a gap and screen readers announce a heading with no name. Give it text or remove it.',
        },
        subject
      )
    } else if (h.depth === 1) {
      c.add(
        {
          check: 'heading',
          severity: 'warning',
          item: doc.key,
          where: lineLabel(h.line),
          line: h.line,
          message: `“${h.text.slice(0, 60)}” is a second h1`,
          detail:
            'The title is already the page’s h1. Make this an h2 (##) so the outline, the table of contents and screen-reader navigation stay right.',
        },
        subject
      )
    } else if (h.depth > prev + 1) {
      c.add(
        {
          check: 'heading',
          severity: 'notice',
          item: doc.key,
          where: lineLabel(h.line),
          line: h.line,
          message: `Heading level jumps from h${prev} to h${h.depth}`,
          detail: `“${h.text.slice(0, 60)}” skips a level. People using screen readers move by heading level; make it an h${prev + 1} (${'#'.repeat(prev + 1)}) or add the missing level above it.`,
        },
        subject
      )
    }
    prev = h.depth
  })

  // Hard breaks
  if (scan.strayBackslashes.length) {
    const n = scan.strayBackslashes.length
    c.add(
      {
        check: 'hard-break',
        severity: 'warning',
        item: doc.key,
        where: lineLabel(scan.strayBackslashes[0].line),
        line: scan.strayBackslashes[0].line,
        message:
          n === 1 ? 'A paragraph ends in a stray “\\”' : `${n} paragraphs end in a stray “\\”`,
        detail:
          'A backslash at the end of a paragraph is not a line break, so the page prints it as a “\\”.',
        fix: { type: 'remove-backslash' },
        apply: { op: 'breaks', item: doc.key, fix: 'remove-backslash' },
      },
      'stray'
    )
  }
  if (scan.breakRuns.length) {
    const breaks = scan.breakRuns.reduce((s, r) => s + r.count, 0)
    const fixable = scan.breakRuns.some((r) => r.fixable)
    c.add(
      {
        check: 'hard-break',
        severity: 'notice',
        item: doc.key,
        where: lineLabel(scan.breakRuns[0].line),
        line: scan.breakRuns[0].line,
        message: `${plural(breaks, 'line break')} used as blank lines`,
        detail: `Hard breaks (“\\” or <br />) pad the text with empty lines inside one paragraph, so screen readers and reader mode see a single paragraph. A blank line between paragraphs gives the same space, styled consistently.${fixable ? '' : ' Fix it in the editor: the breaks sit inside a list, a quote or before a line that would change meaning.'}`,
        ...(fixable
          ? {
              fix: { type: 'paragraph-breaks' } as HealthFix,
              apply: { op: 'breaks', item: doc.key, fix: 'paragraph-breaks' } as ApplySpec,
            }
          : {}),
      },
      'runs'
    )
  }
  if (scan.invisibleBreaks.length) {
    const n = scan.invisibleBreaks.length
    c.add(
      {
        check: 'hard-break',
        severity: 'notice',
        item: doc.key,
        where: lineLabel(scan.invisibleBreaks[0].line),
        line: scan.invisibleBreaks[0].line,
        message: `${plural(n, 'invisible line break')}`,
        detail: `${n === 1 ? 'A line ends' : 'Lines end'} in two spaces, which forces a line break you cannot see in the editor. Marking ${n === 1 ? 'it' : 'them'} with “\\” keeps the page the same and makes the break visible.`,
        fix: { type: 'visible-breaks' },
        apply: { op: 'breaks', item: doc.key, fix: 'visible-breaks' },
      },
      'invisible'
    )
  }
}

function analyzeDescriptions(c: Collector, docs: readonly HealthDoc[]) {
  const articles = docs.filter((d) => d.kind === 'post' || d.kind === 'work')
  const groups = new Map<string, HealthDoc[]>()
  for (const d of articles) {
    const norm = normalizeText(d.description)
    if (!norm) continue
    groups.set(norm, [...(groups.get(norm) || []), d])
  }
  for (const d of articles) {
    const norm = normalizeText(d.description)
    if (!norm) {
      c.add(
        {
          check: 'description',
          severity: 'notice',
          item: d.key,
          where: 'Description',
          message: 'No description',
          detail:
            'Search results and link previews fall back to the first lines of the text. A written summary of 50–160 characters reads better.',
        },
        'missing'
      )
      continue
    }
    const same = (groups.get(norm) || []).filter((o) => o.key !== d.key)
    if (same.length) {
      c.add(
        {
          check: 'description',
          severity: 'warning',
          item: d.key,
          where: 'Description',
          message: `Same description as “${same[0].title.slice(0, 60)}”${same.length > 1 ? ` and ${plural(same.length - 1, 'other')}` : ''}`,
          detail:
            'Search results and link previews show the description; identical ones make different pages look like the same page. Write one for each.',
        },
        `dup\u0000${norm}`
      )
    }
    if (norm === normalizeText(d.title)) {
      c.add(
        {
          check: 'description',
          severity: 'notice',
          item: d.key,
          where: 'Description',
          message: 'Description repeats the title',
          detail:
            'Previews already show the title right above it. Say in a sentence what the reader gets from the page.',
        },
        'title'
      )
    }
  }
}

// ── CV ──

const LANG_LABEL = { en: 'EN', zh: '中文' } as const

function isUrlField(f: FieldDef): boolean {
  return f.kind === 'url' || f.format === 'https-link'
}

function analyzeCv(c: Collector, cv: NonNullable<AnalyzeInput['cv']>) {
  for (const lang of ['en', 'zh'] as const) {
    const sections = Array.isArray(cv.doc[lang]) ? (cv.doc[lang] as any[]) : []
    sections.forEach((section, si) => {
      if (!section || typeof section !== 'object') return
      if (!isSectionOnCv(section) && !isSectionOnWebsite(section)) return
      const def = SECTION_BY_NAME[String(section.sessionName || '')]
      if (!def) return
      const head = `${LANG_LABEL[lang]} · ${String(section.headerName || '').trim() || def.label}`
      const privateFields = new Set(PRIVATE_SECTION_FIELDS[def.sessionName] || [])
      const fields = (
        node: any,
        defs: FieldDef[] | undefined,
        path: Array<string | number>,
        label: string
      ) => {
        for (const f of defs || []) {
          if (!isUrlField(f) || privateFields.has(f.key) || isFieldHidden(node, f.key)) continue
          const value = node[f.key]
          if (typeof value !== 'string' || !value.trim()) continue
          const href = safeHref(value)
          if (!href) continue
          c.link({
            item: 'cv',
            url: href,
            raw: value.trim() === value ? value : null,
            where: `${label} › ${f.label}`,
            place: { at: 'field', path: [...path, f.key], value },
          })
        }
      }
      const lists = (
        node: any,
        defs: ListDef[] | undefined,
        path: Array<string | number>,
        label: string
      ) => {
        for (const l of defs || []) {
          if (isFieldHidden(node, l.key) || !Array.isArray(node[l.key])) continue
          const consent = CONSENT_LISTS[def.sessionName]
          ;(node[l.key] as any[]).forEach((entry, i) => {
            if (!entry || typeof entry !== 'object' || isEntryHidden(entry)) return
            if (consent && consent.list === l.key && entry[consent.flag] !== true) return
            const title = String(l.titleOf(entry) || '').trim()
            const entryLabel = `${label} › ${title ? title.slice(0, 48) : `${l.itemNoun} ${i + 1}`}`
            fields(entry, l.fields, [...path, l.key, i], entryLabel)
            lists(entry, l.lists, [...path, l.key, i], entryLabel)
          })
        }
      }
      fields(section, def.fields, [lang, si], head)
      lists(section, def.lists, [lang, si], head)
    })
  }
}

// ── Home ──

function analyzeHome(c: Collector, home: NonNullable<AnalyzeInput['home']>) {
  const doc = home.doc || {}
  const off = (k: string) => doc.sections?.[k] === false
  const link = (path: Array<string | number>, where: string) => {
    let node: any = doc
    for (const seg of path) node = node?.[seg as any]
    if (typeof node !== 'string' || !node.trim()) return
    const href = safeHref(node)
    if (!href) return
    c.link({
      item: 'home',
      url: href,
      raw: node.trim() === node ? node : null,
      where,
      place: { at: 'field', path, value: node },
    })
  }
  const image = (path: Array<string | number>, where: string) => {
    let node: any = doc
    for (const seg of path) node = node?.[seg as any]
    if (typeof node !== 'string' || !node.trim()) return
    c.image({
      item: 'home',
      url: node,
      raw: node.trim() === node ? node : null,
      where,
      place: { at: 'field', path, value: node },
    })
  }
  image(['hero', 'avatarUrl'], 'Introduction › Portrait')
  const SOCIAL: Record<string, string> = {
    github: 'GitHub',
    gitlab: 'GitLab',
    linkedin: 'LinkedIn',
    whatsapp: 'WhatsApp',
  }
  for (const k of Object.keys(SOCIAL)) link(['socials', k], `Socials › ${SOCIAL[k]}`)
  if (!off('brands') && Array.isArray(doc.brands)) {
    doc.brands.forEach((b: any, i: number) => {
      const name = String(b?.name || `Logo ${i + 1}`)
      link(['brands', i, 'href'], `Brand strip › ${name} › Link`)
      image(['brands', i, 'image'], `Brand strip › ${name} › Logo`)
    })
  }
  if (Array.isArray(doc.quickAccess)) {
    doc.quickAccess.forEach((q: any, i: number) =>
      link(['quickAccess', i, 'url'], `Quick access › ${String(q?.label || i + 1)}`)
    )
  }
  if (!off('photos') && Array.isArray(doc.photos)) {
    doc.photos.forEach((p: any, i: number) => {
      if (!p || p.visible === false) return
      const name =
        String(p.describe || '')
          .trim()
          .slice(0, 48) || `Photo ${i + 1}`
      image(['photos', i, 'url'], `Field notes › ${name}`)
      link(['photos', i, 'redirectTo'], `Field notes › ${name} › Link`)
    })
  }
  if (!off('highlights') && Array.isArray(doc.highlights)) {
    doc.highlights.forEach((h: any, i: number) =>
      link(['highlights', i, 'href'], `Highlights › ${String(h?.value || i + 1).slice(0, 48)}`)
    )
  }
  link(['availability', 'bookingUrl'], 'Availability › Booking link')
}

// ── Entry point ──

export function analyzeContent(input: AnalyzeInput): Analysis {
  const c = new Collector(input)
  const items: Record<string, HealthItem> = {}
  for (const d of input.docs) {
    items[d.key] = {
      key: d.key,
      kind: d.kind,
      title: d.title,
      editHref: d.editHref,
      publicHref: d.publicHref,
      version: d.version,
    }
    analyzeDoc(c, d)
  }
  analyzeDescriptions(c, input.docs)
  if (input.cv) {
    items.cv = {
      key: 'cv',
      kind: 'cv',
      title: 'CV',
      editHref: '/admin/dashboard?tab=cv',
      publicHref: '/cv',
      version: input.cv.version,
    }
    analyzeCv(c, input.cv)
  }
  if (input.home) {
    items.home = {
      key: 'home',
      kind: 'home',
      title: 'Home page',
      editHref: '/admin/dashboard?tab=home',
      publicHref: '/',
      version: input.home.version,
    }
    analyzeHome(c, input.home)
  }
  return { items, issues: c.finish(), external: c.external, images: c.images }
}

/** The issues as the browser gets them (no server-side apply specs). */
export function publicIssues(issues: readonly InternalIssue[]): HealthIssue[] {
  return issues.map((i) => {
    const out = { ...i }
    delete out.apply
    return out
  })
}

export { countIssues }
export type { HealthCheck }
