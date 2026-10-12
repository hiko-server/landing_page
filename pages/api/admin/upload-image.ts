import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { rateLimit } from '../../../lib/rateLimit'
import { isR2Configured, r2PutBuffer } from '../../../lib/r2'
import { uploadR2Key } from '../../../lib/contentStore'
import { isAdminRequest } from '../../../lib/auth'

const isAuthed = isAdminRequest

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  const rl = rateLimit(req, 20, 10 * 60 * 1000)
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.allowed) return res.status(429).json({ error: 'Too many uploads, try later' })
  const { filename, dataUrl } = req.body || {}
  if (!filename || !dataUrl) return res.status(400).json({ error: 'Missing fields' })

  // dataUrl: data:image/png;base64,xxxx
  const match = /^data:(.+);base64,(.*)$/.exec(dataUrl)
  if (!match) return res.status(400).json({ error: 'Invalid dataUrl' })
  const contentType = match[1]
  const buf = Buffer.from(match[2], 'base64')

  // Validate against an allowlist: the declared MIME must be a known image
  // type, the decoded bytes must actually start with that type's magic number
  // (so a text/html or SVG payload can't be smuggled in under an image MIME),
  // and the size must be sane. Defence-in-depth for a write sink.
  const ALLOWED: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
    'image/png':  { ext: '.png',  magic: b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
    'image/jpeg': { ext: '.jpg',  magic: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    'image/webp': { ext: '.webp', magic: b => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
    'image/gif':  { ext: '.gif',  magic: b => b.length > 6 && b.toString('ascii', 0, 4) === 'GIF8' },
    // ISO-BMFF: require an AVIF brand, not just any `ftyp` box (mp4 / heic).
    'image/avif': { ext: '.avif', magic: b => b.length > 12 && b.toString('ascii', 4, 8) === 'ftyp' && /^avi[fs]$/.test(b.toString('ascii', 8, 12)) },
  }
  const spec = ALLOWED[contentType]
  if (!spec) return res.status(415).json({ error: 'Unsupported image type' })
  const MAX_BYTES = 8 * 1024 * 1024
  if (buf.length === 0 || buf.length > MAX_BYTES) return res.status(413).json({ error: 'Image must be 1 byte to 8MB' })
  if (!spec.magic(buf)) return res.status(400).json({ error: 'File content does not match its declared image type' })

  // Sanitise the name and force the canonical extension for the validated type
  // so nothing can be persisted/served as e.g. "evil.html".
  let safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  if (path.extname(safeName).toLowerCase() !== spec.ext) {
    safeName = safeName.replace(/\.[^.]*$/, '') + spec.ext
  }
  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  fs.mkdirSync(uploadDir, { recursive: true })
  // Never overwrite: uploads are served `immutable`, so reusing a name would
  // pin stale bytes in every cache. Collisions get a short content hash.
  if (fs.existsSync(path.join(uploadDir, safeName))) {
    const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10)
    const ext = path.extname(safeName)
    safeName = `${path.basename(safeName, ext)}-${hash}${ext}`
  }
  const filePath = path.join(uploadDir, safeName)
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, buf as unknown as any, { flag: 'wx' })

  // Dual-write to R2 if configured. We keep the local file (it's what
  // /uploads/* serves at runtime) and treat R2 as the off-site mirror so a
  // freshly-provisioned container can rehydrate via scripts/sync-from-r2.
  let r2Warning: string | undefined
  if (isR2Configured()) {
    try {
      await r2PutBuffer(uploadR2Key(safeName), buf, contentType)
    } catch (err: any) {
      r2Warning = `R2 upload failed: ${err?.message || String(err)}`
    }
  }

  const urlPath = `/uploads/${safeName}`
  return res.status(200).json({ url: urlPath, ...(r2Warning ? { r2Warning } : {}) })
}

// Images arrive as base64 data URLs (~1.37× the file size); the default 1mb
// body limit rejected anything over ~750KB before the 8MB check could run.
export const config = {
  api: {
    bodyParser: { sizeLimit: '12mb' },
  },
}
