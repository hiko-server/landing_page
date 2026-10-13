import type { NextApiRequest, NextApiResponse } from 'next'
import {
  readHome,
  readHomeWithVersion,
  readPublicHome,
  writeHome,
  saveHomeSnapshot,
  listHomeSnapshots,
  restoreHomeSnapshot,
  readHomeSnapshot,
  normalizeHomeWrite,
  type HomeData,
} from '../../lib/home'
import { attachmentDisposition, ifMatchAllows, kvEtag, restoreErrorStatus, safeSnapshotName, stableStringify } from '../../lib/contentStore'
import { sendMail } from '../../lib/mailer'
import { rateLimit } from '../../lib/rateLimit'
import { isAdminRequest } from '../../lib/auth'
import { sendVersionedJson } from '../../lib/http'
import { HOME_PAGE_PATHS, revalidatePaths } from '../../lib/revalidate'
import { withApi } from '../../lib/apiHandler'
import type { Logger } from '../../lib/log'

const isAuthed = isAdminRequest

/**
 * /api/home
 *
 *   GET                    public view (publicHome) for everyone — admin
 *                          editors load GET /api/admin/home
 *   GET ?snapshots=1       admin: snapshot file list
 *   GET ?download=1[&file] admin: download the full document or a snapshot
 *   PUT                    admin: save the full document; honours If-Match.
 *                          Availability, open-source picks, the site name
 *                          and logo scales are validated and normalised
 *                          (lib/homeShape normalizeHomeWrite): 422
 *                          {code:'INVALID_HOME', error, errors} on bad input
 *   POST {action}          admin: snapshot / restore
 */

/**
 * Statically generated (ISR) pages that render home data, regenerated after a
 * save or restore (lib/revalidate.ts HOME_PAGE_PATHS: /, /about, /now). Only
 * ISR pages belong here: /contact is server-rendered on every request
 * (getServerSideProps) and always fresh.
 */
export const HOME_STATIC_PATHS: readonly string[] = [...HOME_PAGE_PATHS]

/** Regenerate home-backed static pages; never fails the (already stored) write. */
async function revalidateHomePages(res: NextApiResponse): Promise<{ revalidated: string[]; revalidateFailed?: string[] }> {
  const paths = [...HOME_STATIC_PATHS]
  const failed = await revalidatePaths(res, paths)
  return {
    revalidated: paths.filter((p) => !failed.includes(p)),
    ...(failed.length ? { revalidateFailed: failed } : {}),
  }
}

function sendConflict(res: NextApiResponse, version: number) {
  const etag = kvEtag(version)
  return sendVersionedJson(res, 409, {
    error: 'conflict',
    message: 'The home page was changed elsewhere since you loaded it. Reload to get the latest version, then re-apply your edits.',
    etag,
  }, etag)
}

function isHomePayload(body: unknown): body is HomeData {
  const b = body as Partial<HomeData> | null
  return (
    !!b &&
    typeof b === 'object' &&
    !Array.isArray(b) &&
    !!b.hero &&
    typeof b.hero === 'object' &&
    !!b.socials &&
    typeof b.socials === 'object' &&
    Array.isArray(b.brands)
  )
}

export default withApi('home', async (req: NextApiRequest, res: NextApiResponse, ctx) => {
  if (req.method === 'GET') {
    // List home snapshots
    if (req.query.snapshots === '1') {
      if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({ files: listHomeSnapshots() })
    }
    // Download the current document or a specific snapshot
    if (req.query.download !== undefined) {
      if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
      res.setHeader('Cache-Control', 'no-store')
      const fileParam = req.query.file
      if (fileParam !== undefined && fileParam !== '') {
        const file = safeSnapshotName(fileParam)
        if (!file) return res.status(400).json({ error: 'Invalid file name' })
        const raw = readHomeSnapshot(file)
        if (raw === null) return res.status(404).json({ error: 'Not found' })
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Content-Disposition', attachmentDisposition(file))
        return res.status(200).send(raw)
      }
      const data = readHome()
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', attachmentDisposition('home.json'))
      return res.status(200).send(JSON.stringify(data, null, 2))
    }
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Home-View', 'public')
    return res.status(200).json(readPublicHome())
  }

  if (req.method === 'PUT') {
    if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    res.setHeader('Cache-Control', 'no-store')
    const rl = rateLimit(req, 30, 10 * 60 * 1000)
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) return res.status(429).json({ error: 'Too many updates, try later' })
    const raw: unknown = req.body
    if (!isHomePayload(raw)) return res.status(400).json({ error: 'Invalid payload' })
    const checked = normalizeHomeWrite(raw)
    if (!checked.ok) {
      return res.status(422).json({
        code: 'INVALID_HOME',
        error: checked.errors.map((e) => e.message).join(' '),
        errors: checked.errors,
      })
    }
    const body = checked.home

    const ifMatch = req.headers['if-match']
    const current = readHomeWithVersion()
    if (!ifMatchAllows(ifMatch, current.version)) return sendConflict(res, current.version)

    // Nothing changed: no snapshot, no write, version (ETag) unchanged.
    if (current.home && stableStringify(body) === stableStringify(current.home)) {
      const etag = kvEtag(current.version)
      return sendVersionedJson(res, 200, { ok: true, unchanged: true, etag }, etag)
    }

    snapshotQuietly(ctx.log, 'write')
    // The If-Match check is repeated atomically inside the write transaction.
    const writeResult = await writeHome(body, {
      precondition: (version) => ifMatchAllows(ifMatch, version),
    })
    if (!writeResult.ok) {
      if (writeResult.conflict) return sendConflict(res, writeResult.conflict.updatedAt)
      return res.status(500).json({ error: writeResult.error })
    }
    const etag = kvEtag(writeResult.updatedAt)
    sendMail({
      to: process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'hi@lucian-dev.com',
      subject: 'Home updated',
      text: `Home updated at ${new Date().toISOString()}`,
    }).catch((err) => ctx.log.warn('home notification mail failed', { err }))
    const revalidation = await revalidateHomePages(res)
    return sendVersionedJson(res, 200, {
      ok: true,
      etag,
      ...(writeResult.r2Warning ? { r2Warning: writeResult.r2Warning } : {}),
      ...revalidation,
    }, etag)
  }

  if (req.method === 'POST') {
    if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    res.setHeader('Cache-Control', 'no-store')
    const { action, filename } = req.body || {}
    if (action === 'snapshot') {
      const file = saveHomeSnapshot()
      return res.status(200).json({ ok: true, file })
    }
    if (action === 'restore') {
      if (!safeSnapshotName(filename)) return res.status(400).json({ error: 'Missing or invalid filename' })
      snapshotQuietly(ctx.log, 'restore')
      const result = await restoreHomeSnapshot(filename)
      if (!result.ok) return res.status(restoreErrorStatus(result.error)).json({ error: result.error })
      const etag = kvEtag(result.updatedAt)
      const revalidation = await revalidateHomePages(res)
      return sendVersionedJson(res, 200, {
        ok: true,
        etag,
        ...(result.r2Warning ? { r2Warning: result.r2Warning } : {}),
        ...revalidation,
      }, etag)
    }
    return res.status(400).json({ error: 'Unknown action' })
  }

  res.setHeader('Allow', 'GET,PUT,POST')
  return res.status(405).json({ error: 'Method not allowed' })
})

/** Keep the current state recoverable before a write; a failed snapshot never blocks the write. */
function snapshotQuietly(log: Logger, before: string) {
  try {
    saveHomeSnapshot()
  } catch (err) {
    log.warn('home snapshot failed', { before, err })
  }
}
