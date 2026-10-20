/**
 * Private share links of CV variants (E4) — the pure, browser-safe part:
 * the shape the admin sees, link states, expiry choices and the public
 * paths. Storage: lib/cvShare/store (auth.db); tokens: lib/cvShare/token.
 *
 *   /cv/r/<token>          the variant's web CV, in the link's language
 *   /cv/r/<token>/zh       … in Chinese (/cv/r/<token>/en for English)
 *   /cv/r/<token>.pdf      its server-rendered PDF (…/zh.pdf, …/en.pdf)
 *
 * Every response under /cv/r/ is private, never stored by a cache, never
 * indexed and sends no Referer (proxy.ts, lib/security/responseHeaders).
 */

import type { CvLang } from '../cvVisibility'

export const SHARE_PATH_PREFIX = '/cv/r/'

export type ShareLinkState = 'active' | 'expired' | 'revoked'

/** A link as the admin lists it — never the token or its hash. */
export type ShareLink = {
  id: string
  variantId: string
  lang: CvLang
  note: string
  createdAt: number
  expiresAt: number
  revokedAt: number | null
  openCount: number
  /** 'YYYY-MM-DD' (UTC) of the last counted open, or null. */
  lastOpenedDay: string | null
  state: ShareLinkState
}

export const NOTE_MAX = 120
export const EXPIRY_DAYS = [7, 14, 30, 90, 180, 365] as const
export const DEFAULT_EXPIRY_DAYS = 30
export const MAX_EXPIRY_DAYS = 365
export const DAY_MS = 86_400_000
/** Links one variant may hold at once (active ones). */
export const MAX_ACTIVE_LINKS = 50
export const SHARE_LINK_ID_RE = /^l[a-z0-9]{10,24}$/

export function shareLinkState(link: Pick<ShareLink, 'revokedAt' | 'expiresAt'>, now = Date.now()): ShareLinkState {
  if (link.revokedAt !== null && link.revokedAt !== undefined) return 'revoked'
  return link.expiresAt <= now ? 'expired' : 'active'
}

/** Path of the web CV of a link (`lang` omitted: the link's own language). */
export function sharePagePath(token: string, lang?: CvLang): string {
  return `${SHARE_PATH_PREFIX}${token}${lang ? `/${lang}` : ''}`
}

/** Path of the PDF of a link in a language. */
export function sharePdfPath(token: string, lang: CvLang): string {
  return `${SHARE_PATH_PREFIX}${token}/${lang}.pdf`
}

/** True for any path under /cv/r/ (headers, analytics, error scrubbing). */
export function isSharePath(pathname: string): boolean {
  return pathname === '/cv/r' || pathname.startsWith(SHARE_PATH_PREFIX)
}

/** A single-line, trimmed note of at most NOTE_MAX characters. */
export function cleanNote(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX)
}

/** Expiry in whole days (1–365) or null when invalid. */
export function expiryDays(raw: unknown): number | null {
  const n = typeof raw === 'string' && raw.trim() ? Number(raw) : raw
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_EXPIRY_DAYS ? n : null
}

/** "in 3 days", "today", "2 days ago" for an epoch-ms instant relative to `now` (English, admin). */
export function relativeDays(at: number, now = Date.now()): string {
  const days = Math.round((at - now) / DAY_MS)
  if (days === 0) return at >= now ? 'today' : 'earlier today'
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`
  return `${-days} day${days === -1 ? '' : 's'} ago`
}
