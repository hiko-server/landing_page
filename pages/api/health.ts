import type { NextApiRequest, NextApiResponse } from 'next'
import { getDb } from '../../lib/db'
import { isR2Configured } from '../../lib/r2'

/**
 * Liveness/readiness probe for the Docker HEALTHCHECK and any external monitor.
 *
 * The critical dependency is the local SQLite store — the app serves ALL
 * content from it (R2 is an off-site replica synced on boot), so "DB reachable"
 * is what determines healthy. R2 status is reported for visibility, but a
 * missing/unreachable R2 does NOT fail the check: the site still serves from
 * local SQLite, and failing health on an R2 blip would needlessly cycle the
 * container.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  let db = false
  try {
    getDb().prepare('SELECT 1').get()
    db = true
  } catch {
    db = false
  }

  const r2 = isR2Configured()
  return res.status(db ? 200 : 503).json({
    status: db ? 'ok' : 'degraded',
    db,
    r2,
    uptime: Math.round(process.uptime()),
  })
}
