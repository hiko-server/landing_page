import type { NextApiRequest, NextApiResponse } from 'next'
import { deriveCurrentlyCoding } from '../../../lib/currentlyCoding'
import { readPublicCvSections } from '../../../lib/cvdata'
import { isAdminRequest } from '../../../lib/auth'

const isAuthed = isAdminRequest

/** The CV sections the "currently coding" chip is derived from. */
const DERIVED_SOURCE_SECTIONS = ['workExperience', 'project', 'education'] as const

/**
 * GET /api/admin/cv-derived
 *
 * Read-only helper for the admin Home editor: surfaces values that the
 * site auto-derives from CV data so the operator sees what will appear
 * if they leave a field blank. Today it returns only the "currently
 * coding" chip, but the response is shaped as an envelope so we can add
 * more derived blocks without breaking the client.
 *
 * Derived from the *website* public view — exactly what visitors' pages
 * derive from — so hidden sections, entries and fields never shape the
 * preview (a hidden end date can't make a past job look current).
 *
 * Auth-gated so the operator's CV layout / dates don't leak through an
 * unauthenticated endpoint to scrapers.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')

  let cvEn: any[] = []
  try {
    cvEn = readPublicCvSections('website', DERIVED_SOURCE_SECTIONS, ['en']).en
  } catch (err) {
    // Store error — derivation blanks rather than failing the editor.
    console.warn('cv-derived: could not read CV', err instanceof Error ? err.message : err)
  }

  return res.status(200).json({
    currentlyCoding: deriveCurrentlyCoding(cvEn),
  })
}
