/**
 * Unified version history API (admin only)
 *
 * CV and home page (JSON documents):
 * GET  ?type=cv   → list CV file snapshots
 * GET  ?type=home → list Home file snapshots
 * GET  ?type=cv&file=filename&preview=1 → read snapshot JSON (preview)
 * GET  ?type=home&file=filename&preview=1 → read snapshot JSON (preview)
 * POST ?type=cv|home { action:'restore', filename } → restore a file snapshot
 * POST ?type=cv|home { action:'snapshot' } → take a manual snapshot
 *
 * Posts, case studies and pages (MDX, lib/mdx-admin.ts):
 * GET  ?type=blog|work&slug=foo           → list that item's snapshots
 * GET  ?type=page&name=now|uses|about     → list that page's snapshots
 * GET  ?type=…&slug|name=…&file=…&preview=1 → { data: { frontmatter, body } }
 * GET  ?type=blog|work&deleted=1          → { deleted: [{ slug, title, filename, date }] }
 *                                           (snapshots whose item no longer exists)
 * POST ?type=…  { action:'restore', slug|name, filename } → write the snapshot back
 *      (the live state is snapshotted first), regenerate its public pages and
 *      return the new ETag. Works for deleted items too (undo delete).
 *
 * `type`, `slug` and `name` may also be sent in the POST body; the query string wins.
 *
 * Every listed version carries `replacedBy`: { summary, ts, device } of the
 * admin write that took it (from the activity log, lib/audit), or null.
 */
import {
  listSnapshots as listCvSnapshots,
  restoreSnapshot,
  saveSnapshot,
  readSnapshot,
} from '../../lib/cvdata'
import {
  listHomeSnapshots,
  restoreHomeSnapshot,
  saveHomeSnapshot,
  readHomeSnapshot,
} from '../../lib/home'
import type { NextApiRequest, NextApiResponse } from 'next'
import { kvEtag, restoreErrorStatus, safeSnapshotName } from '../../lib/contentStore'
import { isAdminRequest } from '../../lib/auth'
import { sendVersionedJson } from '../../lib/http'
import { CV_PAGE_PATHS, HOME_PAGE_PATHS, revalidatePaths } from '../../lib/revalidate'
import { warmCvExports } from '../../lib/cvExport/service'
import { trackPublicationsNav } from '../../lib/publicationsNav'
import { withApi } from '../../lib/apiHandler'
import { log } from '../../lib/log'
import { versionNotes, type VersionNote } from '../../lib/audit/store'
import type { SnapshotKind as AuditSnapshotKind } from '../../lib/audit/context'
import {
  PAGE_NAMES,
  isPageName,
  isSafeSlug,
  listDeleted,
  listSnapshots,
  parseSnapshotName,
  readOne,
  readPage,
  readSnapshot as readMdxSnapshot,
  refreshCollection,
  restoreItemSnapshot,
  restorePageSnapshot,
  versionEtag,
  type SnapshotKind,
} from '../../lib/mdx-admin'

const isAuthed = isAdminRequest

type JsonDocType = 'cv' | 'home'
type VersionType = JsonDocType | SnapshotKind

const TYPES: readonly VersionType[] = ['cv', 'home', 'blog', 'work', 'page']

/**
 * Statically generated (ISR) pages rendered from each document
 * (lib/revalidate.ts CV_PAGE_PATHS / HOME_PAGE_PATHS: /, /about, /now, the
 * CV pages, /work and /publications for the CV and /contact for the home
 * document), so
 * restoring either one regenerates them instead of leaving the ISR copy
 * live.
 */
const STATIC_PATHS: Record<JsonDocType, string[]> = { cv: [...CV_PAGE_PATHS], home: [...HOME_PAGE_PATHS] }

const PAGE_NAME_ERROR = `name must be one of ${PAGE_NAMES.map((n) => `"${n}"`).join(', ')}`

function parseType(value: unknown): VersionType | null {
  if (value === undefined || value === '') return null
  return (TYPES as readonly unknown[]).includes(value) ? (value as VersionType) : null
}

function parseFilename(name: string): { date: string; label: string } {
  // cv_2025-09-09_03-17-28-947.json  or  home_2025-09-09_03-17-28-947.json
  const m = name.match(/^(?:cv|home)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/)
  if (m) {
    // Snapshot stamps are UTC (toISOString) — keep the Z so clients convert
    // to their own timezone instead of misreading it as local time.
    const dateStr = `${m[1]}T${m[2].replace(/-/g, ':')}Z`
    return { date: dateStr, label: new Date(dateStr).toUTCString() }
  }
  return { date: '', label: name }
}

/**
 * For each snapshot, the change that replaced it (the activity log links
 * the write to the version it took first — lib/audit); absent for older
 * snapshots. Never fails the listing.
 */
function notesFor(kind: AuditSnapshotKind, files: string[]): Map<string, VersionNote> {
  try {
    return versionNotes(kind, files)
  } catch (err) {
    log.warn('versions: activity notes unavailable', { kind, err })
    return new Map()
  }
}

function mdxVersions(kind: SnapshotKind, slug: string) {
  const list = listSnapshots(kind, slug)
  const notes = notesFor(kind, list.map((s) => s.filename))
  return list.map((s, idx) => ({
    filename: s.filename,
    date: s.date,
    label: new Date(s.date).toUTCString(),
    index: idx,
    isLatest: idx === 0,
    type: kind,
    replacedBy: notes.get(s.filename) ?? null,
  }))
}

/** Snapshot history of posts, case studies and pages. */
async function handleMdx(req: NextApiRequest, res: NextApiResponse, kind: SnapshotKind) {
  const fromBody = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {}
  const rawRef = kind === 'page' ? req.query.name ?? req.query.slug ?? fromBody.name ?? fromBody.slug : req.query.slug ?? fromBody.slug

  if (req.method === 'GET' && kind !== 'page' && req.query.deleted === '1') {
    return res.status(200).json({ ok: true, deleted: listDeleted(kind) })
  }

  const ref = typeof rawRef === 'string' ? rawRef : ''
  if (kind === 'page' ? !isPageName(ref) : !isSafeSlug(ref)) {
    return res.status(400).json({ error: kind === 'page' ? PAGE_NAME_ERROR : 'Missing or invalid slug' })
  }

  if (req.method === 'GET') {
    if (req.query.file !== undefined && req.query.preview === '1') {
      const info = parseSnapshotName(req.query.file)
      if (!info || info.slug !== ref) return res.status(400).json({ error: 'Invalid file name' })
      const doc = readMdxSnapshot(kind, info.filename)
      if (!doc) return res.status(404).json({ error: 'Not found' })
      return res.status(200).json({ ok: true, data: doc })
    }
    return res.status(200).json({ ok: true, versions: mdxVersions(kind, ref) })
  }

  if (req.method === 'POST') {
    const { action, filename } = fromBody as { action?: unknown; filename?: unknown }
    if (action !== 'restore') return res.status(400).json({ error: 'Unknown action' })
    const info = parseSnapshotName(filename)
    if (!info || info.slug !== ref) return res.status(400).json({ error: 'Missing or invalid filename' })

    if (kind === 'page') {
      if (!isPageName(ref)) return res.status(400).json({ error: PAGE_NAME_ERROR })
      const result = await restorePageSnapshot(ref, info.filename)
      if (!result.ok) return res.status('notFound' in result ? 404 : 500).json({ error: result.error })
      const etag = versionEtag(readPage(ref).updatedAt)
      const paths = [`/${ref}`]
      const failed = await revalidatePaths(res, paths)
      return sendVersionedJson(res, 200, {
        ...result,
        etag,
        revalidated: paths.filter((p) => !failed.includes(p)),
        ...(failed.length ? { revalidateFailed: failed } : {}),
      }, etag)
    }

    const result = await restoreItemSnapshot(kind, ref, info.filename)
    if (!result.ok) return res.status('notFound' in result ? 404 : 500).json({ error: result.error })
    const etag = versionEtag(readOne(kind, ref)?.updatedAt ?? 0)
    return sendVersionedJson(res, 200, { ...result, etag, ...(await refreshCollection(res, kind, ref)) }, etag)
  }

  res.setHeader('Allow', 'GET,POST')
  return res.status(405).json({ error: 'Method not allowed' })
}

export default withApi('versions', async (req, res) => {
  if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')

  const rawType = req.query.type ?? (req.method === 'POST' ? req.body?.type : undefined)
  const parsedType = parseType(rawType)
  if (rawType !== undefined && rawType !== '' && !parsedType) {
    return res.status(400).json({ error: 'type must be one of cv, home, blog, work, page' })
  }
  const anyType: VersionType = parsedType ?? 'cv'
  if (anyType === 'blog' || anyType === 'work' || anyType === 'page') return handleMdx(req, res, anyType)
  const type: JsonDocType = anyType

  if (req.method === 'GET') {
    const fileParam = req.query.file
    const preview = req.query.preview === '1'

    // Preview a specific snapshot
    if (fileParam !== undefined && preview) {
      const file = safeSnapshotName(fileParam)
      if (!file) return res.status(400).json({ error: 'Invalid file name' })
      const raw = type === 'home' ? readHomeSnapshot(file) : readSnapshot(file)
      if (raw === null) return res.status(404).json({ error: 'Not found' })
      try {
        return res.status(200).json({ ok: true, data: JSON.parse(raw) })
      } catch {
        return res.status(200).json({ ok: true, data: raw })
      }
    }

    // List all snapshots with metadata
    const files = type === 'home' ? listHomeSnapshots() : listCvSnapshots()
    const notes = notesFor(type, files)
    const versions = files.map((f, idx) => {
      const { date, label } = parseFilename(f)
      return {
        filename: f,
        date,
        label,
        index: idx,
        isLatest: idx === 0,
        type,
        replacedBy: notes.get(f) ?? null,
      }
    })
    return res.status(200).json({ ok: true, versions })
  }

  if (req.method === 'POST') {
    const { action, filename } = req.body || {}

    if (action === 'snapshot') {
      const file = type === 'home' ? saveHomeSnapshot() : saveSnapshot()
      return res.status(200).json({ ok: true, file })
    }

    if (action === 'restore') {
      if (!safeSnapshotName(filename)) return res.status(400).json({ error: 'Missing or invalid filename' })
      // Snapshot the live state first so a restore can itself be undone.
      try {
        if (type === 'home') saveHomeSnapshot()
        else saveSnapshot()
      } catch (err) {
        log.warn('versions: snapshot before restore failed', { type, err })
      }
      const nav = type === 'cv' ? trackPublicationsNav() : null
      const result = type === 'home' ? await restoreHomeSnapshot(filename) : await restoreSnapshot(filename)
      if (!result.ok) return res.status(restoreErrorStatus(result.error)).json({ error: result.error })
      const etag = kvEtag(result.updatedAt)
      // A restore that makes /publications appear or disappear also refreshes the nav link of the other ISR pages.
      const paths = Array.from(new Set([...STATIC_PATHS[type], ...(nav ? nav.pathsIfChanged() : [])]))
      if (type === 'cv') warmCvExports()
      const failed = await revalidatePaths(res, paths, { confirm: paths })
      return sendVersionedJson(res, 200, {
        ok: true,
        etag,
        ...(result.r2Warning ? { r2Warning: result.r2Warning } : {}),
        revalidated: paths.filter((p) => !failed.includes(p)),
        ...(failed.length ? { revalidateFailed: failed } : {}),
      }, etag)
    }

    return res.status(400).json({ error: 'Unknown action' })
  }

  res.setHeader('Allow', 'GET,POST')
  return res.status(405).json({ error: 'Method not allowed' })
})
