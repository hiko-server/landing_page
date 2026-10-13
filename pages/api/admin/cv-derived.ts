import type { NextApiRequest, NextApiResponse } from 'next'
import { deriveCurrentlyCoding } from '../../../lib/currentlyCoding'
import { readPublicCvSections } from '../../../lib/cvdata'
import { isAdminRequest } from '../../../lib/auth'
import { referenceMonth } from '../../../lib/clock'
import { cvHref, suggestHighlights } from '../../../lib/highlights'

const isAuthed = isAdminRequest

/** The CV sections the "currently coding" chip is derived from. */
const DERIVED_SOURCE_SECTIONS = ['workExperience', 'education'] as const

/** The CV sections highlight suggestions are read from. */
const HIGHLIGHT_SOURCE_SECTIONS = ['competitionAwards', 'patents', 'education'] as const

/**
 * GET /api/admin/cv-derived
 *
 * Read-only helper for the admin Home editor: surfaces values that the site
 * derives from CV data, so the operator sees what will appear if they leave a
 * field blank, and what they could choose to publish:
 *
 *   currentlyCoding       the "currently coding" chip the home page shows
 *                         when the owner's lines are blank
 *   suggestedHighlights   proof-strip tiles built verbatim from the public
 *                         CV's awards, patents and education, each linking
 *                         to its entry on /cv (or /about when the section is
 *                         switched off the CV page). Suggestions only:
 *                         nothing is published until the owner saves them.
 *
 * Derived from the *website* public view for the site's reference month,
 * exactly what the home page and /now derive, so hidden sections, entries
 * and fields never shape the preview (a hidden end date can't make a past
 * job look current), and an ended role is never offered.
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
  let highlightSource: any[] = []
  let onCvPage = new Set<string>()
  try {
    cvEn = readPublicCvSections('website', DERIVED_SOURCE_SECTIONS, ['en']).en
    highlightSource = readPublicCvSections('website', HIGHLIGHT_SOURCE_SECTIONS, ['en']).en
    onCvPage = new Set(readPublicCvSections('cv', HIGHLIGHT_SOURCE_SECTIONS, ['en']).en.map((s) => String(s.sessionName)))
  } catch (err) {
    // Store error — derivation blanks rather than failing the editor.
    console.warn('cv-derived: could not read CV', err instanceof Error ? err.message : err)
  }

  return res.status(200).json({
    currentlyCoding: deriveCurrentlyCoding(cvEn, referenceMonth()),
    suggestedHighlights: suggestHighlights(highlightSource, {
      hrefFor: (section, index) => (onCvPage.has(section) ? cvHref(section, index) : `/about#about-${section}`),
    }),
  })
}
