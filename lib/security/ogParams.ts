import { isValidUploadName } from './uploadName'
import { parseOgFocus } from '../og/focus'

export { parseOgFocus }

/**
 * Query parsing for the Open Graph image route (/api/og).
 *
 * Every text is clamped by Unicode code points (never splitting a surrogate
 * pair), stripped of control characters and collapsed to single spaces, so a
 * crafted URL can't make Satori lay out megabytes of text. `kind` is a short
 * slug. The structured params are validated strictly:
 *
 *   date   YYYY-MM-DD (a real calendar date)
 *   mins   integer 1–99
 *   tags   ≤ 3 comma-separated tags of ≤ 24 chars each
 *   cover  only a same-site `/uploads/<valid upload name>` in a format the
 *          renderer decodes (PNG / JPEG) — never an arbitrary URL, so the
 *          renderer cannot be pointed at other hosts
 *   lang   'en' | 'zh'
 *   focus  the cover's focal point "x% y%" (whole percents 0–100; the
 *          centre is the default and never sent)
 *   size   'square' (1200×1200), else the default 1200×630
 *   v      digits only (cache-buster; ignored by the renderer)
 */

export const OG_LIMITS = { title: 100, subtitle: 160, kind: 16, tags: 3, tag: 24, v: 16 } as const

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

export type OgParams = {
  title: string
  kind: string
  subtitle: string
  /** YYYY-MM-DD or ''. */
  date: string
  /** 1–99, or null. */
  mins: number | null
  tags: string[]
  /** `/uploads/<name>` or ''. */
  cover: string
  lang: 'en' | 'zh'
  size: 'default' | 'square'
  /** Digits or ''. */
  v: string
  /** Focal point of the cover, "x% y%" (whole percents), or '' for the centre. */
  focus: string
}

function parseDate(raw: string | null): string {
  const s = String(raw || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : ''
}

function parseMins(raw: string | null): number | null {
  const s = String(raw || '').trim()
  if (!/^\d{1,2}$/.test(s)) return null
  const n = Number(s)
  return n >= 1 && n <= 99 ? n : null
}

function parseTags(raw: string | null): string[] {
  return String(raw || '')
    .split(',')
    .map((t) => clampText(t, OG_LIMITS.tag))
    .filter(Boolean)
    .slice(0, OG_LIMITS.tags)
}

/** Cover formats Satori can decode (it has no WebP / AVIF support). */
export const OG_COVER_RE = /^\/uploads\/([^/?#]+\.(?:png|jpe?g))$/i

function parseCover(raw: string | null): string {
  const s = String(raw || '').trim()
  const m = OG_COVER_RE.exec(s)
  return m && isValidUploadName(m[1]) ? s : ''
}

export function parseOgParams(params: URLSearchParams): OgParams {
  const title = clampText(params.get('title'), OG_LIMITS.title) || 'LUCIAN-DEV.COM'
  const kindRaw = String(params.get('kind') || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, OG_LIMITS.kind)
  const subtitle = clampText(params.get('subtitle'), OG_LIMITS.subtitle)
  const v = String(params.get('v') || '').trim()
  return {
    title,
    kind: kindRaw || 'page',
    subtitle,
    date: parseDate(params.get('date')),
    mins: parseMins(params.get('mins')),
    tags: parseTags(params.get('tags')),
    cover: parseCover(params.get('cover')),
    lang: params.get('lang') === 'zh' ? 'zh' : 'en',
    size: params.get('size') === 'square' ? 'square' : 'default',
    v: new RegExp(`^\\d{1,${OG_LIMITS.v}}$`).test(v) ? v : '',
    // Only with a cover to place.
    focus: parseCover(params.get('cover')) ? parseOgFocus(params.get('focus')) : '',
  }
}
