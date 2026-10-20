/**
 * What an admin write did, in words (pure, unit-tested; shared by the
 * capture in lib/apiHandler and the Activity view).
 *
 * describeAdminWrite(route, request) names the action of a write request
 * BEFORE it runs — the route name given to withApi, the method, the query
 * and the parsed JSON body — or returns null for requests that change
 * nothing (reads, previews, step-up checks, registration challenges). The
 * capture records it only when the response succeeded (2xx).
 *
 * Labels never quote message bodies, e-mail addresses or file contents:
 * targets are slugs, page names, snapshot dates, host names and counts.
 */

export const AUDIT_AREAS = [
  'post',
  'work',
  'page',
  'cv',
  'home',
  'inbox',
  'media',
  'storage',
  'versions',
  'errors',
  'health',
  'security',
  'session',
  'system',
] as const
export type AuditArea = (typeof AUDIT_AREAS)[number]

export const AUDIT_AREA_LABEL: Record<AuditArea, string> = {
  post: 'Posts',
  work: 'Case studies',
  page: 'Pages',
  cv: 'CV',
  home: 'Home page',
  inbox: 'Inbox',
  media: 'Images',
  storage: 'Backups & storage',
  versions: 'Version history',
  errors: 'Errors',
  health: 'Content health',
  security: 'Security',
  session: 'Sign-in',
  system: 'System',
}

export function isAuditArea(v: unknown): v is AuditArea {
  return typeof v === 'string' && (AUDIT_AREAS as readonly string[]).includes(v)
}

export type AuditDescription = {
  /** Stable machine name, e.g. "post.publish". */
  action: string
  area: AuditArea
  /** Slug, page name, filename, host or count — never personal data. */
  target: string | null
  /** One readable line: "Published post “swcs”". */
  summary: string
}

export type AuditRequest = {
  method: string
  query: Record<string, string | string[] | undefined>
  body: unknown
}

/** Facts read from the store before the write runs (lib/audit/capture.ts). */
export type AuditFacts = {
  /** Posts / case studies: whether the item exists and is a draft right now (null = no such item). */
  existingDraft?: boolean | null
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isWriteMethod(method: string | undefined): boolean {
  return WRITE_METHODS.has(String(method || '').toUpperCase())
}

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) || ''
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const str = (v: unknown, max = 120): string => (typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : '')
const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const quote = (s: string) => `“${s}”`

const SLUG_RE = /^[a-z0-9][a-z0-9-_]{0,127}$/
const slugOf = (v: unknown): string => {
  const s = str(v, 128)
  return SLUG_RE.test(s) ? s : ''
}

/** "2026-10-14 08:31" from a snapshot filename's UTC stamp, else the filename. */
export function snapshotStamp(filename: unknown): string {
  const s = str(filename, 200)
  const m = /(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})/.exec(s)
  return m ? `${m[1]} ${m[2]}:${m[3]} UTC` : s
}

function hostOf(url: unknown): string {
  try {
    return new URL(str(url, 2048)).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

const COLLECTION_NOUN = { post: 'post', work: 'case study' } as const
const PAGE_LABEL: Record<string, string> = { now: '/now', uses: '/uses', about: 'the About bio' }

function collectionWrite(area: 'post' | 'work', req: AuditRequest, facts: AuditFacts): AuditDescription | null {
  const noun = COLLECTION_NOUN[area]
  if (req.method === 'PUT') {
    const b = obj(req.body)
    const slug = slugOf(b.slug)
    if (!slug) return null
    const fm = obj(b.frontmatter)
    const title = str(fm.title) || slug
    const draft = fm.draft === true
    if (b.create === true || facts.existingDraft === null) {
      return draft
        ? { action: `${area}.create`, area, target: slug, summary: `Created draft ${noun} ${quote(title)}` }
        : { action: `${area}.publish`, area, target: slug, summary: `Created and published ${noun} ${quote(title)}` }
    }
    if (facts.existingDraft === true && !draft) return { action: `${area}.publish`, area, target: slug, summary: `Published ${noun} ${quote(title)}` }
    if (facts.existingDraft === false && draft) return { action: `${area}.unpublish`, area, target: slug, summary: `Unpublished ${noun} ${quote(title)}` }
    return { action: `${area}.save`, area, target: slug, summary: `Saved ${noun} ${quote(title)}` }
  }
  if (req.method === 'DELETE') {
    const slug = slugOf(first(req.query.slug))
    return slug ? { action: `${area}.delete`, area, target: slug, summary: `Deleted ${noun} ${quote(slug)}` } : null
  }
  return null
}

function versionsWrite(req: AuditRequest): AuditDescription | null {
  const b = obj(req.body)
  const type = first(req.query.type) || str(b.type) || 'cv'
  const action = str(b.action)
  if (type === 'cv' || type === 'home') {
    const area = type
    const doc = type === 'cv' ? 'the CV' : 'the home page'
    if (action === 'snapshot') return { action: `${area}.snapshot`, area, target: null, summary: `Took a snapshot of ${doc}` }
    if (action === 'restore') {
      return { action: `${area}.restore`, area, target: str(b.filename, 200) || null, summary: `Restored ${doc} from ${snapshotStamp(b.filename)}` }
    }
    return null
  }
  if (action !== 'restore') return null
  if (type === 'page') {
    const name = str(first(req.query.name) || b.name || first(req.query.slug) || b.slug, 16)
    if (!PAGE_LABEL[name]) return null
    return { action: 'page.restore', area: 'page', target: name, summary: `Restored ${PAGE_LABEL[name]} from ${snapshotStamp(b.filename)}` }
  }
  if (type === 'blog' || type === 'work') {
    const area = type === 'blog' ? 'post' : 'work'
    const slug = slugOf(first(req.query.slug) || b.slug)
    if (!slug) return null
    return {
      action: `${area}.restore`,
      area,
      target: slug,
      summary: `Restored ${COLLECTION_NOUN[area]} ${quote(slug)} from ${snapshotStamp(b.filename)}`,
    }
  }
  return null
}

/**
 * Inbox changes worth a line in the log. Read / unread are left out on
 * purpose: opening a message marks it read, so they would record every
 * message the owner looked at (a view, not a change) and drown the rest.
 */
const INBOX_VERBS: Record<string, string> = {
  star: 'Starred {n}',
  unstar: 'Unstarred {n}',
  archive: 'Archived {n}',
  unarchive: 'Moved {n} back to the inbox',
  replied: 'Marked {n} as replied',
  unreplied: 'Marked {n} as not replied',
  delete: 'Deleted {n}',
}

const ERROR_STATUS_VERB: Record<string, string> = { resolved: 'Resolved', ignored: 'Ignored', open: 'Reopened' }

/** The description of a write request, or null when it changes nothing worth recording. */
export function describeAdminWrite(route: string, req: AuditRequest, facts: AuditFacts = {}): AuditDescription | null {
  const method = String(req.method || '').toUpperCase()
  if (!WRITE_METHODS.has(method)) return null
  const r: AuditRequest = { ...req, method }
  const b = obj(req.body)
  switch (route) {
    case 'admin/posts':
      return collectionWrite('post', r, facts)
    case 'admin/work':
      return collectionWrite('work', r, facts)
    case 'admin/page': {
      if (method !== 'PUT') return null
      const name = str(b.name, 16)
      if (!PAGE_LABEL[name]) return null
      const empty = !str(b.body, 10)
      const summary = empty
        ? name === 'about'
          ? 'Removed the About bio'
          : `Cleared ${PAGE_LABEL[name]} (automatic version shown)`
        : `Saved ${PAGE_LABEL[name]}`
      return { action: empty ? 'page.clear' : 'page.save', area: 'page', target: name, summary }
    }
    case 'home':
      return method === 'PUT' ? { action: 'home.save', area: 'home', target: null, summary: 'Saved the home page' } : null
    case 'cvdata': {
      if (method === 'PUT') return { action: 'cv.save', area: 'cv', target: null, summary: 'Saved the CV' }
      if (method !== 'POST') return null
      const action = str(b.action)
      if (action === 'snapshot') return { action: 'cv.snapshot', area: 'cv', target: null, summary: 'Took a snapshot of the CV' }
      if (action === 'restore') return { action: 'cv.restore', area: 'cv', target: str(b.filename, 200) || null, summary: `Restored the CV from ${snapshotStamp(b.filename)}` }
      if (action === 'import') return { action: 'cv.import', area: 'cv', target: null, summary: 'Imported a CV document' }
      return null
    }
    case 'versions':
      return method === 'POST' ? versionsWrite(r) : null
    case 'admin/inbox': {
      if (method !== 'POST') return null
      if (b.action === 'template' && (b.lang === 'en' || b.lang === 'zh')) {
        const which = b.lang === 'zh' ? '中文' : 'English'
        return str(b.text, 10)
          ? { action: 'inbox.template', area: 'inbox', target: b.lang, summary: `Saved the ${which} reply template` }
          : { action: 'inbox.template', area: 'inbox', target: b.lang, summary: `Removed the ${which} reply template` }
      }
      const verb = INBOX_VERBS[str(b.action, 16)]
      const n = count(b.ids)
      if (!verb || !n) return null
      return { action: `inbox.${str(b.action, 16)}`, area: 'inbox', target: String(n), summary: verb.replace('{n}', plural(n, 'message')) }
    }
    case 'admin/inbox/reply':
      return method === 'POST'
        ? { action: 'inbox.reply', area: 'inbox', target: str(b.id, 16) || null, summary: 'Replied to a contact message by e-mail' }
        : null
    case 'admin/upload-image': {
      if (method !== 'POST') return null
      const name = str(b.filename, 80)
      return { action: 'media.upload', area: 'media', target: name || null, summary: name ? `Uploaded image ${quote(name)}` : 'Uploaded an image' }
    }
    case 'admin/import-image': {
      if (method !== 'POST') return null
      const host = hostOf(b.url)
      return { action: 'media.import', area: 'media', target: host || null, summary: host ? `Imported an image from ${host}` : 'Imported a remote image' }
    }
    case 'admin/media-optimize':
      return method === 'POST' ? { action: 'media.optimize', area: 'media', target: null, summary: 'Generated responsive image versions' } : null
    case 'admin/storage/backup':
      return method === 'POST' ? { action: 'storage.backup', area: 'storage', target: null, summary: 'Backed up the whole site' } : null
    case 'admin/storage/pull': {
      if (method !== 'POST') return null
      const local = str(b.source) === 'local'
      const file = str(b.filename, 200)
      return {
        action: 'storage.restore',
        area: 'storage',
        target: local ? file || null : 'r2',
        summary: local ? `Restored the site from the local backup ${quote(file || 'snapshot')}` : 'Restored the site from the latest R2 backup',
      }
    }
    case 'mongo': {
      if (method !== 'POST') return null
      const action = str(b.action, 24)
      if (action === 'save_config') return { action: 'storage.mongo-config', area: 'storage', target: null, summary: 'Changed the MongoDB backup target' }
      if (action === 'backup') return { action: 'storage.mongo-backup', area: 'storage', target: null, summary: 'Backed up to MongoDB' }
      if (action === 'restore') return { action: 'storage.mongo-restore', area: 'storage', target: null, summary: 'Restored content from MongoDB' }
      return null
    }
    case 'admin/errors': {
      if (method === 'PATCH') {
        const verb = ERROR_STATUS_VERB[str(b.status, 16)]
        const n = count(b.fingerprints)
        return verb && n ? { action: `errors.${str(b.status, 16)}`, area: 'errors', target: String(n), summary: `${verb} ${plural(n, 'error')}` } : null
      }
      if (method === 'DELETE') {
        if (b.resolved === true) return { action: 'errors.clear', area: 'errors', target: null, summary: 'Cleared every resolved error' }
        const n = count(b.fingerprints)
        return n ? { action: 'errors.delete', area: 'errors', target: String(n), summary: `Deleted ${plural(n, 'error')}` } : null
      }
      return null
    }
    case 'admin/restore-drill':
      return method === 'POST' ? { action: 'system.restore-drill', area: 'system', target: null, summary: 'Ran a restore drill' } : null
    case 'admin/test-mail':
      return method === 'POST' ? { action: 'system.test-mail', area: 'system', target: null, summary: 'Sent a test e-mail' } : null
    case 'admin/content-health': {
      if (method !== 'POST') return null
      const action = str(b.action, 24)
      if (action === 'check-links') return { action: 'health.check-links', area: 'health', target: null, summary: 'Started a link check' }
      if (action === 'fix') {
        const n = count(b.fixes)
        return n ? { action: 'health.fix', area: 'health', target: String(n), summary: `Applied ${plural(n, 'content health fix', 'content health fixes')}` } : null
      }
      return null
    }
    case 'admin/security/passkeys': {
      if (method === 'POST') return str(b.action) === 'register' ? { action: 'security.passkey-add', area: 'security', target: null, summary: 'Added a passkey' } : null
      if (method === 'PATCH') return { action: 'security.passkey-rename', area: 'security', target: null, summary: 'Renamed a passkey' }
      if (method === 'DELETE') return { action: 'security.passkey-remove', area: 'security', target: null, summary: 'Removed a passkey' }
      return null
    }
    case 'admin/security/recovery-codes':
      return method === 'POST' ? { action: 'security.recovery-codes', area: 'security', target: null, summary: 'Created new recovery codes' } : null
    case 'admin/security/policy':
      return method === 'PUT'
        ? b.passkeyRequired === true
          ? { action: 'security.require-passkey', area: 'security', target: null, summary: 'Turned on “Require a passkey”' }
          : { action: 'security.allow-password', area: 'security', target: null, summary: 'Turned off “Require a passkey”' }
        : null
    case 'admin/security/sessions': {
      if (method !== 'DELETE') return null
      if (b.all === true) return { action: 'security.signout-all', area: 'security', target: null, summary: 'Signed out every browser' }
      if (b.others === true) return { action: 'security.signout-others', area: 'security', target: null, summary: 'Signed out every other browser' }
      return { action: 'security.signout-one', area: 'security', target: null, summary: 'Signed out a browser' }
    }
    case 'admin/logout':
      return method === 'POST' ? { action: 'session.logout', area: 'session', target: null, summary: 'Signed out' } : null
    default:
      return null
  }
}

/** Routes whose writes describeAdminWrite knows (for the capture's fast path). */
export const AUDITED_ROUTES: ReadonlySet<string> = new Set([
  'admin/posts',
  'admin/work',
  'admin/page',
  'home',
  'cvdata',
  'versions',
  'admin/inbox',
  'admin/inbox/reply',
  'admin/upload-image',
  'admin/import-image',
  'admin/media-optimize',
  'admin/storage/backup',
  'admin/storage/pull',
  'mongo',
  'admin/errors',
  'admin/restore-drill',
  'admin/test-mail',
  'admin/content-health',
  'admin/security/passkeys',
  'admin/security/recovery-codes',
  'admin/security/policy',
  'admin/security/sessions',
  'admin/logout',
])

/** Admin page that edits an entry's target, for the Activity view's links (null = none). */
export function auditTargetHref(area: string, target: string | null): string | null {
  switch (area) {
    case 'post':
      return target && SLUG_RE.test(target) ? `/admin/blog/edit?slug=${encodeURIComponent(target)}` : '/admin/blog'
    case 'work':
      return target && SLUG_RE.test(target) ? `/admin/work/edit?slug=${encodeURIComponent(target)}` : '/admin/work'
    case 'page':
      return target && PAGE_LABEL[target] ? `/admin/${target}` : null
    case 'cv':
      return '/admin/dashboard?tab=cv'
    case 'home':
      return '/admin/dashboard?tab=home'
    case 'inbox':
      return '/admin/dashboard?tab=inbox'
    case 'media':
      return null
    case 'storage':
      return '/admin/dashboard?tab=storage'
    case 'errors':
      return '/admin/system?view=errors'
    case 'health':
      return '/admin/system?view=content'
    case 'security':
    case 'session':
      return '/admin/security'
    case 'system':
      return '/admin/system'
    default:
      return null
  }
}
