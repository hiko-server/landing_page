import { PAGE_NAMES, pagePublicPath } from './pageNames'
import { SITE_HOST } from './schema'
import { getConfiguredSiteValues, hostnameOf, isLocalHostname } from './env'
import { log } from './log'
import { getItem, getItemFromDb, listItems, renameItem } from './contentStore'
import { applyRename, redirectTarget, type RedirectCollection } from './redirects'
import { rewriteDocument, rewriteJsonLinks, type LinkCollection } from './linkRewrite'
import { getPendingRevision, listPendingRevisions, movePendingRevision, putPendingRevision, rebasedPendingBase } from './pendingRevisions'
import { COLLECTION_EXTRA_PATHS, CV_DOCUMENT_PATHS, CV_PAGE_PATHS, HOME_PAGE_PATHS, collectionPaths, pageRevalidatePaths } from './revalidate'

/**
 * Renaming a post or case study (H6): the item moves to its new slug with
 * its history and its unpublished changes, the old address redirects
 * permanently (lib/redirects, a 308 from getStaticProps), and every internal
 * link to it is rewritten — in the other posts and case studies (live and
 * pending versions), the /now, /uses and /about pages, the CV and the home
 * page. Each rewritten document is snapshotted first, like any save.
 *
 * planRename() is the dry run the rename dialog shows; renameSlug() does it.
 * Server-only.
 */

export type RenameRequest = {
  collection: RedirectCollection
  from: string
  to: string
  /** Keep the old address as a permanent redirect (default true). */
  redirect?: boolean
}

export type RewriteTarget = { kind: 'blog' | 'work' | 'page' | 'cv' | 'home'; ref: string; title: string; links: number }

export type RenamePlan = {
  ok: true
  /** Documents whose links to the old address will be updated. */
  rewrites: RewriteTarget[]
  /** Total links updated. */
  links: number
  /** The new address redirects to this slug today; taking it over stops that redirect. */
  takesOverRedirectTo: string | null
}

export type RenameOutcome = RenamePlan & {
  updatedAt: number
  /** Public pages to regenerate. */
  paths: string[]
  warnings: string[]
}

export type RenameFailure = { ok: false; status: 400 | 404 | 409 | 500; code: string; error: string }

const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/
/** New slugs: the editor's limit (components/Admin/shell/publishChecks SLUG_MAX). */
export const RENAME_SLUG_MAX = 64

/** Hosts whose absolute URLs count as internal links (canonical + configured public hosts). */
export function siteHosts(): string[] {
  const out = new Set<string>([SITE_HOST.toLowerCase()])
  for (const v of getConfiguredSiteValues()) {
    const h = hostnameOf(v)
    if (h && !isLocalHostname(h)) out.add(h)
  }
  return Array.from(out)
}

const titleOf = (fm: Record<string, unknown> | undefined, fallback: string) =>
  typeof fm?.title === 'string' && fm.title.trim() ? fm.title.trim() : fallback

type DocChange = {
  target: RewriteTarget
  apply: () => Promise<string | null>
  paths: string[]
}

/**
 * Every document that links the old address, with how to rewrite it. Run
 * after the move, the renamed item itself is found at its new slug, so its
 * own links to its old address are updated too.
 */
async function collectChanges(req: RenameRequest, hosts: string[]): Promise<DocChange[]> {
  const { collection, from, to } = req
  const linkC: LinkCollection = collection
  const changes: DocChange[] = []

  for (const c of ['blog', 'work'] as const) {
    const pending = new Map(listPendingRevisions(c).map((p) => [p.slug, p]))
    for (const item of listItems(c)) {
      const slug = item.slug
      const live = rewriteDocument({ frontmatter: item.frontmatter, body: item.body }, linkC, from, to, hosts)
      const rev = pending.get(slug)
      const pend = rev ? rewriteDocument({ frontmatter: rev.frontmatter, body: rev.body }, linkC, from, to, hosts) : null
      const links = live.count + (pend?.count ?? 0)
      if (!links) continue
      changes.push({
        target: { kind: c, ref: slug, title: titleOf(item.frontmatter, slug), links },
        paths: [`/${c}/${slug}`],
        apply: async () => {
          const { writeOne } = await import('./mdx-admin')
          let warning: string | null = null
          const before = getItem(c, slug)?.updated_at ?? 0
          if (live.count) {
            const result = await writeOne(c, slug, live.value.frontmatter as Record<string, any>, live.value.body)
            if (!result.ok) return `could not update links in ${c}/${slug}: ${result.error}`
            if ('r2Warning' in result && result.r2Warning) warning = result.r2Warning
          }
          // The unpublished changes get the same links, and keep counting as
          // based on the live version when they were before.
          const current = getPendingRevision(c, slug)
          if (current) {
            const base = rebasedPendingBase(current.baseUpdatedAt, before, getItem(c, slug)?.updated_at ?? 0)
            const doc = pend && pend.count ? pend.value : { frontmatter: current.frontmatter, body: current.body }
            if ((pend && pend.count) || base !== current.baseUpdatedAt) {
              putPendingRevision(c, slug, doc.frontmatter as Record<string, any>, doc.body, base)
            }
          }
          return warning
        },
      })
    }
  }

  const { readPage, writePage } = await import('./mdx-admin')
  for (const name of PAGE_NAMES) {
    const page = readPage(name)
    if (!page.updatedAt && !page.body) continue
    const r = rewriteDocument({ frontmatter: page.frontmatter, body: page.body }, linkC, from, to, hosts)
    if (!r.count) continue
    const publicPath = pagePublicPath(name)
    changes.push({
      target: { kind: 'page', ref: name, title: publicPath, links: r.count },
      paths: pageRevalidatePaths(name),
      apply: async () => {
        const result = await writePage(name, r.value.frontmatter as Record<string, any>, r.value.body)
        return result.ok ? ('r2Warning' in result && result.r2Warning ? result.r2Warning : null) : `could not update links on ${publicPath}: ${result.error}`
      },
    })
  }

  const { readCvData, saveSnapshot, writeCvData } = await import('./cvdata')
  const cv = rewriteJsonLinks(readCvData(), linkC, from, to, hosts)
  if (cv.count) {
    changes.push({
      target: { kind: 'cv', ref: 'cv', title: 'CV', links: cv.count },
      paths: [...CV_PAGE_PATHS],
      apply: async () => {
        saveSnapshot()
        const result = await writeCvData(cv.value)
        return result.ok ? result.r2Warning ?? null : `could not update links in the CV: ${result.error}`
      },
    })
  }

  const { readHome, saveHomeSnapshot, writeHome } = await import('./home')
  const homeDoc = readHome()
  if (homeDoc) {
    const home = rewriteJsonLinks(homeDoc, linkC, from, to, hosts, [])
    if (home.count) {
      changes.push({
        target: { kind: 'home', ref: 'home', title: 'Home page', links: home.count },
        paths: [...HOME_PAGE_PATHS],
        apply: async () => {
          saveHomeSnapshot()
          const result = await writeHome(home.value)
          return result.ok ? result.r2Warning ?? null : `could not update links on the home page: ${result.error}`
        },
      })
    }
  }
  return changes
}

/** Why a rename cannot happen, or null. */
async function refusal(req: RenameRequest): Promise<RenameFailure | null> {
  const { collection, from, to } = req
  if (!SLUG_RE.test(from) || from.length > 128) return { ok: false, status: 400, code: 'INVALID_SLUG', error: 'Invalid slug' }
  if (!SLUG_RE.test(to) || to.length > RENAME_SLUG_MAX) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SLUG',
      error: `The new slug must start with a–z or 0–9 and use only a–z, 0–9, - and _ (at most ${RENAME_SLUG_MAX})`,
    }
  }
  if (from === to) return { ok: false, status: 400, code: 'SAME_SLUG', error: 'The new slug is the current one' }
  if (!getItem(collection, from)) return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Not found' }
  if (getItem(collection, to)) return { ok: false, status: 409, code: 'SLUG_EXISTS', error: `“${to}” is already taken` }
  const { hasItemSnapshots } = await import('./mdx-admin')
  if (hasItemSnapshots(collection, to)) {
    return {
      ok: false,
      status: 409,
      code: 'SLUG_HAS_HISTORY',
      error: `“${to}” belonged to a deleted ${collection === 'blog' ? 'post' : 'case study'} whose history is still kept — pick another slug`,
    }
  }
  return null
}

/** The slug the new address redirects to today (other than the item being renamed), or null. */
function takenOverRedirect(req: RenameRequest): string | null {
  const target = redirectTarget(req.collection, req.to)
  return target && target !== req.from ? target : null
}

/** Dry run: what renaming would rewrite (nothing is written). */
export async function planRename(req: RenameRequest): Promise<RenamePlan | RenameFailure> {
  const refused = await refusal(req)
  if (refused) return refused
  const changes = await collectChanges(req, siteHosts())
  return {
    ok: true,
    rewrites: changes.map((c) => c.target),
    links: changes.reduce((n, c) => n + c.target.links, 0),
    takesOverRedirectTo: takenOverRedirect(req),
  }
}

/** Rename the item, keep a redirect, rewrite the internal links. */
export async function renameSlug(req: RenameRequest): Promise<RenameOutcome | RenameFailure> {
  const refused = await refusal(req)
  if (refused) return refused
  const { collection, from, to } = req
  const keep = req.redirect !== false
  const hosts = siteHosts()
  const takesOverRedirectTo = takenOverRedirect(req)
  const source = getItem(collection, from)
  const sourceAt = source ? Math.trunc(source.updated_at) : 0
  const project = collection === 'blog' && typeof source?.frontmatter?.project === 'string' ? source.frontmatter.project.trim() : ''

  const moved = await renameItem(collection, from, to, {
    inTransaction: () => {
      applyRename(collection, from, to, keep)
      movePendingRevision(collection, from, to, sourceAt, Math.trunc(getItemFromDb(collection, to)?.updated_at ?? 0))
    },
  })
  if (!moved.ok) {
    const status = moved.code === 'NOT_FOUND' ? 404 : moved.code === 'SLUG_EXISTS' ? 409 : 500
    return { ok: false, status, code: moved.code, error: moved.error }
  }
  const warnings: string[] = []
  if (moved.r2Warning) warnings.push(moved.r2Warning)
  const { moveItemSnapshots } = await import('./mdx-admin')
  moveItemSnapshots(collection, from, to)

  const changes = await collectChanges(req, hosts)
  const paths = new Set<string>([
    ...collectionPaths(collection, to, listItems(collection).map((i) => i.slug)),
    `/${collection}/${from}`,
    ...COLLECTION_EXTRA_PATHS[collection],
    ...CV_DOCUMENT_PATHS,
  ])
  // A post names its case study, and the case study lists the post: both directions refresh.
  if (project && SLUG_RE.test(project)) paths.add(`/work/${project}`)
  if (collection === 'work') paths.add('/blog')
  for (const change of changes) {
    try {
      const warning = await change.apply()
      if (warning) warnings.push(warning)
      change.paths.forEach((p) => paths.add(p))
    } catch (err) {
      log.error('rename: rewriting a link failed', { err, target: change.target })
      warnings.push(`could not update links in ${change.target.title}`)
    }
  }
  const updated = getItem(collection, to)
  return {
    ok: true,
    updatedAt: updated ? Math.trunc(updated.updated_at) : moved.updatedAt,
    rewrites: changes.map((c) => c.target),
    links: changes.reduce((n, c) => n + c.target.links, 0),
    takesOverRedirectTo,
    paths: Array.from(paths),
    warnings,
  }
}
