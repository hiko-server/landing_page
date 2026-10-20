import { withApi } from '../../../../lib/apiHandler'
import { isAdminRequest } from '../../../../lib/auth'
import { rateLimit } from '../../../../lib/rateLimit'
import { getExploreReport } from '../../../../lib/analytics/explore'
import { getGoalsExplore } from '../../../../lib/analytics/goalsQuery'
import { parseExploreQuery } from '../../../../lib/analytics/exploreShared'
import { EXPORT_TABLES, buildExportTables, exportBaseName, isExportTable } from '../../../../lib/analytics/exportCsv'
import { buildZip } from '../../../../lib/zip'

/**
 * GET /api/admin/analytics/export — the Analytics view on screen as CSV
 * (lib/analytics/exportCsv): the same parameters as /api/admin/analytics
 * (period, from, to, compare, f) plus the conversion's `source` and the
 * paths' `goal`, and
 *
 *   ?table=<name>   one table as text/csv (summary, visitors, pages, …)
 *   ?table=all      every table in one .zip (the default)
 *
 * Full lists (up to 1 000 rows a table), not just the top ten on screen.
 * Aggregates only; search texts are never exported. Admin only, never
 * cached, rate-limited.
 */
export default withApi('admin/analytics/export', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const table = first(req.query.table) ?? 'all'
  if (table !== 'all' && !isExportTable(table)) return res.status(400).json({ error: 'Unknown table' })
  const rl = rateLimit(req, 60, 10 * 60 * 1000, 'admin-analytics-export')
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))))
    return res.status(429).json({ error: 'Too many exports in a short time — try again in a few minutes' })
  }

  const query = parseExploreQuery(req.query)
  const report = getExploreReport(query, { limit: 1000 })
  const goals = getGoalsExplore(query, { source: first(req.query.source) ?? null, goal: first(req.query.goal) ?? null, limit: 1000 })
  const tables = buildExportTables(report, goals)
  const base = exportBaseName(report)
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (table !== 'all') {
    const body = Buffer.from(tables[table], 'utf8')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${base}_${table}.csv"`)
    res.setHeader('Content-Length', String(body.length))
    return res.status(200).send(body)
  }
  const mtime = new Date(report.generatedAt)
  const zip = buildZip(EXPORT_TABLES.map((name) => ({ name: `${base}/${name}.csv`, data: tables[name], mtime })))
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${base}.zip"`)
  res.setHeader('Content-Length', String(zip.length))
  return res.status(200).send(zip)
})
