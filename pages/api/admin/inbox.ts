import type { NextApiRequest, NextApiResponse } from 'next'
import { isAdminRequest } from '../../../lib/auth'
import { deleteInbox, isInboxId, listInbox, markInbox } from '../../../lib/inbox'

/**
 * Contact inbox for the admin.
 *
 *   GET  /api/admin/inbox                       → { messages, unread, total, truncated, storage }
 *   GET  /api/admin/inbox?summary=1             → { unread, total }   (badge polling: no
 *                                                 message bodies, no storage stats)
 *   POST /api/admin/inbox { action, ids }       → { ok, affected, unread, total, storage }
 *        action: 'read' | 'unread' | 'delete'   ids: up to 500 message ids
 *
 * Every call does bounded work (lib/inbox.ts reads only the tail of the log
 * and streams it otherwise), so a large log can't exhaust memory. Deleting
 * remembers the ids, so restoring an older backup won't bring them back.
 *
 * The middleware already gates /api/admin/* and refuses cross-site or
 * non-JSON writes; the session check here is the defence-in-depth copy that
 * also enforces session revocation.
 */
const ACTIONS = new Set(['read', 'unread', 'delete'])
const MAX_IDS = 500

/** `?summary=1` (the first value wins if the parameter is repeated). */
function wantsSummary(value: string | string[] | undefined): boolean {
  return (Array.isArray(value) ? value[0] : value) === '1'
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    try {
      const listing = listInbox()
      if (wantsSummary(req.query.summary)) {
        return res.status(200).json({ unread: listing.unread, total: listing.total })
      }
      return res.status(200).json(listing)
    } catch (err: any) {
      console.error('[inbox] read failed', err)
      return res.status(500).json({ error: 'Could not read the inbox' })
    }
  }

  if (req.method === 'POST') {
    const { action, ids } = (req.body || {}) as { action?: unknown; ids?: unknown }
    if (typeof action !== 'string' || !ACTIONS.has(action)) {
      return res.status(400).json({ error: "action must be 'read', 'unread' or 'delete'" })
    }
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || !ids.every(isInboxId)) {
      return res.status(400).json({ error: `ids must be 1–${MAX_IDS} message ids` })
    }
    try {
      const affected = action === 'delete' ? deleteInbox(ids) : markInbox(ids, action === 'read')
      const { unread, total, storage } = listInbox()
      return res.status(200).json({ ok: true, affected, unread, total, storage })
    } catch (err: any) {
      console.error('[inbox] update failed', err)
      return res.status(500).json({ error: 'Could not update the inbox' })
    }
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
