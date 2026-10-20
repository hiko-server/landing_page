import { log } from '../log'
import { getItem, listItems } from '../contentStore'
import { getPendingRevision, listPendingRevisions, putPendingRevision, rebasedPendingBase } from '../pendingRevisions'
import { COLLECTION_EXTRA_PATHS, CV_PAGE_PATHS, HOME_PAGE_PATHS, collectionPaths } from '../revalidate'
import { detectContentLang } from '../toc'

/**
 * Rewriting stored documents for the media library (H7) — SERVER-ONLY.
 * "Replace file" points every reference at the new file; "Use the default
 * alt text" fills in missing alt texts. Both go through here, the way a
 * save does: posts and case studies (the live version and the unpublished
 * changes, which stay based on the live version when they were), the /now,
 * /uses and /about pages, the CV and the home page — each snapshotted first
 * (the activity log links the snapshots to the change) — and say which
 * public pages to regenerate.
 */

export type MdxDoc = { frontmatter: Record<string, unknown>; body: string }
export type Rewrite<T> = { value: T; count: number }
/** `lang`: the document's language (frontmatter `lang`, else detected — lib/toc). */
export type MdxTransform = (doc: MdxDoc, ctx: { lang: string }) => Rewrite<MdxDoc>
export type JsonTransform = (value: unknown) => Rewrite<unknown>

export type RewrittenDoc = { kind: 'post' | 'work' | 'page' | 'cv' | 'home'; ref: string; title: string; references: number }

type DocChange = { target: RewrittenDoc; paths: string[]; apply: () => Promise<string | null> }

const titleOf = (fm: Record<string, unknown> | undefined, fallback: string) =>
  typeof fm?.title === 'string' && fm.title.trim() ? fm.title.trim() : fallback

const langOf = (doc: MdxDoc) => detectContentLang({ lang: doc.frontmatter?.lang, title: doc.frontmatter?.title, body: doc.body })

async function collect(mdx: MdxTransform, json: { cv?: JsonTransform; home?: JsonTransform }): Promise<DocChange[]> {
  const changes: DocChange[] = []
  for (const c of ['blog', 'work'] as const) {
    const pending = new Map(listPendingRevisions(c).map((p) => [p.slug, p]))
    for (const item of listItems(c)) {
      const slug = item.slug
      const liveDoc = { frontmatter: item.frontmatter as Record<string, unknown>, body: item.body }
      const live = mdx(liveDoc, { lang: langOf(liveDoc) })
      const rev = pending.get(slug)
      const revDoc = rev ? { frontmatter: rev.frontmatter as Record<string, unknown>, body: rev.body } : null
      const pend = revDoc ? mdx(revDoc, { lang: langOf(revDoc) }) : null
      const references = live.count + (pend?.count ?? 0)
      if (!references) continue
      const draft = !!item.frontmatter?.draft
      changes.push({
        target: { kind: c === 'blog' ? 'post' : 'work', ref: slug, title: titleOf(item.frontmatter, slug), references },
        // A live item's page, its collection index and the pages that list it; a draft has none.
        paths: draft || !live.count ? [] : [...collectionPaths(c, slug), ...COLLECTION_EXTRA_PATHS[c]],
        apply: async () => {
          const { writeOne } = await import('../mdx-admin')
          let warning: string | null = null
          const before = getItem(c, slug)?.updated_at ?? 0
          if (live.count) {
            const result = await writeOne(c, slug, live.value.frontmatter as Record<string, any>, live.value.body)
            if (!result.ok) return `could not update ${c}/${slug}: ${result.error}`
            if ('r2Warning' in result && result.r2Warning) warning = result.r2Warning
          }
          const current = getPendingRevision(c, slug)
          if (current) {
            const base = rebasedPendingBase(current.baseUpdatedAt, before, getItem(c, slug)?.updated_at ?? 0)
            const doc = pend && pend.count ? pend.value : { frontmatter: current.frontmatter, body: current.body }
            if ((pend && pend.count) || base !== current.baseUpdatedAt) putPendingRevision(c, slug, doc.frontmatter as Record<string, any>, doc.body, base)
          }
          return warning
        },
      })
    }
  }

  const { PAGE_NAMES, readPage, writePage } = await import('../mdx-admin')
  for (const name of PAGE_NAMES) {
    const page = readPage(name)
    if (!page.updatedAt && !page.body) continue
    const doc = { frontmatter: page.frontmatter as Record<string, unknown>, body: page.body }
    const r = mdx(doc, { lang: langOf(doc) })
    if (!r.count) continue
    changes.push({
      target: { kind: 'page', ref: name, title: name === 'about' ? 'About bio' : `/${name}`, references: r.count },
      paths: [`/${name}`],
      apply: async () => {
        const result = await writePage(name, r.value.frontmatter as Record<string, any>, r.value.body)
        return result.ok ? ('r2Warning' in result && result.r2Warning ? result.r2Warning : null) : `could not update /${name}: ${result.error}`
      },
    })
  }

  if (json.cv) {
    const { readCvData, saveSnapshot, writeCvData } = await import('../cvdata')
    const cv = json.cv(readCvData())
    if (cv.count) {
      changes.push({
        target: { kind: 'cv', ref: 'cv', title: 'CV', references: cv.count },
        paths: [...CV_PAGE_PATHS],
        apply: async () => {
          saveSnapshot()
          const result = await writeCvData(cv.value as Parameters<typeof writeCvData>[0])
          return result.ok ? result.r2Warning ?? null : `could not update the CV: ${result.error}`
        },
      })
    }
  }

  if (json.home) {
    const { readHome, saveHomeSnapshot, writeHome } = await import('../home')
    const homeDoc = readHome()
    if (homeDoc) {
      const home = json.home(homeDoc)
      if (home.count) {
        changes.push({
          target: { kind: 'home', ref: 'home', title: 'Home page', references: home.count },
          paths: [...HOME_PAGE_PATHS],
          apply: async () => {
            saveHomeSnapshot()
            const result = await writeHome(home.value as Parameters<typeof writeHome>[0])
            return result.ok ? result.r2Warning ?? null : `could not update the home page: ${result.error}`
          },
        })
      }
    }
  }
  return changes
}

export type RewriteRun = { rewrites: RewrittenDoc[]; paths: string[]; warnings: string[] }

/** Rewrite every document `mdx` (and the CV / home transforms) change; never throws per document. */
export async function rewriteDocuments(mdx: MdxTransform, json: { cv?: JsonTransform; home?: JsonTransform } = {}): Promise<RewriteRun> {
  const changes = await collect(mdx, json)
  const paths = new Set<string>()
  const warnings: string[] = []
  for (const change of changes) {
    try {
      const warning = await change.apply()
      if (warning) warnings.push(warning)
      change.paths.forEach((p) => paths.add(p))
    } catch (err) {
      log.error('media: updating a document failed', { err, target: change.target })
      warnings.push(`could not update ${change.target.title}`)
    }
  }
  return { rewrites: changes.map((c) => c.target), paths: Array.from(paths), warnings }
}
