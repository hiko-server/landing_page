import { isMeaninglessAlt } from '../contentHealth/analyze'
import type { BodyScan } from '../contentHealth/mdxScan'
import { isValidUploadName } from '../security/uploadName'
import { variantOriginalName } from '../uploadVariants'
import type { MediaUsage, UsageAlt, UsageDocKind } from './types'

/**
 * Where the content refers to uploads (H7) — pure and unit-tested; the media
 * library's usage index (lib/media/library) stores what this returns.
 *
 * Every `/uploads/<name>` in the stored content counts — Markdown images,
 * JSX / HTML attributes (src, poster, href), links to the file, bare paths
 * and absolute URLs alike, in code too: blocking a delete on a mention that
 * would not render is harmless, deleting an image a page still shows is not.
 * A variant (`photo.jpg.w640.webp`) counts for its original.
 *
 * Sources: posts and case studies (drafts included) and their unpublished
 * changes, the /now, /uses and /about pages, the home document (hidden
 * sections and photos too), the CV (both languages; the PDF-only photo) and
 * any other stored document. Each place gets a readable label and links to
 * its editor and, for live content, its public page.
 */

export type UsageItem = {
  collection: 'blog' | 'work'
  slug: string
  frontmatter: Record<string, unknown>
  body: string
}

export type UsageSources = {
  items: UsageItem[]
  /** Unpublished changes of live items (lib/pendingRevisions). */
  pending: UsageItem[]
  pages: Array<{ name: string; frontmatter: Record<string, unknown>; body: string }>
  home: Record<string, unknown> | null
  cv: { en?: unknown; zh?: unknown } | null
  /** Other stored documents (kv rows), by key. */
  other: Array<{ key: string; value: unknown }>
}

export type UsageOptions = {
  /** Parses a body for its image tags (lib/contentHealth/mdxScan scanBody) — gives the alt of each image. */
  scanBody?: (body: string) => BodyScan
}

/** `/uploads/<name>` in any text; the name may be percent-encoded. */
const UPLOAD_REF_RE = /\/uploads\/([A-Za-z0-9._%-]+)/g

/** The original upload a referenced name stands for (a variant → its original), or null. */
export function originalOfRef(raw: string): string | null {
  let name: string
  try {
    name = decodeURIComponent(raw)
  } catch {
    return null
  }
  // A path at the end of a sentence ("…/uploads/a.png.") keeps its full stop out.
  name = name.replace(/\.+$/, '')
  if (!isValidUploadName(name)) return null
  return variantOriginalName(name) ?? name
}

export type UploadRef = { name: string; index: number; line: number }

/** Every upload reference in `text`, in order, with its 1-based line. */
export function uploadRefsIn(text: unknown): UploadRef[] {
  if (typeof text !== 'string' || !text.includes('/uploads/')) return []
  const out: UploadRef[] = []
  let line = 1
  let at = 0
  for (const m of text.matchAll(UPLOAD_REF_RE)) {
    const index = m.index ?? 0
    for (; at < index; at++) if (text.charCodeAt(at) === 10) line++
    const name = originalOfRef(m[1])
    if (name) out.push({ name, index, line })
  }
  return out
}

const ALT_RANK: Record<UsageAlt, number> = { missing: 3, meaningless: 2, decorative: 1, ok: 0 }

/** The weaker of two alt states (a missing alt anywhere at a place is what the owner needs to see). */
export function weakerAlt(a: UsageAlt | null, b: UsageAlt | null): UsageAlt | null {
  if (!a) return b
  if (!b) return a
  return ALT_RANK[b] > ALT_RANK[a] ? b : a
}

/** The alt state of an alt text as written (null = a JSX image without an alt attribute). */
export function altState(alt: string | null | undefined, jsx = false): UsageAlt {
  if (alt === null || alt === undefined) return 'missing'
  const a = alt.trim()
  if (!a) return jsx && alt === '' ? 'decorative' : 'missing'
  return isMeaninglessAlt(a) ? 'meaningless' : 'ok'
}

type DocInfo = {
  doc: string
  docKind: UsageDocKind
  docTitle: string
  docState: MediaUsage['docState']
  editHref: string | null
  publicHref: string | null
}

type Collector = {
  add(doc: DocInfo, field: string, label: string, name: string, line: number | null, alt: UsageAlt | null): void
  result(): MediaUsage[]
}

function collector(): Collector {
  const map = new Map<string, MediaUsage & { lines: number[] }>()
  return {
    add(doc, field, label, name, line, alt) {
      const key = `${name}\u0000${doc.doc}\u0000${field}`
      const hit = map.get(key)
      if (hit) {
        hit.count++
        hit.alt = weakerAlt(hit.alt, alt)
        if (line !== null && !hit.lines.includes(line)) hit.lines.push(line)
        return
      }
      map.set(key, { name, ...doc, field, label, line, alt, count: 1, lines: line === null ? [] : [line] })
    },
    result() {
      return Array.from(map.values()).map(({ lines, ...u }) => {
        if (u.field !== 'body' || !lines.length) return u
        const shown = lines.slice(0, 4).join(', ')
        const more = lines.length > 4 ? ', …' : ''
        return { ...u, line: lines[0], label: `${u.label} · ${lines.length > 1 ? 'lines' : 'line'} ${shown}${more}` }
      })
    },
  }
}

const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Every string in a JSON-like value with its path. */
function walkStrings(value: unknown, visit: (s: string, path: Array<string | number>) => void, path: Array<string | number> = []): void {
  if (typeof value === 'string') {
    if (value.includes('/uploads/')) visit(value, path)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, visit, [...path, i]))
    return
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) walkStrings(v, visit, [...path, k])
  }
}

const humanKey = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/** "photos › 2 › url" → "Photos › 3 › Url" (array positions count from 1). */
function pathLabel(path: Array<string | number>): string {
  return path.map((p) => (typeof p === 'number' ? String(p + 1) : humanKey(p))).join(' › ')
}

const fieldKey = (path: Array<string | number>) => path.join('.')

// ── MDX documents ──────────────────────────────────────────────────────────

function scanMdx(c: Collector, doc: DocInfo, fm: Record<string, unknown>, body: string, opts: UsageOptions) {
  walkStrings(fm, (s, path) => {
    const top = path.length === 1 && path[0] === 'cover'
    for (const ref of uploadRefsIn(s)) {
      if (top) c.add(doc, 'cover', 'Cover', ref.name, null, altState(typeof fm.coverAlt === 'string' ? fm.coverAlt : ''))
      else c.add(doc, `fm.${fieldKey(path)}`, `Frontmatter › ${pathLabel(path)}`, ref.name, null, null)
    }
  })
  const refs = uploadRefsIn(body)
  if (!refs.length) return
  // The image tags of the body, by line and original name, for their alt text.
  const altAt = new Map<string, UsageAlt>()
  const scan = opts.scanBody ? opts.scanBody(body) : null
  if (scan && scan.ok) {
    for (const img of scan.images) {
      const m = /\/uploads\/([A-Za-z0-9._%-]+)/.exec(img.url)
      const name = m ? originalOfRef(m[1]) : null
      if (!name) continue
      const key = `${img.line}\u0000${name}`
      altAt.set(key, weakerAlt(altAt.get(key) ?? null, altState(img.alt, img.jsx)) as UsageAlt)
    }
  }
  for (const ref of refs) c.add(doc, 'body', 'Body', ref.name, ref.line, altAt.get(`${ref.line}\u0000${ref.name}`) ?? null)
}

const COLLECTION_KIND = { blog: 'post', work: 'work' } as const

function itemDoc(item: UsageItem, pending: boolean): DocInfo {
  const draft = !!item.frontmatter?.draft
  const title = str(item.frontmatter?.title) || item.slug
  const slug = encodeURIComponent(item.slug)
  return {
    doc: `${item.collection}/${item.slug}${pending ? '#pending' : ''}`,
    docKind: COLLECTION_KIND[item.collection],
    docTitle: title,
    docState: pending ? 'pending' : draft ? 'draft' : 'live',
    editHref: `/admin/${item.collection}/edit?slug=${slug}`,
    publicHref: pending || draft ? null : `/${item.collection}/${item.slug}`,
  }
}

const PAGE_TITLE: Record<string, string> = { now: '/now', uses: '/uses', about: 'About bio' }

// ── Home and CV ───────────────────────────────────────────────────────────

/** Labels of the home document's image fields, like the home editor names them. */
export function homeFieldLabel(home: Record<string, unknown>, path: Array<string | number>): string {
  const [a, i, b] = path
  if (a === 'hero' && i === 'avatarUrl') return 'Introduction › Portrait'
  if (a === 'brands' && typeof i === 'number') {
    const brand = (home.brands as Array<Record<string, unknown>> | undefined)?.[i]
    const name = str(brand?.name, 48) || `Logo ${i + 1}`
    return `Brand strip › ${name}${b === 'image' ? ' › Logo' : b ? ` › ${humanKey(String(b))}` : ''}`
  }
  if (a === 'photos' && typeof i === 'number') {
    const photo = (home.photos as Array<Record<string, unknown>> | undefined)?.[i]
    const name = str(photo?.describe, 48) || `Photo ${i + 1}`
    const hidden = photo?.visible === false ? ' (hidden)' : ''
    return `Field notes › ${name}${hidden}${b && b !== 'url' ? ` › ${humanKey(String(b))}` : ''}`
  }
  return pathLabel(path)
}

const CV_LANG = { en: 'EN', zh: '中文' } as const

function scanCv(c: Collector, cv: NonNullable<UsageSources['cv']>) {
  for (const lang of ['en', 'zh'] as const) {
    const sections = Array.isArray(cv[lang]) ? (cv[lang] as unknown[]) : []
    sections.forEach((section, si) => {
      if (!section || typeof section !== 'object') return
      const s = section as Record<string, unknown>
      const head = str(s.headerName, 48) || humanKey(str(s.sessionName, 48) || `Section ${si + 1}`)
      walkStrings(section, (value, path) => {
        const photo = s.sessionName === 'personalInformation' && path.length === 1 && path[0] === 'photo'
        const doc: DocInfo = {
          doc: 'cv',
          docKind: 'cv',
          docTitle: 'CV',
          // The PDF photo never reaches a public page (lib/cvVisibility).
          docState: photo ? 'private' : 'live',
          editHref: '/admin/dashboard?tab=cv',
          publicHref: null,
        }
        const label = photo ? `Photo (PDF only) · ${CV_LANG[lang]}` : `${CV_LANG[lang]} · ${head} › ${pathLabel(path)}`
        for (const ref of uploadRefsIn(value)) c.add(doc, `${lang}.${si}.${fieldKey(path)}`, label, ref.name, null, null)
      })
    })
  }
}

/** Every place the content refers to an upload, grouped per (upload, document, field). */
export function scanUsage(src: UsageSources, opts: UsageOptions = {}): MediaUsage[] {
  const c = collector()
  for (const item of src.items) scanMdx(c, itemDoc(item, false), item.frontmatter || {}, item.body || '', opts)
  for (const item of src.pending) scanMdx(c, itemDoc(item, true), item.frontmatter || {}, item.body || '', opts)
  for (const page of src.pages) {
    const doc: DocInfo = {
      doc: `page/${page.name}`,
      docKind: 'page',
      docTitle: PAGE_TITLE[page.name] || `/${page.name}`,
      docState: 'live',
      editHref: `/admin/${page.name}`,
      publicHref: `/${page.name}`,
    }
    scanMdx(c, doc, page.frontmatter || {}, page.body || '', opts)
  }
  if (src.home) {
    const home = src.home
    const doc: DocInfo = { doc: 'home', docKind: 'home', docTitle: 'Home page', docState: 'live', editHref: '/admin/dashboard?tab=home', publicHref: '/' }
    walkStrings(home, (value, path) => {
      for (const ref of uploadRefsIn(value)) c.add(doc, fieldKey(path), homeFieldLabel(home, path), ref.name, null, null)
    })
  }
  if (src.cv) scanCv(c, src.cv)
  for (const { key, value } of src.other) {
    const doc: DocInfo = { doc: `kv/${key}`, docKind: 'setting', docTitle: `Stored data “${key}”`, docState: null, editHref: null, publicHref: null }
    walkStrings(value, (s, path) => {
      for (const ref of uploadRefsIn(s)) c.add(doc, fieldKey(path) || 'value', pathLabel(path) || 'Value', ref.name, null, null)
    })
  }
  return c.result()
}

/** Usage grouped by upload name. */
export function usageByName(usage: readonly MediaUsage[]): Map<string, MediaUsage[]> {
  const out = new Map<string, MediaUsage[]>()
  for (const u of usage) {
    const list = out.get(u.name)
    if (list) list.push(u)
    else out.set(u.name, [u])
  }
  return out
}
