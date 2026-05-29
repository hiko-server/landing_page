import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'
import { isR2Configured, r2GetBuffer } from '../../../lib/r2'
import { uploadR2Key } from '../../../lib/contentStore'

/**
 * Runtime file server for /uploads/* .
 *
 * Why this exists: with `output: 'standalone'`, the Next.js production server
 * only serves files that were present in `public/` at BUILD time. Images
 * uploaded through the admin (written to public/uploads at RUNTIME) are not in
 * that build-time manifest, so the static handler returns 404 — which is why
 * freshly-uploaded images never appeared on /blog, /work, /now, /uses.
 *
 * A `beforeFiles` rewrite (see next.config.js) routes every /uploads/* request
 * here BEFORE the broken static handler runs. We read the bytes at request
 * time: local disk first (the fast path — the upload endpoint writes there and
 * docker-entrypoint's sync-from-r2 rehydrates it on boot), then Cloudflare R2
 * as a fallback so a freshly-provisioned container serves correctly even
 * before the disk copy exists.
 */

const MIME: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
}

// Images can exceed Next's default 4 MB API response cap; lift it.
export const config = { api: { responseLimit: false } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).end('Method not allowed')
  }

  const raw = req.query.path
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : []
  const name = segments.join('/')

  // Uploads are a flat namespace of sanitised filenames. Reject anything that
  // isn't a single safe segment so this can never become a path-traversal hole.
  if (!name || name.includes('/') || name.includes('..') || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    return res.status(400).end('Bad request')
  }

  const ext = path.extname(name).toLowerCase()
  const contentType = MIME[ext] || 'application/octet-stream'

  const sendBuffer = (buf: Buffer) => {
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Length', String(buf.length))
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    if (req.method === 'HEAD') return res.status(200).end()
    return res.status(200).send(buf)
  }

  // 1) Local disk (public/uploads) — the common case.
  const filePath = path.join(process.cwd(), 'public', 'uploads', name)
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return sendBuffer(fs.readFileSync(filePath))
    }
  } catch {
    // fall through to R2
  }

  // 2) Cloudflare R2 fallback.
  if (isR2Configured()) {
    try {
      const buf = await r2GetBuffer(uploadR2Key(name))
      if (buf) return sendBuffer(buf)
    } catch {
      // fall through to 404
    }
  }

  return res.status(404).end('Not found')
}
