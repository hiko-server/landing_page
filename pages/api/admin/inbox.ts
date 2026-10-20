import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { deleteInbox, isInboxId, listInbox, setInboxFlag, type InboxFlag } from '../../../lib/inbox'
import { MAX_TEMPLATE_CHARS, writeReplyTemplate } from '../../../lib/inboxTemplates'
import { getRetentionStatus } from '../../../lib/inboxRetention'

/**
 * Contact inbox for the admin.
 *
 *   GET  /api/admin/inbox                       → { messages, unread, total, archived, starred,
 *                                                 truncated, storage, retentionDays,
 *                                                 retention: { days, scheduled, nextAt, lastRun } }
 *   GET  /api/admin/inbox?summary=1             → { unread, total }   (badge polling: no
 *                                                 message bodies, no storage stats)
 *   POST /api/admin/inbox { action, ids }       → { ok, affected, unread, total, archived, starred, storage }
 *        action: read | unread | star | unstar | archive | unarchive | replied | unreplied | delete
 *        ids: up to 500 message ids
 *   POST /api/admin/inbox { action: 'template', lang: 'en' | 'zh', text }
 *                                               → { ok, templates }   (blank text removes it;
 *                                                 stored in the content store, lib/inboxTemplates)
 *
 * Replies (and the composer's identity + templates) are under
 * /api/admin/inbox/reply. Every call does bounded
 * work (lib/inbox.ts reads only the tail of the log and streams it
 * otherwise), so a large log can't exhaust memory. Deleting remembers the
 * ids, so restoring an older backup won't bring them back. Writes are
 * recorded in the activity log (lib/apiHandler).
 *
 * The proxy already gates /api/admin/* and refuses cross-site or
 * non-JSON writes; the session check here is the defence-in-depth copy that
 * also enforces session revocation.
 */
const FLAG_ACTIONS: Record<string, { flag: InboxFlag; on: boolean }> = {
  read: { flag: 'read', on: true },
  unread: { flag: 'read', on: false },
  star: { flag: 'starred', on: true },
  unstar: { flag: 'starred', on: false },
  archive: { flag: 'archived', on: true },
  unarchive: { flag: 'archived', on: false },
  replied: { flag: 'replied', on: true },
  unreplied: { flag: 'replied', on: false },
}
const MAX_IDS = 500

/** `?summary=1` (the first value wins if the parameter is repeated). */
function wantsSummary(value: string | string[] | undefined): boolean {
  return (Array.isArray(value) ? value[0] : value) === '1'
}

export default withApi('admin/inbox', async (req, res, { log }) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    try {
      const listing = listInbox()
      if (wantsSummary(req.query.summary)) {
        return res.status(200).json({ unread: listing.unread, total: listing.total })
      }
      return res.status(200).json({ ...listing, retention: getRetentionStatus() })
    } catch (err) {
      log.error('inbox read failed', { err })
      return res.status(500).json({ error: 'Could not read the inbox' })
    }
  }

  if (req.method === 'POST') {
    const { action, ids, lang, text } = (req.body || {}) as { action?: unknown; ids?: unknown; lang?: unknown; text?: unknown }
    if (action === 'template') {
      if (lang !== 'en' && lang !== 'zh') return res.status(400).json({ error: "lang must be 'en' or 'zh'" })
      if (typeof text !== 'string') return res.status(400).json({ error: 'text must be a string' })
      if (text.length > MAX_TEMPLATE_CHARS) return res.status(400).json({ error: `Keep the template under ${MAX_TEMPLATE_CHARS} characters.` })
      try {
        const saved = await writeReplyTemplate(lang, text)
        if (!saved.ok) {
          log.error('inbox template save failed', { error: saved.error })
          return res.status(500).json({ error: 'Could not save the template' })
        }
        return res.status(200).json({ ok: true, templates: saved.templates, ...(saved.r2Warning ? { warning: saved.r2Warning } : {}) })
      } catch (err) {
        log.error('inbox template save failed', { err })
        return res.status(500).json({ error: 'Could not save the template' })
      }
    }
    if (typeof action !== 'string' || (action !== 'delete' && !FLAG_ACTIONS[action])) {
      return res.status(400).json({ error: `action must be one of ${[...Object.keys(FLAG_ACTIONS), 'delete'].join(', ')}` })
    }
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || !ids.every(isInboxId)) {
      return res.status(400).json({ error: `ids must be 1–${MAX_IDS} message ids` })
    }
    try {
      const flag = FLAG_ACTIONS[action]
      const affected = action === 'delete' ? deleteInbox(ids) : setInboxFlag(ids, flag.flag, flag.on)
      const { unread, total, archived, starred, storage } = listInbox()
      return res.status(200).json({ ok: true, affected, unread, total, archived, starred, storage })
    } catch (err) {
      log.error('inbox update failed', { err })
      return res.status(500).json({ error: 'Could not update the inbox' })
    }
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
})
