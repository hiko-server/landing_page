import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { rateLimit } from '../../../lib/rateLimit'
import { signedOgImageUrl } from '../../../lib/og/sign'
import type { OgImageOptions } from '../../../lib/schema'

/**
 * POST /api/admin/og-preview { collection, title, lang?, date?, mins?, tags?, cover? }
 *   → 200 { card, square } — same-origin paths of the signed /api/og social
 *     card for the editor's UNSAVED state (H1's share previews).
 *
 * /api/og renders free text only behind an HMAC signature computed on the
 * server (lib/og/sign.ts — CRIT-og-signing), so the editor asks here for
 * the card of what it is showing. Admin-only (middleware gate plus the
 * session check here), rate-limited, never cached. The text is the owner's
 * own; the endpoint clamps and validates it like the public loaders do.
 */
export default withApi('admin/og-preview', async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')
  const rl = rateLimit(req, 120, 10 * 60 * 1000, 'og-preview')
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))))
    return res.status(429).json({ error: 'Too many previews, try again shortly' })
  }
  const b = (req.body || {}) as Record<string, unknown>
  const kind = b.collection === 'work' ? 'work' : b.collection === 'blog' ? 'blog' : null
  if (!kind) return res.status(400).json({ error: 'collection must be "blog" or "work"' })
  const title = typeof b.title === 'string' ? b.title.trim() : ''
  if (!title) return res.status(400).json({ error: 'title required' })
  const card: OgImageOptions = {
    kind,
    title,
    lang: b.lang === 'zh' ? 'zh' : 'en',
    date: kind === 'blog' && typeof b.date === 'string' ? b.date : undefined,
    mins: typeof b.mins === 'number' && Number.isFinite(b.mins) ? b.mins : undefined,
    tags: Array.isArray(b.tags) ? b.tags.filter((t): t is string => typeof t === 'string').slice(0, 3) : [],
    cover: typeof b.cover === 'string' ? b.cover : undefined,
  }
  const local = (abs: string) => {
    const u = new URL(abs)
    return `${u.pathname}${u.search}`
  }
  return res.status(200).json({
    card: local(signedOgImageUrl(card)),
    square: local(signedOgImageUrl({ ...card, size: 'square' })),
  })
})
