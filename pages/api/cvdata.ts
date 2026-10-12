import type { NextApiRequest, NextApiResponse } from 'next'
import {
  readCvData,
  readCvDataWithVersion,
  readPublicCvData,
  writeCvData,
  syncLanguage,
  saveSnapshot,
  listSnapshots,
  restoreSnapshot,
  readSnapshot,
} from '../../lib/cvdata'
import { attachmentDisposition, ifMatchAllows, kvEtag, restoreErrorStatus, safeSnapshotName, stableStringify } from '../../lib/contentStore'
import { sendMail } from '../../lib/mailer'
import { rateLimit } from '../../lib/rateLimit'
import { isAdminRequest, readAdminClaims } from '../../lib/auth'
import { sendVersionedJson } from '../../lib/http'
import { revalidatePaths } from '../../lib/revalidate'

const isAuthed = isAdminRequest

/**
 * /api/cvdata
 *
 *   GET                    public view {en, zh} — ALWAYS pruned, even for an
 *                          admin (editors load GET /api/admin/cvdata)
 *   GET ?snapshots=1       admin: snapshot file list
 *   GET ?download=1[&file] admin: download the full document or a snapshot
 *   PUT                    admin: save {en?, zh?, syncZh?}; honours If-Match
 *   POST {action}          admin: snapshot / restore / import
 */

/**
 * Accept real JSON values, or a JSON string (with a BOM / trailing commas
 * tolerated). String *contents* are never rewritten.
 */
function parseLoose(v: any): any {
  if (typeof v !== 'string') return v
  const src = v.replace(/^﻿/, '')
  try {
    return JSON.parse(src)
  } catch {
    try {
      return JSON.parse(src.replace(/,(\s*[}\]])/g, '$1'))
    } catch {
      return undefined
    }
  }
}

function isSectionArray(v: unknown): v is any[] {
  return Array.isArray(v) && v.every((s) => s && typeof s === 'object' && typeof (s as any).sessionName === 'string')
}

/**
 * Statically generated pages that render CV data. /now reads the public
 * workExperience / education / project sections, so a save, restore or
 * import must regenerate it right away — otherwise an entry the owner just
 * hid keeps being served from the ISR cache.
 */
const CV_STATIC_PATHS = ['/now']

/** Regenerate CV-backed static pages; never fails the (already stored) write. */
async function revalidateCvPages(res: NextApiResponse): Promise<{ revalidated: string[]; revalidateFailed?: string[] }> {
  const failed = await revalidatePaths(res, CV_STATIC_PATHS)
  return {
    revalidated: CV_STATIC_PATHS.filter((p) => !failed.includes(p)),
    ...(failed.length ? { revalidateFailed: failed } : {}),
  }
}

function sendConflict(res: NextApiResponse, version: number) {
  const etag = kvEtag(version)
  return sendVersionedJson(res, 409, {
    error: 'conflict',
    message: 'The CV was changed elsewhere since you loaded it. Reload to get the latest version, then re-apply your edits.',
    etag,
  }, etag)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // snapshots list (admin only)
    if (req.query.snapshots === '1') {
      if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({ files: listSnapshots() })
    }
    // download current or a snapshot (admin only)
    if (req.query.download !== undefined) {
      if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
      res.setHeader('Cache-Control', 'no-store')
      const fileParam = req.query.file
      if (fileParam !== undefined && fileParam !== '') {
        const file = safeSnapshotName(fileParam)
        if (!file) return res.status(400).json({ error: 'Invalid file name' })
        const raw = readSnapshot(file)
        if (raw === null) return res.status(404).json({ error: 'Not found' })
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Content-Disposition', attachmentDisposition(file))
        return res.status(200).send(raw)
      }
      const data = readCvData()
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', attachmentDisposition('cvdata.json'))
      return res.status(200).send(JSON.stringify(data, null, 2))
    }
    // Public view for everyone — hidden sections, entries, fields and bullets
    // never leave the server. Admin editors use GET /api/admin/cvdata.
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-CV-View', 'public')
    const { en, zh } = readPublicCvData('any')
    return res.status(200).json({ en, zh })
  }

  if (req.method === 'PUT') {
    if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    res.setHeader('Cache-Control', 'no-store')
    const rl = rateLimit(req, 30, 10 * 60 * 1000)
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) return res.status(429).json({ error: 'Too many updates, try later' })
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const syncZh = !!body.syncZh
    const en = parseLoose(body.en)
    const zh = parseLoose(body.zh)
    if (en === undefined && zh === undefined) return res.status(400).json({ error: 'Missing payload' })
    if ((en !== undefined && !isSectionArray(en)) || (zh !== undefined && !isSectionArray(zh))) {
      return res.status(400).json({ error: 'Each language must be an array of sections with a string "sessionName"' })
    }

    const ifMatch = req.headers['if-match']
    const current = readCvDataWithVersion()
    if (!ifMatchAllows(ifMatch, current.version)) return sendConflict(res, current.version)

    const newEn = Array.isArray(en) ? en : current.en
    const baseZh = Array.isArray(zh) ? zh : current.zh
    const newZh = syncZh ? syncLanguage(newEn, baseZh) : baseZh
    const next = { en: newEn, zh: newZh }

    // Nothing changed: no snapshot, no write, version (ETag) unchanged.
    if (stableStringify(next) === stableStringify({ en: current.en, zh: current.zh })) {
      const etag = kvEtag(current.version)
      return sendVersionedJson(res, 200, { ok: true, unchanged: true, etag }, etag)
    }

    try {
      saveSnapshot()
    } catch (err) {
      console.warn('cvdata: snapshot before write failed', err)
    }
    // The If-Match check is repeated atomically inside the write transaction.
    const writeResult = await writeCvData(next, {
      precondition: (version) => ifMatchAllows(ifMatch, version),
    })
    if (!writeResult.ok) {
      if (writeResult.conflict) return sendConflict(res, writeResult.conflict.updatedAt)
      return res.status(500).json({ error: writeResult.error })
    }
    const etag = kvEtag(writeResult.updatedAt)
    const actor = readAdminClaims(req, res)?.email || 'admin'
    sendMail({
      to: process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'hi@lucian-dev.com',
      subject: 'CV updated',
      text: `CV updated by ${actor} at ${new Date().toISOString()}\nSyncZh=${syncZh}`,
    }).catch((err) => console.warn('cvdata: notification mail failed', err?.message || err))
    const revalidation = await revalidateCvPages(res)
    return sendVersionedJson(res, 200, {
      ok: true,
      etag,
      ...(writeResult.r2Warning ? { r2Warning: writeResult.r2Warning } : {}),
      ...revalidation,
    }, etag)
  }

  // manual snapshot/import/restore ops
  if (req.method === 'POST') {
    if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
    res.setHeader('Cache-Control', 'no-store')
    const { action, filename, data } = req.body || {}
    if (action === 'snapshot') {
      const file = saveSnapshot()
      return res.status(200).json({ ok: true, file })
    }
    if (action === 'restore') {
      if (!safeSnapshotName(filename)) return res.status(400).json({ error: 'Missing or invalid filename' })
      // Keep the current state recoverable: restoring is itself undoable.
      try {
        saveSnapshot()
      } catch (err) {
        console.warn('cvdata: snapshot before restore failed', err)
      }
      const result = await restoreSnapshot(filename)
      if (!result.ok) return res.status(restoreErrorStatus(result.error)).json({ error: result.error })
      const etag = kvEtag(result.updatedAt)
      const revalidation = await revalidateCvPages(res)
      return sendVersionedJson(res, 200, {
        ok: true,
        etag,
        ...(result.r2Warning ? { r2Warning: result.r2Warning } : {}),
        ...revalidation,
      }, etag)
    }
    if (action === 'import') {
      // overwrite with provided JSON structure
      const payload = parseLoose(data) ?? data
      if (!payload) return res.status(400).json({ error: 'Missing data' })
      // Accept either { en, zh } or a single array meaning EN only
      let enIn: any[] | undefined
      let zhIn: any[] | undefined
      if (Array.isArray(payload)) {
        enIn = payload
        zhIn = []
      } else if (typeof payload === 'object') {
        enIn = Array.isArray((payload as any).en) ? (payload as any).en : undefined
        zhIn = Array.isArray((payload as any).zh) ? (payload as any).zh : undefined
      }
      if (!enIn && !zhIn) return res.status(400).json({ error: 'Invalid structure' })
      if ((enIn && !isSectionArray(enIn)) || (zhIn && !isSectionArray(zhIn))) {
        return res.status(400).json({ error: 'Each language must be an array of sections with a string "sessionName"' })
      }
      const current = readCvData()
      const newEn = enIn ?? current.en
      const newZh = zhIn ? syncLanguage(newEn, zhIn) : current.zh
      try {
        saveSnapshot()
      } catch (err) {
        console.warn('cvdata: snapshot before import failed', err)
      }
      const importResult = await writeCvData({ en: newEn, zh: newZh })
      if (!importResult.ok) return res.status(500).json({ error: importResult.error })
      const etag = kvEtag(importResult.updatedAt)
      const revalidation = await revalidateCvPages(res)
      return sendVersionedJson(res, 200, {
        ok: true,
        etag,
        ...(importResult.r2Warning ? { r2Warning: importResult.r2Warning } : {}),
        ...revalidation,
      }, etag)
    }
    return res.status(400).json({ error: 'Unknown action' })
  }

  res.setHeader('Allow', 'GET,PUT,POST')
  return res.status(405).json({ error: 'Method not allowed' })
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
}
