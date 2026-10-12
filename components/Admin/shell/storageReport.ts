/**
 * Parses the `report` of POST /api/admin/storage/pull (pure — unit tested):
 *   { dbReplaced: boolean, r2Mirrored: number, r2Removed: number,
 *     revalidated: string[], warnings: string[] }
 * Returns null when the response carries no report (older servers).
 */

export type RestoreReport = {
  dbReplaced: boolean
  r2Mirrored: number
  r2Removed: number
  revalidated: string[]
  warnings: string[]
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
const count = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0

export function parseRestoreReport(body: unknown): RestoreReport | null {
  if (!body || typeof body !== 'object') return null
  const r = (body as { report?: unknown }).report
  if (!r || typeof r !== 'object') return null
  const o = r as Record<string, unknown>
  return {
    dbReplaced: o.dbReplaced === true,
    r2Mirrored: count(o.r2Mirrored),
    r2Removed: count(o.r2Removed),
    revalidated: strings(o.revalidated).filter((p) => p.startsWith('/')),
    warnings: strings(o.warnings),
  }
}
