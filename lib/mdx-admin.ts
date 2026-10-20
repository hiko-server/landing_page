import { PAGE_NAMES, isPageName, type PageName } from './pageNames'
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import type { NextApiRequest, NextApiResponse } from 'next'
import { getDb } from './db'
import { log } from './log'
import { sendVersionedJson } from './http'
import type { ApiHandler } from './apiHandler'
import { isAdminRequest } from './auth'
import { requireRecentAuth } from './adminAuth/stepUp'
import { rateLimit } from './rateLimit'
import { COLLECTION_EXTRA_PATHS, CV_DOCUMENT_PATHS, collectionPaths, revalidatePaths } from './revalidate'
import { ensurePosters } from './videoPoster'
import { detectContentLang } from './toc'
import { normalizeTranslationKey } from './translations'
import { noteSnapshot } from './audit/context'
import {
  getPage,
  putPage as storePutPage,
  listItems,
  getItem,
  putItem as storePutItem,
  removeItem,
  jsonSafeFrontmatter,
  kvEtag,
  ifMatchAllows,
  type PutItemOptions,
  type StoreError,
} from './contentStore'
import { deletePendingRevision, getPendingRevision, pendingRevisionIndex, putPendingRevision } from './pendingRevisions'
import { forgetRedirectFrom, redirectsTo, removeRedirect } from './redirects'
import { planRename, renameSlug } from './slugRename'
import { emitEditorialEvent } from './editorialEvents'
import { carryScheduleOnSave, itemSchedule, parseScheduleBody, withoutSchedule } from './schedule/fields'
import { applySchedule, collectionSchedules } from './schedule/store'
import { rearmPublishScheduler } from './schedule/scheduler'

/**
 * Admin-only operations for MDX collections and the single pages (/now,
 * /uses and the /about bio).
 *
 * Backed by the dual-write content store (SQLite + Cloudflare R2). Legacy
 * filesystem (content/*.mdx) is auto-seeded into the DB on first read and
 * is no longer mutated by admin writes — operators manage the canonical
 * copy through the DB/R2 pair, with the migration scripts as the bridge.
 *
 * Versions: every read carries `updatedAt` (the store row's updated_at in
 * ms, 0 when there is no row), which the admin APIs send as the ETag.
 *
 * Snapshot strategy:
 *   On every write/delete, the current DB record (if any) is serialised to
 *   data/{blog|work|page}_snapshots/{slug}_{UTC stamp}.mdx so the history
 *   drawer can offer diff + restore and deleted items can be brought back.
 *   Only the newest SNAPSHOTS_PER_ITEM files of each slug are kept. Slugs
 *   may contain '_', so filenames are parsed with a right-anchored pattern.
 */

const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/

/** Snapshots kept per item (older ones are pruned after each new snapshot). */
export const SNAPSHOTS_PER_ITEM = 50

/** `<slug>_<YYYY-MM-DD_HH-MM-SS-mmm>.mdx`; the stamp is UTC. */
export const MDX_SNAPSHOT_RE = /^(.+)_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3})\.mdx$/

export type Collection = 'blog' | 'work'
export type SnapshotKind = Collection | 'page'

export type SnapshotInfo = {
  filename: string
  slug: string
  /** ISO timestamp (UTC) the snapshot was taken. */
  date: string
}

export type SnapshotDoc = {
  frontmatter: Record<string, any>
  body: string
}

function dataDir(): string {
  return path.join(process.cwd(), 'data')
}

function snapshotDir(kind: SnapshotKind): string {
  return path.join(dataDir(), `${kind}_snapshots`)
}

export function isSafeSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length <= 128 && SLUG_RE.test(slug)
}

/** Parse a snapshot filename; null for anything that is not one of ours. */
export function parseSnapshotName(filename: unknown): SnapshotInfo | null {
  if (typeof filename !== 'string' || filename.includes('/') || filename.includes('\\')) return null
  const m = MDX_SNAPSHOT_RE.exec(filename)
  if (!m || !SLUG_RE.test(m[1])) return null
  const [day, time] = m[2].split('_')
  const [hh, mm, ss, ms] = time.split('-')
  const date = `${day}T${hh}:${mm}:${ss}.${ms}Z`
  if (Number.isNaN(Date.parse(date))) return null
  return { filename, slug: m[1], date }
}

function stampOf(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

/** Every snapshot in a kind's directory, newest first. */
function allSnapshots(kind: SnapshotKind): SnapshotInfo[] {
  let files: string[]
  try {
    files = fs.readdirSync(snapshotDir(kind))
  } catch {
    return []
  }
  const out: SnapshotInfo[] = []
  for (const f of files) {
    const info = parseSnapshotName(f)
    if (info) out.push(info)
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** Snapshots of one slug / page name, newest first. */
export function listSnapshots(kind: SnapshotKind, slug: string): SnapshotInfo[] {
  if (!isSafeSlug(slug)) return []
  return allSnapshots(kind).filter((s) => s.slug === slug)
}

/** Keep only the newest `keep` snapshots of `slug`; returns the removed names. */
export function pruneItemSnapshots(kind: SnapshotKind, slug: string, keep = SNAPSHOTS_PER_ITEM): string[] {
  const removed: string[] = []
  for (const s of listSnapshots(kind, slug).slice(Math.max(0, keep))) {
    try {
      fs.unlinkSync(path.join(snapshotDir(kind), s.filename))
      removed.push(s.filename)
    } catch (err) {
      log.warn('could not prune snapshot', { file: s.filename, err })
    }
  }
  return removed
}

/** True when `slug` has snapshots (e.g. a deleted item's history). */
export function hasItemSnapshots(kind: SnapshotKind, slug: string): boolean {
  return listSnapshots(kind, slug).length > 0
}

/**
 * Move an item's history to its new slug after a rename (H6): every
 * `<from>_<stamp>.mdx` becomes `<to>_<stamp>.mdx`, so the history drawer
 * keeps showing it and the old slug never shows up under "Recently
 * deleted". Returns how many files moved.
 */
export function moveItemSnapshots(kind: SnapshotKind, from: string, to: string): number {
  if (!isSafeSlug(from) || !isSafeSlug(to)) return 0
  let moved = 0
  for (const s of listSnapshots(kind, from)) {
    const stamp = MDX_SNAPSHOT_RE.exec(s.filename)?.[2]
    if (!stamp) continue
    const target = path.join(snapshotDir(kind), `${to}_${stamp}.mdx`)
    if (fs.existsSync(target)) continue
    try {
      fs.renameSync(path.join(snapshotDir(kind), s.filename), target)
      moved++
    } catch (err) {
      log.warn('could not move snapshot after a rename', { file: s.filename, err })
    }
  }
  return moved
}

/** Read and parse one snapshot (frontmatter + body); null when missing or unsafe. */
export function readSnapshot(kind: SnapshotKind, filename: unknown): SnapshotDoc | null {
  const info = parseSnapshotName(filename)
  if (!info) return null
  const fp = path.join(snapshotDir(kind), info.filename)
  let raw: string
  try {
    raw = fs.readFileSync(fp, 'utf-8')
  } catch {
    return null
  }
  const parsed = matter(raw)
  // gray-matter caches by input string and hands back the same object.
  return { frontmatter: jsonSafeFrontmatter({ ...parsed.data }), body: parsed.content }
}

function writeSnapshot(kind: SnapshotKind, slug: string, frontmatter: Record<string, any>, body: string): string {
  const dir = snapshotDir(kind)
  fs.mkdirSync(dir, { recursive: true })
  let now = new Date()
  let filename = `${slug}_${stampOf(now)}.mdx`
  // Two snapshots in the same millisecond must not overwrite each other.
  while (fs.existsSync(path.join(dir, filename))) {
    now = new Date(now.getTime() + 1)
    filename = `${slug}_${stampOf(now)}.mdx`
  }
  const yaml = matter.stringify(body || '\n', frontmatter)
  fs.writeFileSync(path.join(dir, filename), yaml, 'utf-8')
  pruneItemSnapshots(kind, slug)
  // The activity log links this version to the write that replaces it (lib/audit).
  noteSnapshot(kind, filename)
  return filename
}

// ── Collections (blog, work) ──────────────────────────────────────────────

export function listAll(c: Collection): Array<{
  slug: string
  frontmatter: Record<string, any>
  size: number
  mtime: number
  /** The item's language as the site uses it: frontmatter `lang`, else detected (lib/toc) — the editors' translation block. */
  lang: string
}> {
  return listItems(c).map((item) => {
    const yaml = matter.stringify(item.body || '\n', item.frontmatter)
    return {
      slug: item.slug,
      frontmatter: item.frontmatter,
      size: Buffer.byteLength(yaml, 'utf-8'),
      mtime: item.updated_at,
      lang: detectContentLang({ lang: item.frontmatter?.lang, title: item.frontmatter?.title, body: item.body }),
    }
  })
}

/**
 * Slugs of the items that carry one of `keys` as their translation key
 * (lib/translations): the other language versions of a piece, whose
 * language switch, hreflang and index entry name it.
 */
export function translationPartners(c: Collection, keys: readonly unknown[]): string[] {
  const wanted = new Set(keys.map(normalizeTranslationKey).filter(Boolean))
  if (!wanted.size) return []
  return listItems(c)
    .filter((item) => wanted.has(normalizeTranslationKey(item.frontmatter?.translationKey)))
    .map((item) => item.slug)
}

export type AdminItem = {
  slug: string
  frontmatter: Record<string, any>
  body: string
  /** Store row updated_at (ms), the item's version. */
  updatedAt: number
}

export function readOne(c: Collection, slug: string): AdminItem | null {
  if (!isSafeSlug(slug)) return null
  const item = getItem(c, slug)
  if (!item) return null
  return { slug: item.slug, frontmatter: item.frontmatter, body: item.body, updatedAt: Math.trunc(item.updated_at) }
}

/** Snapshot the live item (if any); returns the snapshot filename. */
function snapshot(c: Collection, slug: string): string | null {
  const existing = getItem(c, slug)
  if (!existing) return null
  return writeSnapshot(c, slug, existing.frontmatter, existing.body)
}

export async function writeOne(
  c: Collection,
  slug: string,
  frontmatter: Record<string, any>,
  body: string,
  opts: PutItemOptions = {},
): Promise<StoreError> {
  if (!isSafeSlug(slug)) return { ok: false, error: 'Invalid slug (use a-z, 0-9, -, _)' }
  snapshot(c, slug)
  return await storePutItem(c, slug, frontmatter, body, opts)
}

export async function deleteOne(
  c: Collection,
  slug: string,
): Promise<(StoreError & { snapshot?: string }) | { ok: false; error: string }> {
  if (!isSafeSlug(slug)) return { ok: false, error: 'Invalid slug' }
  const existing = getItem(c, slug)
  if (!existing) return { ok: false, error: 'Not found' }
  const snap = snapshot(c, slug)
  const result = await removeItem(c, slug)
  return result.ok && snap ? { ...result, snapshot: snap } : result
}

export type DeletedItem = {
  slug: string
  title: string
  /** Newest snapshot (the state right before the delete). */
  filename: string
  date: string
}

/** Slugs that have snapshots but no live item, newest deletion first. */
export function listDeleted(c: Collection, limit = 100): DeletedItem[] {
  const live = new Set(listItems(c).map((i) => i.slug))
  const seen = new Set<string>()
  const out: DeletedItem[] = []
  for (const s of allSnapshots(c)) {
    if (live.has(s.slug) || seen.has(s.slug)) continue
    seen.add(s.slug)
    const doc = readSnapshot(c, s.filename)
    const title = doc && typeof doc.frontmatter.title === 'string' ? doc.frontmatter.title : ''
    out.push({ slug: s.slug, title, filename: s.filename, date: s.date })
    if (out.length >= limit) break
  }
  return out
}

/**
 * Write a snapshot back as the live item (the current state, if any, is
 * snapshotted first by writeOne, so a restore can itself be undone).
 * Unpublished changes (H4) are what the editor shows, and the restore
 * replaces them too — so they are kept in the history first, never lost.
 */
export async function restoreItemSnapshot(
  c: Collection,
  slug: string,
  filename: string,
): Promise<StoreError | { ok: false; error: string; notFound: true }> {
  const info = parseSnapshotName(filename)
  if (!info || info.slug !== slug) return { ok: false, error: 'Snapshot not found', notFound: true }
  const doc = readSnapshot(c, filename)
  if (!doc) return { ok: false, error: 'Snapshot not found', notFound: true }
  const pending = getPendingRevision(c, slug)
  if (pending) writeSnapshot(c, slug, pending.frontmatter, pending.body)
  // The schedule (H5) is not part of a version: the restored item keeps the current one, never the snapshot's.
  const current = getItem(c, slug)
  const frontmatter = carryScheduleOnSave({ target: 'live', live: current?.frontmatter ?? null, pending: null, incoming: doc.frontmatter, now: Date.now() })
  const out = await writeOne(c, slug, frontmatter, doc.body)
  if (out.ok && pending) deletePendingRevision(c, slug)
  if (out.ok) rearmPublishScheduler()
  return out
}

// ── Single-file pages (now, uses, about) ──────────────────────────────────

/**
 * The owner-written single pages: /now and /uses (an automatic version shows
 * while the body is empty), the bio on /about (no bio section while it is
 * empty) and the Chinese bio, which publishes /zh/about (lib/pageNames).
 */
export { PAGE_NAMES, isPageName, type PageName }

function pageUpdatedAt(name: PageName): number {
  const row = getDb().prepare('SELECT updated_at FROM pages WHERE name = ?').get(name) as
    | { updated_at: number }
    | undefined
  return row ? Math.trunc(row.updated_at) : 0
}

export function readPage(name: PageName): {
  name: PageName
  frontmatter: Record<string, any>
  body: string
  /** Store row updated_at (ms), 0 when the page has never been stored. */
  updatedAt: number
} {
  const page = getPage(name)
  if (!page) return { name, frontmatter: {}, body: '', updatedAt: 0 }
  return { name, frontmatter: page.frontmatter, body: page.body, updatedAt: pageUpdatedAt(name) }
}

function snapshotPage(name: PageName): string | null {
  const existing = getPage(name)
  if (!existing) return null
  return writeSnapshot('page', name, existing.frontmatter, existing.body)
}

export async function writePage(
  name: PageName,
  frontmatter: Record<string, any>,
  body: string,
): Promise<StoreError> {
  if (!isPageName(name)) return { ok: false, error: 'Invalid page name' }
  snapshotPage(name)
  return await storePutPage(name, frontmatter, body)
}

export async function restorePageSnapshot(
  name: PageName,
  filename: string,
): Promise<StoreError | { ok: false; error: string; notFound: true }> {
  const info = parseSnapshotName(filename)
  if (!info || info.slug !== name) return { ok: false, error: 'Snapshot not found', notFound: true }
  const doc = readSnapshot('page', filename)
  if (!doc) return { ok: false, error: 'Snapshot not found', notFound: true }
  return await writePage(name, doc.frontmatter, doc.body)
}

// ── HTTP helpers shared by /api/admin/posts, /work and /page ──────────────

/** Strong ETag of an item / page version (`"<updated_at ms>"`, `"0"` when absent). */
export function versionEtag(updatedAt: number): string {
  return kvEtag(updatedAt)
}

/**
 * Optimistic-concurrency check for an admin PUT. No If-Match header keeps the
 * legacy "last write wins" behaviour; otherwise the header must name the
 * current version. On a mismatch this answers 409 VERSION_CONFLICT (with the
 * current ETag, so the editor can offer "Reload latest") and returns false.
 */
export function checkIfMatch(req: NextApiRequest, res: NextApiResponse, currentUpdatedAt: number): boolean {
  if (ifMatchAllows(req.headers['if-match'], currentUpdatedAt)) return true
  const etag = versionEtag(currentUpdatedAt)
  sendVersionedJson(
    res,
    409,
    { code: 'VERSION_CONFLICT', error: 'This was changed elsewhere since you loaded it', etag },
    etag,
  )
  return false
}

export type MdxProblem = { code: 'MDX_INVALID'; line: number | null; column: number | null; reason: string; error: string }

type Compiled = Awaited<ReturnType<typeof import('./mdx').compileMdx>>

/**
 * Compile a body with the public renderer (lib/mdx compileMdx) without
 * storing anything: the rendered tree, or the 422 payload with the position
 * of the first error. Anything the renderer throws counts — a body it cannot
 * compile would break the public page.
 */
export async function compileForAdmin(body: string): Promise<({ ok: true } & Compiled) | { ok: false; problem: MdxProblem }> {
  const { compileMdx, MdxCompileError } = await import('./mdx')
  try {
    return { ok: true, ...(await compileMdx(body)) }
  } catch (err) {
    const known = err instanceof MdxCompileError
    const reason = known ? err.reason : err instanceof Error ? err.message : String(err)
    // Some parser messages carry their position only in the text: "… (3:1-3:10)".
    const inText = /\((\d+):(\d+)(?:-\d+:\d+)?\)/.exec(reason)
    const line = known && typeof err.line === 'number' ? err.line : inText ? Number(inText[1]) : null
    const column = known && typeof err.column === 'number' ? err.column : inText ? Number(inText[2]) : null
    if (!known) log.error('MDX renderer failed on an admin body', { err })
    const where = line !== null ? `Line ${line}${column !== null ? `:${column}` : ''}: ` : ''
    return { ok: false, problem: { code: 'MDX_INVALID', line, column, reason, error: `${where}${reason}` } }
  }
}

/** Null when the body renders, else the 422 MDX_INVALID payload. */
export async function mdxProblem(body: string): Promise<MdxProblem | null> {
  const out = await compileForAdmin(body)
  return out.ok ? null : out.problem
}

/**
 * Public pages to regenerate after a write to `slug`: the index, the item,
 * its siblings (prev/next and related links), the pages outside the
 * collection that list or link it (COLLECTION_EXTRA_PATHS: the home page's
 * latest writing, case-study links on / and /about) and the CV pages (their
 * skill evidence cites posts and case studies, and projects link their case
 * study). Its translations (F2) come first among the siblings, so the cap
 * never leaves out a page whose language switch names it: those of the
 * item's key as stored now, and of `previousKeys` (the key before the write
 * or delete — a version that left a group must vanish from its partners).
 * A failed refresh never fails the write (the ISR window still applies).
 */
export async function refreshCollection(res: NextApiResponse, c: Collection, slug: string, previousKeys: readonly unknown[] = []) {
  const partners = translationPartners(c, [getItem(c, slug)?.frontmatter?.translationKey, ...previousKeys])
  const siblings = [...partners, ...listItems(c).map((i) => i.slug)]
  const paths = [...collectionPaths(c, slug, siblings), ...COLLECTION_EXTRA_PATHS[c], ...CV_DOCUMENT_PATHS]
  const failed = await revalidatePaths(res, paths)
  return {
    revalidated: paths.filter((p) => !failed.includes(p)),
    ...(failed.length ? { revalidateFailed: failed } : {}),
  }
}

/**
 * Version of an item as the editor sees it (H4): the live row's updated_at,
 * plus the pending revision's when there is one — `"<live>"` or
 * `"<live>.<pending>"`. Any change to either (a save in another tab, a
 * publish, a discard, a restore) changes it, so If-Match catches them all.
 */
export function itemEtag(liveUpdatedAt: number, pendingUpdatedAt?: number | null): string {
  const live = Number.isFinite(liveUpdatedAt) && liveUpdatedAt > 0 ? Math.trunc(liveUpdatedAt) : 0
  const pending = typeof pendingUpdatedAt === 'number' && pendingUpdatedAt > 0 ? Math.trunc(pendingUpdatedAt) : 0
  return pending ? `"${live}.${pending}"` : `"${live}"`
}

/** If-Match against an item version (itemEtag); no header keeps "last write wins". */
export function itemIfMatchAllows(header: string | string[] | undefined, liveUpdatedAt: number, pendingUpdatedAt?: number | null): boolean {
  const raw = Array.isArray(header) ? header.join(',') : header
  if (typeof raw !== 'string' || raw.trim() === '') return true
  const current = itemEtag(liveUpdatedAt, pendingUpdatedAt)
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .some((t) => (t === '*' ? liveUpdatedAt > 0 : t === current))
}

function checkItemIfMatch(req: NextApiRequest, res: NextApiResponse, liveUpdatedAt: number, pendingUpdatedAt?: number | null): boolean {
  if (itemIfMatchAllows(req.headers['if-match'], liveUpdatedAt, pendingUpdatedAt)) return true
  const etag = itemEtag(liveUpdatedAt, pendingUpdatedAt)
  sendVersionedJson(res, 409, { code: 'VERSION_CONFLICT', error: 'This was changed elsewhere since you loaded it', etag }, etag)
  return false
}

/**
 * The editor's view of one item (GET ?slug, and the answer of a schedule
 * change): the live version, its pending revision, the old slugs that
 * redirect to it and its schedule (H5) — the frontmatter without the
 * schedule keys, which only the schedule action sets — with its ETag.
 */
export function itemPayload(c: Collection, slug: string): { body: Record<string, unknown>; etag: string } | null {
  const one = readOne(c, slug)
  if (!one) return null
  const pending = getPendingRevision(c, slug)
  return {
    body: {
      ...one,
      frontmatter: withoutSchedule(one.frontmatter),
      pending: pending
        ? { frontmatter: withoutSchedule(pending.frontmatter), body: pending.body, updatedAt: pending.updatedAt, baseUpdatedAt: pending.baseUpdatedAt }
        : null,
      redirectsFrom: redirectsTo(c, slug),
      schedule: itemSchedule(one.frontmatter, pending?.frontmatter),
    },
    etag: itemEtag(one.updatedAt, pending?.updatedAt),
  }
}

/** A stored item counts as a draft when its `draft` flag is truthy (lib/mdx's rule). */
export const isDraftFrontmatter = (fm: Record<string, any> | null | undefined) => Boolean(fm?.draft)

/**
 * Admin CRUD for a collection (blog posts, case studies):
 *
 *   GET    ?slug=foo  → { slug, frontmatter, body, updatedAt, pending, redirectsFrom, schedule }
 *                       with ETag itemEtag(live, pending); `pending` is the
 *                       unpublished revision of a live item ({ frontmatter,
 *                       body, updatedAt, baseUpdatedAt }) or null;
 *                       `redirectsFrom` the old slugs that redirect here
 *   GET               → { items } (drafts included; `pendingAt` per item)
 *   PUT    { slug, frontmatter, body, create?, target? } (optional If-Match)
 *          target 'live' (default): write the item (a pending revision is
 *            superseded and dropped) → 200 { ok, etag, revalidated }
 *          target 'pending': store the edits of a PUBLISHED item as its
 *            pending revision; the public pages keep the live version and
 *            nothing is regenerated → 200 { ok, pending, etag }
 *          → 409 { code:'SLUG_EXISTS' } when `create` hits an existing slug
 *          → 409 { code:'NOT_PUBLISHED' } for target 'pending' on a draft
 *          → 409 { code:'VERSION_CONFLICT', etag } when If-Match is stale
 *          → 422 { code:'MDX_INVALID', line, column, reason } when the body
 *            does not compile (nothing is written)
 *   POST   { action:'schedule', slug, publishAt, unpublishAt, setDate?, markUpdated? }
 *          (H5, optional If-Match) set or clear when the draft / the pending
 *          changes go live and when the live item unpublishes (ISO instants
 *          or null; lib/schedule) → 200 with the GET ?slug payload and ETag;
 *          400 BAD_TIME / IN_THE_PAST / WINDOW …, 409 NOTHING_TO_PUBLISH
 *   POST   { action:'discard-pending', slug } → drop the pending revision
 *   POST   { action:'rename', slug, to, redirect?, dryRun? } → move the item
 *          to a new slug (lib/slugRename): the old address redirects (308)
 *          unless redirect is false, internal links are rewritten; dryRun
 *          only reports what would change
 *   POST   { action:'remove-redirect', slug, from } → the old address `from`
 *          stops redirecting to `slug`
 *   DELETE ?slug=foo  → { ok, snapshot, revalidated } (snapshot first; needs a
 *                       recent sign-in or step-up, else 403 STEP_UP_REQUIRED)
 */
export function createCollectionApi(c: Collection, opts: { noun: string; requireDate: boolean }): ApiHandler {
  return async (req, res) => {
    if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    res.setHeader('Cache-Control', 'no-store')

    if (req.method === 'GET') {
      const slug = req.query.slug
      if (slug !== undefined) {
        if (typeof slug !== 'string' || !isSafeSlug(slug)) return res.status(400).json({ error: 'Invalid slug' })
        const item = itemPayload(c, slug)
        if (!item) return res.status(404).json({ error: 'Not found' })
        return sendVersionedJson(res, 200, item.body, item.etag)
      }
      const pendingAt = pendingRevisionIndex(c)
      const schedules = collectionSchedules(c)
      return res.status(200).json({
        items: listAll(c).map((i) => ({
          ...i,
          frontmatter: withoutSchedule(i.frontmatter),
          pendingAt: pendingAt.get(i.slug) ?? null,
          schedule: schedules.get(i.slug) ?? null,
        })),
      })
    }

    if (req.method === 'PUT') {
      const rl = rateLimit(req, 30, 10 * 60 * 1000)
      res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
      if (!rl.allowed) return res.status(429).json({ error: 'Too many writes, try later' })
      const { slug, frontmatter, body, create, target } = (req.body || {}) as {
        slug?: unknown
        frontmatter?: unknown
        body?: unknown
        create?: unknown
        target?: unknown
      }
      if (typeof slug !== 'string' || !slug) return res.status(400).json({ error: 'Missing slug' })
      if (!isSafeSlug(slug)) return res.status(400).json({ error: 'Invalid slug (use a-z, 0-9, -, _)' })
      if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter))
        return res.status(400).json({ error: 'Missing frontmatter' })
      if (target !== undefined && target !== 'live' && target !== 'pending') return res.status(400).json({ error: 'target must be "live" or "pending"' })
      const fm = frontmatter as Record<string, any>
      if (!fm.title) return res.status(400).json({ error: 'frontmatter.title required' })
      if (opts.requireDate && !fm.date) return res.status(400).json({ error: 'frontmatter.date required' })
      if (body !== undefined && typeof body !== 'string') return res.status(400).json({ error: 'body must be a string' })
      const text = body || ''

      const problem = await mdxProblem(text)
      if (problem) return res.status(422).json(problem)
      // Posters of the body's video players, imported once into /uploads
      // (bounded wait; the page compiles with whatever is stored by then).
      await ensurePosters(text)

      // Checks and write run without an await in between, so no other
      // request can slip in after the version check (single Node process).
      const existing = readOne(c, slug)
      if (create === true && existing) {
        return res.status(409).json({ code: 'SLUG_EXISTS', error: `A ${opts.noun} with this slug already exists` })
      }
      const pendingNow = existing ? getPendingRevision(c, slug) : null
      if (!checkItemIfMatch(req, res, existing?.updatedAt ?? 0, pendingNow?.updatedAt)) return

      // The schedule (H5) is server-owned: kept from the stored rows, never taken from the editor (lib/schedule/fields).
      const scheduled = (to: 'live' | 'pending') =>
        carryScheduleOnSave({ target: to, live: existing?.frontmatter ?? null, pending: pendingNow?.frontmatter ?? null, incoming: fm, now: Date.now() })

      if (target === 'pending') {
        if (!existing || isDraftFrontmatter(existing.frontmatter)) {
          return res.status(409).json({ code: 'NOT_PUBLISHED', error: `This ${opts.noun} is not published — save it directly` })
        }
        if (isDraftFrontmatter(fm)) return res.status(400).json({ error: 'Unpublishing is a direct save (target "live")' })
        const rev = putPendingRevision(c, slug, scheduled('pending'), text, existing.updatedAt)
        const etag = itemEtag(existing.updatedAt, rev.updatedAt)
        return sendVersionedJson(res, 200, { ok: true, pending: { updatedAt: rev.updatedAt, baseUpdatedAt: rev.baseUpdatedAt }, etag }, etag)
      }

      const before = itemSchedule(existing?.frontmatter, pendingNow?.frontmatter)
      const result = await writeOne(c, slug, scheduled('live'), text)
      if (!result.ok) return res.status(400).json({ error: result.error })
      // The editor sent its whole state: a pending revision is superseded.
      const hadPending = deletePendingRevision(c, slug)
      // A new item at an old address of a renamed one: the live item wins.
      if (!existing) forgetRedirectFrom(c, slug)
      if (existing && !isDraftFrontmatter(existing.frontmatter) && !isDraftFrontmatter(fm) && hadPending) {
        const markedUpdated = typeof fm.updated === 'string' && !!fm.updated && fm.updated !== existing.frontmatter.updated
        emitEditorialEvent({ action: 'publish-changes', collection: c, slug, markedUpdated }, { req })
      }
      // A save that ends a schedule (publishing or unpublishing by hand) wakes the scheduler.
      if (before.publishAt !== null || before.unpublishAt !== null) rearmPublishScheduler()
      const etag = itemEtag(readOne(c, slug)?.updatedAt ?? 0)
      return sendVersionedJson(res, 200, { ...result, etag, ...(await refreshCollection(res, c, slug, [existing?.frontmatter?.translationKey])) }, etag)
    }

    if (req.method === 'POST') {
      const { action, slug } = (req.body || {}) as { action?: unknown; slug?: unknown }
      if (typeof slug !== 'string' || !isSafeSlug(slug)) return res.status(400).json({ error: 'Invalid slug' })

      if (action === 'schedule') {
        const rl = rateLimit(req, 30, 10 * 60 * 1000)
        res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
        if (!rl.allowed) return res.status(429).json({ error: 'Too many writes, try later' })
        const one = readOne(c, slug)
        if (!one) return res.status(404).json({ error: 'Not found' })
        if (!checkItemIfMatch(req, res, one.updatedAt, getPendingRevision(c, slug)?.updatedAt)) return
        const request = parseScheduleBody(req.body as Record<string, unknown>)
        if ('code' in request) return res.status(request.status).json({ code: request.code, error: request.error })
        const out = await applySchedule(c, slug, request)
        if (!out.ok) return res.status(out.status).json({ code: out.code, error: out.error })
        rearmPublishScheduler()
        const item = itemPayload(c, slug)
        if (!item) return res.status(404).json({ error: 'Not found' })
        return sendVersionedJson(res, 200, { ok: true, ...item.body, etag: item.etag, ...(out.r2Warning ? { r2Warning: out.r2Warning } : {}) }, item.etag)
      }

      if (action === 'discard-pending') {
        const one = readOne(c, slug)
        if (!one) return res.status(404).json({ error: 'Not found' })
        const pending = getPendingRevision(c, slug)
        if (!checkItemIfMatch(req, res, one.updatedAt, pending?.updatedAt)) return
        const discarded = deletePendingRevision(c, slug)
        // Changes scheduled to go live (H5) go with them.
        if (discarded && pending?.frontmatter?.publishAt !== undefined) rearmPublishScheduler()
        if (discarded) emitEditorialEvent({ action: 'discard-changes', collection: c, slug }, { req })
        const etag = itemEtag(one.updatedAt)
        return sendVersionedJson(res, 200, { ok: true, discarded, etag }, etag)
      }

      if (action === 'rename') {
        const { to, redirect, dryRun } = req.body as { to?: unknown; redirect?: unknown; dryRun?: unknown }
        if (typeof to !== 'string') return res.status(400).json({ error: 'Missing new slug' })
        const request = { collection: c, from: slug, to: to.trim().toLowerCase(), redirect: redirect !== false }
        if (dryRun === true) {
          const plan = await planRename(request)
          if (!plan.ok) return res.status(plan.status).json({ code: plan.code, error: plan.error })
          return res.status(200).json(plan)
        }
        const rl = rateLimit(req, 30, 10 * 60 * 1000)
        res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
        if (!rl.allowed) return res.status(429).json({ error: 'Too many writes, try later' })
        const one = readOne(c, slug)
        if (!one) return res.status(404).json({ error: 'Not found' })
        if (!checkItemIfMatch(req, res, one.updatedAt, getPendingRevision(c, slug)?.updatedAt)) return
        const out = await renameSlug(request)
        if (!out.ok) return res.status(out.status).json({ code: out.code, error: out.error })
        emitEditorialEvent(
          { action: 'rename', collection: c, from: slug, to: request.to, redirect: request.redirect, linksRewritten: out.links },
          { req },
        )
        const failed = await revalidatePaths(res, out.paths)
        const etag = itemEtag(out.updatedAt, getPendingRevision(c, request.to)?.updatedAt)
        return sendVersionedJson(
          res,
          200,
          {
            ok: true,
            slug: request.to,
            etag,
            rewrites: out.rewrites,
            links: out.links,
            redirectsFrom: redirectsTo(c, request.to),
            ...(out.warnings.length ? { r2Warning: out.warnings.join('; ') } : {}),
            revalidated: out.paths.filter((p) => !failed.includes(p)),
            ...(failed.length ? { revalidateFailed: failed } : {}),
          },
          etag,
        )
      }

      if (action === 'remove-redirect') {
        const from = (req.body as { from?: unknown }).from
        if (typeof from !== 'string' || !isSafeSlug(from)) return res.status(400).json({ error: 'Invalid old slug' })
        if (!removeRedirect(c, from, slug)) return res.status(404).json({ error: 'No such redirect' })
        emitEditorialEvent({ action: 'redirect-removed', collection: c, from, to: slug }, { req })
        // The old address answers 404 from now on.
        const failed = await revalidatePaths(res, [`/${c}/${from}`])
        return res.status(200).json({
          ok: true,
          redirectsFrom: redirectsTo(c, slug),
          ...(failed.length ? { revalidateFailed: failed } : {}),
        })
      }

      return res.status(400).json({ error: 'Unknown action' })
    }

    if (req.method === 'DELETE') {
      // Deleting needs a recent sign-in or step-up (403 STEP_UP_REQUIRED).
      if (!requireRecentAuth(req, res)) return
      const slug = req.query.slug
      if (typeof slug !== 'string' || !slug) return res.status(400).json({ error: 'Missing slug' })
      const previousKey = isSafeSlug(slug) ? getItem(c, slug)?.frontmatter?.translationKey : undefined
      const result = await deleteOne(c, slug)
      if (!result.ok) return res.status(result.error === 'Invalid slug' ? 400 : 404).json({ error: result.error })
      deletePendingRevision(c, slug)
      rearmPublishScheduler()
      return res.status(200).json({ ...result, ...(await refreshCollection(res, c, slug, [previousKey])) })
    }

    res.setHeader('Allow', 'GET,PUT,POST,DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  }
}
