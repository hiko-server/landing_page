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
  type HomeData,
} from '../../lib/home'
import { attachmentDisposition, ifMatchAllows, kvEtag, restoreErrorStatus, safeSnapshotName, stableStringify } from '../../lib/contentStore'
import { sendMail } from '../../lib/mailer'
import { rateLimit } from '../../lib/rateLimit'
import { isAdminRequest } from '../../lib/auth'
import { sendVersionedJson } from '../../lib/http'

const isAuthed = isAdminRequest

/**
 * /api/home
 *
 *   GET                    public view (publicHome) for everyone — admin
 *                          editors load GET /api/admin/home
 *   GET ?snapshots=1       admin: snapshot file list
 *   GET ?download=1[&file] admin: download the full document or a snapshot
 *   PUT                    admin: save the full document; honours If-Match
 *   POST {action}          admin: snapshot / restore
 */

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    const body: unknown = req.body
    if (!isHomePayload(body)) return res.status(400).json({ error: 'Invalid payload' })

    const ifMatch = req.headers['if-match']
    const current = readHomeWithVersion()
    if (!ifMatchAllows(ifMatch, current.version)) return sendConflict(res, current.version)

    // Nothing changed: no snapshot, no write, version (ETag) unchanged.
    if (current.home && stableStringify(body) === stableStringify(current.home)) {
      const etag = kvEtag(current.version)
      return sendVersionedJson(res, 200, { ok: true, unchanged: true, etag }, etag)
    }

    try {
      saveHomeSnapshot()
    } catch (err) {
      console.warn('home: snapshot before write failed', err)
    }
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
    }).catch((err) => console.warn('home: notification mail failed', err?.message || err))
    return sendVersionedJson(res, 200, {
      ok: true,
      etag,
      ...(writeResult.r2Warning ? { r2Warning: writeResult.r2Warning } : {}),
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
      try {
        saveHomeSnapshot()
      } catch (err) {
        console.warn('home: snapshot before restore failed', err)
      }
      const result = await restoreHomeSnapshot(filename)
      if (!result.ok) return res.status(restoreErrorStatus(result.error)).json({ error: result.error })
      const etag = kvEtag(result.updatedAt)
      return sendVersionedJson(res, 200, { ok: true, etag, ...(result.r2Warning ? { r2Warning: result.r2Warning } : {}) }, etag)
    }
    return res.status(400).json({ error: 'Unknown action' })
  }

  res.setHeader('Allow', 'GET,PUT,POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
