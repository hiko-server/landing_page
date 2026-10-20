import crypto from 'node:crypto'
import { getAuthDb } from '../adminAuth/db'
import type { CvLang } from '../cvVisibility'
import { DAY_MS, MAX_ACTIVE_LINKS, SHARE_LINK_ID_RE, cleanNote, shareLinkState, type ShareLink } from './links'
import { mintShareToken, shareKey, shareTokenHash, verifyShareToken } from './token'

/**
 * Private share links of CV variants (E4) in auth.db (`cv_share_links`,
 * scripts/db/auth/003) — SERVER-ONLY.
 *
 * A token is shown to the owner exactly once, when the link is made; only
 * its SHA-256 is stored. Opening a link (resolveShareToken) checks the
 * signature, the hash, revocation and expiry; nothing else about a visitor
 * is ever written — an open adds one to `open_count` and sets the UTC day
 * (recordShareOpen), and only when the page reported a real render.
 */

type Row = {
  id: string
  token_hash: string
  variant_id: string
  lang: string
  note: string
  created_at: number
  expires_at: number
  revoked_at: number | null
  open_count: number
  last_opened_day: string | null
}

const COLUMNS = 'id, token_hash, variant_id, lang, note, created_at, expires_at, revoked_at, open_count, last_opened_day'

function toLink(row: Row, now: number): ShareLink {
  const link = {
    id: row.id,
    variantId: row.variant_id,
    lang: (row.lang === 'zh' ? 'zh' : 'en') as CvLang,
    note: row.note,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? null,
    openCount: row.open_count,
    lastOpenedDay: row.last_opened_day ?? null,
  }
  return { ...link, state: shareLinkState(link, now) }
}

function newLinkId(): string {
  return `l${Array.from(crypto.randomBytes(14), (b) => (b % 36).toString(36)).join('')}`
}

export type CreateShareLinkInput = { variantId: string; lang: CvLang; note?: string; days: number; now?: number }
export type CreateShareLinkResult =
  | { ok: true; link: ShareLink; token: string }
  | { ok: false; code: 'NO_KEY' | 'TOO_MANY'; error: string }

export function createShareLink(input: CreateShareLinkInput): CreateShareLinkResult {
  const key = shareKey()
  if (!key) return { ok: false, code: 'NO_KEY', error: 'Private links need JWT_SECRET on the server.' }
  const now = input.now ?? Date.now()
  const db = getAuthDb()
  const active = db
    .prepare('SELECT count(*) AS n FROM cv_share_links WHERE variant_id = ? AND revoked_at IS NULL AND expires_at > ?')
    .get(input.variantId, now) as { n: number }
  if (active.n >= MAX_ACTIVE_LINKS) {
    return { ok: false, code: 'TOO_MANY', error: `This variant already has ${MAX_ACTIVE_LINKS} active links — revoke one first.` }
  }
  const { token, hash } = mintShareToken(key)
  const id = newLinkId()
  const note = cleanNote(input.note)
  const expiresAt = now + input.days * DAY_MS
  db.prepare(
    `INSERT INTO cv_share_links (id, token_hash, variant_id, lang, note, created_at, expires_at, revoked_at, open_count, last_opened_day)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL)`,
  ).run(id, hash, input.variantId, input.lang, note, now, expiresAt)
  const row = db.prepare(`SELECT ${COLUMNS} FROM cv_share_links WHERE id = ?`).get(id) as Row
  return { ok: true, link: toLink(row, now), token }
}

/** Every link, newest first (optionally of one variant). */
export function listShareLinks(opts: { variantId?: string; now?: number } = {}): ShareLink[] {
  const now = opts.now ?? Date.now()
  const db = getAuthDb()
  const rows = (
    opts.variantId
      ? db.prepare(`SELECT ${COLUMNS} FROM cv_share_links WHERE variant_id = ? ORDER BY created_at DESC`).all(opts.variantId)
      : db.prepare(`SELECT ${COLUMNS} FROM cv_share_links ORDER BY created_at DESC`).all()
  ) as Row[]
  return rows.map((r) => toLink(r, now))
}

export function getShareLink(id: unknown, now = Date.now()): ShareLink | null {
  if (typeof id !== 'string' || !SHARE_LINK_ID_RE.test(id)) return null
  const row = getAuthDb().prepare(`SELECT ${COLUMNS} FROM cv_share_links WHERE id = ?`).get(id) as Row | undefined
  return row ? toLink(row, now) : null
}

/** Revoke a link (idempotent). Null when there is no such link. */
export function revokeShareLink(id: unknown, now = Date.now()): ShareLink | null {
  const link = getShareLink(id, now)
  if (!link) return null
  if (link.revokedAt === null) getAuthDb().prepare('UPDATE cv_share_links SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, link.id)
  return getShareLink(link.id, now)
}

/** Revoke every link of a variant (the variant was deleted); returns how many were active. */
export function revokeVariantLinks(variantId: string, now = Date.now()): number {
  const r = getAuthDb()
    .prepare('UPDATE cv_share_links SET revoked_at = ? WHERE variant_id = ? AND revoked_at IS NULL')
    .run(now, variantId) as { changes: number }
  return r.changes
}

export type ShareLinkEdit = { note?: unknown; extendDays?: number }

/**
 * Change a link's note, or move its expiry to `extendDays` days from now
 * (a revoked link stays revoked; an expired one comes back for that long).
 */
export function editShareLink(id: unknown, edit: ShareLinkEdit, now = Date.now()): ShareLink | null {
  const link = getShareLink(id, now)
  if (!link) return null
  const db = getAuthDb()
  if (edit.note !== undefined) db.prepare('UPDATE cv_share_links SET note = ? WHERE id = ?').run(cleanNote(edit.note), link.id)
  if (edit.extendDays !== undefined && link.revokedAt === null) {
    db.prepare('UPDATE cv_share_links SET expires_at = ? WHERE id = ?').run(now + edit.extendDays * DAY_MS, link.id)
  }
  return getShareLink(link.id, now)
}

/** Forget a link that no longer works (revoked or expired). False when it is still active or missing. */
export function removeShareLink(id: unknown, now = Date.now()): boolean {
  const link = getShareLink(id, now)
  if (!link || link.state === 'active') return false
  getAuthDb().prepare('DELETE FROM cv_share_links WHERE id = ?').run(link.id)
  return true
}

/**
 * The ACTIVE link a token opens, or null — for a malformed or unsigned
 * token without touching the store, else for an unknown, revoked or
 * expired one. The same null for every case: a visitor learns nothing
 * about links that do not work.
 */
export function resolveShareToken(token: unknown, now = Date.now()): ShareLink | null {
  if (!verifyShareToken(token, shareKey())) return null
  const row = getAuthDb().prepare(`SELECT ${COLUMNS} FROM cv_share_links WHERE token_hash = ?`).get(shareTokenHash(token)) as Row | undefined
  if (!row) return null
  const link = toLink(row, now)
  return link.state === 'active' ? link : null
}

/** UTC day "YYYY-MM-DD". */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Count one open of an active link: +1 and today's UTC day. False when the token opens nothing. */
export function recordShareOpen(token: unknown, now = Date.now()): boolean {
  const link = resolveShareToken(token, now)
  if (!link) return false
  getAuthDb()
    .prepare('UPDATE cv_share_links SET open_count = open_count + 1, last_opened_day = ? WHERE id = ? AND revoked_at IS NULL AND expires_at > ?')
    .run(utcDay(now), link.id, now)
  return true
}
