import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../../lib/env'
import { deriveCurrentlyCoding } from '../../../lib/currentlyCoding'
import { readCvData } from '../../../lib/cvdata'

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

  // Source of truth is the live content store (SQLite kv + R2) — the same source
  // the home + about + /cv pages now read — so this derived preview matches what
  // visitors actually see after an edit.
  let cvEn: any[] = []
  try {
    cvEn = readCvData().en
  } catch {
    // No CV yet / store error — fall through with empty array; derivation blanks.
  }

  return res.status(200).json({
    currentlyCoding: deriveCurrentlyCoding(cvEn),
  })
}
