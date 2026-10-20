import type { NextApiRequest, NextApiResponse } from 'next'
import { withApi } from '../../../lib/apiHandler'
import { isAdminRequest } from '../../../lib/auth'
import { getBackupStatus } from '../../../lib/backupSchedule'
import { getPage, listItems } from '../../../lib/contentStore'
import { getDb } from '../../../lib/db'
import { listInbox } from '../../../lib/inbox'
import { isR2Configured } from '../../../lib/r2'
import { passkeyCount } from '../../../lib/adminAuth/passkeys'
import { isPasskeyRequired } from '../../../lib/adminAuth/store'
import { errorTotals } from '../../../lib/errors/store'
import { latestRestoreDrill } from '../../../lib/restoreDrill'
import { readinessCounts } from '../../../lib/cvReadinessServer'
import { scheduledEntries } from '../../../lib/schedule/store'
import { listReviewLinks } from '../../../lib/review/store'
import { librarySummary } from '../../../lib/media/list'

/**
 * GET /api/admin/overview — the admin status hub's numbers (admin only,
 * never cached). Every value is read from the live store; configuration
 * flags are booleans derived from env presence, never the values.
 */

export type EditKind = 'cv' | 'home' | 'post' | 'work' | 'page'

export type AdminOverview = {
  inbox: { unread: number; total: number }
  posts: { published: number; drafts: number }
  work: { published: number; drafts: number }
  pages: { nowEmpty: boolean; usesEmpty: boolean; aboutEmpty: boolean }
  backup: { lastAt: number | null; lastOk: boolean | null; ageHours: number | null; scheduled: boolean; nextAt?: number }
  r2: { configured: boolean; pending: number }
  config: { smtp: boolean; githubToken: boolean; trustedProxy: boolean; cfApi: boolean; indexNow: boolean }
  lastEdits: { kind: EditKind; ref: string; updatedAt: number }[]
  /** Sign-in hardening (null when auth.db cannot be read). */
  security: { passkeys: number; passkeyRequired: boolean } | null
  /** Error monitor totals (null when the store cannot be read). */
  errors: { open: number; new24h: number } | null
  restoreDrill: { status: 'passed' | 'failed' | 'skipped'; ranAt: number } | null
  /** CV readiness checks (lib/cvReadiness, without the page-length check); null when they could not run. */
  cvReadiness?: { open: number; high: number; dismissed: number } | null
  /** Scheduled publishing (H5): how many actions are scheduled and the soonest (null when unreadable). */
  scheduled?: { count: number; nextAt: number | null; activeReviewLinks: number } | null
  /** The media library (lib/media/list): uploads on this server, how many lack default alt text or are unused, and the trash. */
  media?: { total: number; missingAlt: number; unused: number; trash: number } | null
}

const LAST_EDITS = 5

const present = (name: string) => !!(process.env[name] || '').trim()

function counts(collection: 'blog' | 'work'): { published: number; drafts: number } {
  let published = 0
  let drafts = 0
  for (const item of listItems(collection)) {
    if (item.frontmatter?.draft) drafts++
    else published++
  }
  return { published, drafts }
}

const pageEmpty = (name: 'now' | 'uses' | 'about') => !(getPage(name)?.body || '').trim()

function lastEdits(): AdminOverview['lastEdits'] {
  const rows = getDb()
    .prepare(
      `SELECT kind, ref, updated_at AS updatedAt FROM (
         SELECT CASE key WHEN 'cvdata' THEN 'cv' ELSE key END AS kind, key AS ref, updated_at FROM kv WHERE key IN ('cvdata', 'home')
         UNION ALL
         SELECT 'page' AS kind, name AS ref, updated_at FROM pages
         UNION ALL
         SELECT CASE collection WHEN 'blog' THEN 'post' ELSE 'work' END AS kind, slug AS ref, updated_at FROM collection_items WHERE collection IN ('blog', 'work')
       ) ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(LAST_EDITS) as { kind: EditKind; ref: string; updatedAt: number }[]
  return rows.map((r) => ({ kind: r.kind, ref: r.ref, updatedAt: Number(r.updatedAt) || 0 }))
}

function r2Pending(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM r2_pending').get() as { n: number } | undefined
  return Number(row?.n) || 0
}

export function readOverview(): AdminOverview {
  const inbox = listInbox()
  const backup = getBackupStatus()
  return {
    inbox: { unread: inbox.unread, total: inbox.total },
    posts: counts('blog'),
    work: counts('work'),
    pages: { nowEmpty: pageEmpty('now'), usesEmpty: pageEmpty('uses'), aboutEmpty: pageEmpty('about') },
    backup: {
      lastAt: backup.lastAt,
      lastOk: backup.lastOk,
      ageHours: backup.ageHours,
      scheduled: backup.scheduled,
      ...(backup.nextAt ? { nextAt: backup.nextAt } : {}),
    },
    r2: { configured: isR2Configured(), pending: r2Pending() },
    config: {
      smtp: present('SMTP_HOST') && present('SMTP_USER') && present('SMTP_PASS'),
      githubToken: present('GITHUB_TOKEN'),
      trustedProxy: present('TRUSTED_PROXY_IPS'),
      cfApi: present('CF_API_TOKEN') && present('CF_ZONE_ID'),
      indexNow: present('INDEXNOW_KEY'),
    },
    lastEdits: lastEdits(),
    security: safely(() => ({ passkeys: passkeyCount(), passkeyRequired: isPasskeyRequired() })),
    errors: safely(() => {
      const t = errorTotals()
      return { open: t.open, new24h: t.new24h }
    }),
    restoreDrill: safely(() => {
      const d = latestRestoreDrill()
      return d ? { status: d.status, ranAt: d.ranAt } : null
    }),
    cvReadiness: readinessCounts(),
    scheduled: safely(() => {
      const all = scheduledEntries()
      return { count: all.length, nextAt: all[0]?.at ?? null, activeReviewLinks: listReviewLinks().length }
    }),
    media: safely(librarySummary),
  }
}

/** A part of the overview that must not fail the whole status hub. */
function safely<T>(read: () => T): T | null {
  try {
    return read()
  } catch {
    return null
  }
}

export default withApi('admin/overview', (req: NextApiRequest, res: NextApiResponse) => {
  if (!isAdminRequest(req, res)) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json(readOverview())
})
