import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'
import { getCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../../lib/env'
import { deriveCurrentlyCoding } from '../../../lib/currentlyCoding'

/**
 * GET /api/admin/cv-derived
 *
 * Read-only helper for the admin Home editor: surfaces values that the
 * site auto-derives from CV data so the operator sees what will appear
 * if they leave a field blank. Today it returns only the "currently
 * coding" chip, but the response is shaped as an envelope so we can add
 * more derived blocks without breaking the client.
 *
 * Auth-gated so the operator's CV layout / dates don't leak through an
 * unauthenticated endpoint to scrapers.
 */
function isAuthed(req: NextApiRequest, res: NextApiResponse): boolean {
  const token = getCookie('cv_admin_token', { req, res }) as string | undefined
  if (!token) return false
  try {
    return (jwt.verify(token, getJwtSecret()) as { role?: string })?.role === 'admin'
  } catch {
    return false
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Source of truth is the same data/cvdata.json the home + about pages read.
  let cvEn: any[] = []
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'data', 'cvdata.json'), 'utf-8')
    const json = JSON.parse(raw)
    if (Array.isArray(json?.en)) cvEn = json.en
  } catch {
    // No CV yet — fall through with empty array; derivation will return blanks.
  }

  return res.status(200).json({
    currentlyCoding: deriveCurrentlyCoding(cvEn),
  })
}
