import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../../lib/env'
import fs from 'fs'
import path from 'path'
import { rateLimit } from '../../../lib/rateLimit'
import { isR2Configured, r2PutBuffer } from '../../../lib/r2'
import { uploadR2Key } from '../../../lib/contentStore'

function isAuthed(req: NextApiRequest, res: NextApiResponse) {
  const token = getCookie('cv_admin_token', { req, res }) as string | undefined
  if (!token) return false
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any
    return decoded?.role === 'admin'
  } catch {
    return false
  }
}

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
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const buf = Buffer.from(match[2], 'base64')
  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  fs.mkdirSync(uploadDir, { recursive: true })
  const filePath = path.join(uploadDir, safeName)
  fs.writeFileSync(filePath, buf as unknown as any)

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
