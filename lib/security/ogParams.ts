/**
 * Query parsing for the Open Graph image route (/api/og).
 *
 * Every text is clamped by Unicode code points (never splitting a surrogate
 * pair), stripped of control characters and collapsed to single spaces, so a
 * crafted URL can't make Satori lay out megabytes of text. `kind` is a short
 * slug.
 */

export const OG_LIMITS = { title: 100, subtitle: 160, kind: 16 } as const

export function clampText(raw: unknown, max: number): string {
  const s = String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = Array.from(s)
  if (chars.length <= max) return s
  return chars.slice(0, Math.max(0, max - 1)).join('').trimEnd() + '…'
}

export type OgParams = { title: string; kind: string; subtitle: string }

export function parseOgParams(params: URLSearchParams): OgParams {
  const title = clampText(params.get('title'), OG_LIMITS.title) || 'LUCIAN-DEV.COM'
  const kindRaw = String(params.get('kind') || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, OG_LIMITS.kind)
  const subtitle = clampText(params.get('subtitle'), OG_LIMITS.subtitle)
  return { title, kind: kindRaw || 'page', subtitle }
}
