import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { rateLimit } from '../../../lib/rateLimit'
import { recordAdminAudit } from '../../../lib/audit/record'
import { getItem } from '../../../lib/contentStore'
import { redirectsTo } from '../../../lib/redirects'
import { formatSiteTime } from '../../../lib/schedule/time'
import {
  cleanTtlHours,
  createReviewLink,
  getReviewLink,
  listReviewLinks,
  revokeItemLinks,
  revokeReviewLink,
  reviewTarget,
  shareableVariant,
  type ReviewCollection,
  type ReviewLinkView,
} from '../../../lib/review/store'

/**
 * Review links (H5, lib/review): private, expiring, revocable links that
 * show one draft — or a live item's saved, unpublished changes — read-only
 * at /review/<token>.
 *
 *   GET    ?collection=blog&slug=x  → { links, shareable } — the item's links
 *                                     (active and recently ended; links made
 *                                     under an old slug included) and what a
 *                                     new link would show ('draft' | 'changes',
 *                                     or null with the reason)
 *   GET                             → { links } — every active link, with
 *                                     the item's title and current slug
 *   POST   { collection, slug, ttlHours, label? }
 *                                   → 201 { link } (ttlHours 1–720; what it
 *                                     shows follows the item: its draft, or
 *                                     its pending changes); 409 NOTHING_TO_SHARE
 *                                     for a live item without changes
 *   DELETE { id }                   → turn one link off → { link }
 *   DELETE { collection, slug, all: true } → turn off every link of the item
 *
 * Admin-only. Writes are recorded in the activity log.
 */

const isCollection = (v: unknown): v is ReviewCollection => v === 'blog' || v === 'work'
const SLUG_RE = /^[a-z0-9][a-z0-9-_]{0,127}$/
const ID_RE = /^[A-Za-z0-9_-]{22}$/
const AREA = { blog: 'post', work: 'work' } as const
const NOUN = { blog: 'post', work: 'case study' } as const

/** The item's slug now (a link made before a rename names the old one). */
function currentSlug(c: ReviewCollection, slug: string): string {
  const target = reviewTarget({ collection: c, slug, variant: 'draft' })
  return target.kind === 'render' ? target.slug : target.kind === 'public' ? target.path.split('/').pop() || slug : slug
}

function withItem(l: ReviewLinkView) {
  const slug = currentSlug(l.collection, l.slug)
  const title = getItem(l.collection, slug)?.frontmatter?.title
  return { ...l, currentSlug: slug, title: typeof title === 'string' && title.trim() ? title.trim() : slug }
}

export default withApi('admin/review-links', async (req, res) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    const { collection, slug } = req.query
    if (collection !== undefined || slug !== undefined) {
      if (!isCollection(collection) || typeof slug !== 'string' || !SLUG_RE.test(slug)) return res.status(400).json({ error: 'Invalid item' })
      const links = listReviewLinks({ collection, slugs: [slug, ...redirectsTo(collection, slug)], includeInactive: true })
      return res.status(200).json({ links: links.map(withItem), shareable: shareableVariant(collection, slug) })
    }
    return res.status(200).json({ links: listReviewLinks().map(withItem) })
  }

  if (req.method === 'POST') {
    const rl = rateLimit(req, 30, 10 * 60 * 1000)
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) return res.status(429).json({ error: 'Too many links in a short time — wait a minute and try again.' })
    const body = (req.body || {}) as { collection?: unknown; slug?: unknown; ttlHours?: unknown; label?: unknown }
    if (!isCollection(body.collection) || typeof body.slug !== 'string' || !SLUG_RE.test(body.slug)) return res.status(400).json({ error: 'Invalid item' })
    const ttlHours = cleanTtlHours(body.ttlHours)
    if (ttlHours === null) return res.status(400).json({ code: 'BAD_TTL', error: 'A review link lasts from 1 hour to 30 days (ttlHours 1–720).' })
    const shareable = shareableVariant(body.collection, body.slug)
    if (!shareable.variant) {
      return shareable.reason === 'not-found'
        ? res.status(404).json({ error: 'Not found' })
        : res.status(409).json({ code: 'NOTHING_TO_SHARE', error: 'This item is live and has no saved changes — share its public page instead.' })
    }
    const out = createReviewLink({ collection: body.collection, slug: body.slug, variant: shareable.variant, ttlHours, label: body.label })
    if (!out.ok) return res.status(out.status).json({ code: out.code, error: out.error })
    const noun = NOUN[body.collection]
    recordAdminAudit(req, res, {
      action: `${AREA[body.collection]}.review-link`,
      area: AREA[body.collection],
      target: body.slug,
      summary: `Shared ${shareable.variant === 'draft' ? `the draft ${noun}` : `the unpublished changes to ${noun}`} “${body.slug}” for review until ${formatSiteTime(out.link.expiresAt)}`,
    }, { status: 201 })
    return res.status(201).json({ link: withItem(out.link) })
  }

  if (req.method === 'DELETE') {
    const body = (req.body || {}) as { id?: unknown; collection?: unknown; slug?: unknown; all?: unknown }
    if (body.all === true) {
      if (!isCollection(body.collection) || typeof body.slug !== 'string' || !SLUG_RE.test(body.slug)) return res.status(400).json({ error: 'Invalid item' })
      const revoked = revokeItemLinks(body.collection, [body.slug, ...redirectsTo(body.collection, body.slug)])
      if (revoked) {
        recordAdminAudit(req, res, {
          action: `${AREA[body.collection]}.review-revoke`,
          area: AREA[body.collection],
          target: body.slug,
          summary: `Turned off ${revoked === 1 ? 'the review link' : `${revoked} review links`} of ${NOUN[body.collection]} “${body.slug}”`,
        })
      }
      return res.status(200).json({ revoked })
    }
    if (typeof body.id !== 'string' || !ID_RE.test(body.id)) return res.status(400).json({ error: 'Invalid link id' })
    const before = getReviewLink(body.id)
    if (!before) return res.status(404).json({ error: 'No such link' })
    const link = revokeReviewLink(body.id)
    if (!link) return res.status(404).json({ error: 'No such link' })
    if (before.revokedAt === null) {
      recordAdminAudit(req, res, {
        action: `${AREA[link.collection]}.review-revoke`,
        area: AREA[link.collection],
        target: link.slug,
        // The owner's note is left out: it may name the person the link was for.
        summary: `Turned off a review link of ${NOUN[link.collection]} “${link.slug}”`,
      })
    }
    const [shown] = listReviewLinks({ collection: link.collection, slugs: [link.slug], includeInactive: true }).filter((l) => l.id === link.id)
    return res.status(200).json({ link: shown ? withItem(shown) : null })
  }

  res.setHeader('Allow', 'GET,POST,DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
})
