import { log } from '../log'
import { getItem, listItems } from '../contentStore'
import { getPendingRevision, listPendingRevisions, putPendingRevision, rebasedPendingBase } from '../pendingRevisions'
import { COLLECTION_EXTRA_PATHS, CV_PAGE_PATHS, HOME_PAGE_PATHS, collectionPaths, pageRevalidatePaths } from '../revalidate'
import { pageFixedLang } from '../pageNames'
import { detectContentLang } from '../toc'
import { pageDocTitle } from './usage'

/**
 * Rewriting stored documents for the media library (H7) — SERVER-ONLY.
 * "Replace file" points every reference at the new file; "Use the default
 * alt text" fills in missing alt texts. Both go through here, the way a
 * save does: posts and case studies (the live version and the unpublished
 * changes, which stay based on the live version when they were), the /now,
 * /uses and /about pages (English and Chinese bios), the CV and the home
 * page — each snapshotted first (the activity log links the snapshots to the
 * change) — and say which public pages to regenerate.
 *
 * Like every other write path (the editors' PUT, content-health fixes,
 * scheduled publishing), a rewritten post, case-study or page body must
 * still compile with the public renderer (lib/mdx-admin mdxProblem): a
 * document that would not is left exactly as it is and reported in
 * `skipped`, so one image can never take a page, the feeds or the Markdown
 * twins down behind a success message.
 */

export type MdxDoc = { frontmatter: Record<string, unknown>; body: string }
export type Rewrite<T> = { value: T; count: number }
/** `lang`: the document's language (frontmatter `lang`, else detected — lib/toc). */
export type MdxTransform = (doc: MdxDoc, ctx: { lang: string }) => Rewrite<MdxDoc>
export type JsonTransform = (value: unknown) => Rewrite<unknown>

export type RewrittenDoc = { kind: 'post' | 'work' | 'page' | 'cv' | 'home'; ref: string; title: string; references: number }
/** A document left unchanged, and why (shown to the owner). */
export type SkippedDoc = RewrittenDoc & { reason: string }

type Applied = { ok: true; warning: string | null } | { ok: false; error: string }
/** `bodies`: the MDX bodies the change would store (checked before anything is written). */
type DocChange = { target: RewrittenDoc; paths: string[]; bodies: string[]; apply: () => Promise<Applied> }

const titleOf = (fm: Record<string, unknown> | undefined, fallback: string) =>
  typeof fm?.title === 'string' && fm.title.trim() ? fm.title.trim() : fallback

const langOf = (doc: MdxDoc, fixed: string | null = null) =>
  detectContentLang({ lang: doc.frontmatter?.lang || fixed || undefined, title: doc.frontmatter?.title, body: doc.body })

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
        bodies: [...(live.count ? [live.value.body] : []), ...(pend && pend.count ? [pend.value.body] : [])],
        apply: async () => {
          const { writeOne } = await import('../mdx-admin')
          let warning: string | null = null
          const before = getItem(c, slug)?.updated_at ?? 0
          if (live.count) {
            const result = await writeOne(c, slug, live.value.frontmatter as Record<string, any>, live.value.body)
            if (!result.ok) return { ok: false, error: `could not update ${c}/${slug}: ${result.error}` }
            if ('r2Warning' in result && result.r2Warning) warning = result.r2Warning
          }
          const current = getPendingRevision(c, slug)
          if (current) {
            const base = rebasedPendingBase(current.baseUpdatedAt, before, getItem(c, slug)?.updated_at ?? 0)
            const doc = pend && pend.count ? pend.value : { frontmatter: current.frontmatter, body: current.body }
            if ((pend && pend.count) || base !== current.baseUpdatedAt) putPendingRevision(c, slug, doc.frontmatter as Record<string, any>, doc.body, base)
          }
          return { ok: true, warning }
        },
      })
    }
  }

  const { PAGE_NAMES, readPage, writePage } = await import('../mdx-admin')
  for (const name of PAGE_NAMES) {
    const page = readPage(name)
    if (!page.updatedAt && !page.body) continue
    const doc = { frontmatter: page.frontmatter as Record<string, unknown>, body: page.body }
    // The Chinese bio is Chinese by its name, whatever its text looks like (lib/mdx getStaticMdxPage).
    const r = mdx(doc, { lang: langOf(doc, pageFixedLang(name)) })
    if (!r.count) continue
    const title = pageDocTitle(name)
    changes.push({
      target: { kind: 'page', ref: name, title, references: r.count },
      // Where it is public (/zh/about for the Chinese bio) and the pages that depend on it, like a save.
      paths: pageRevalidatePaths(name),
      bodies: [r.value.body],
      apply: async () => {
        const result = await writePage(name, r.value.frontmatter as Record<string, any>, r.value.body)
        if (!result.ok) return { ok: false, error: `could not update ${title}: ${result.error}` }
        return { ok: true, warning: 'r2Warning' in result && result.r2Warning ? result.r2Warning : null }
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
        bodies: [],
        apply: async () => {
          saveSnapshot()
          const result = await writeCvData(cv.value as Parameters<typeof writeCvData>[0])
          return result.ok ? { ok: true, warning: result.r2Warning ?? null } : { ok: false, error: `could not update the CV: ${result.error}` }
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
          bodies: [],
          apply: async () => {
            saveHomeSnapshot()
            const result = await writeHome(home.value as Parameters<typeof writeHome>[0])
            return result.ok ? { ok: true, warning: result.r2Warning ?? null } : { ok: false, error: `could not update the home page: ${result.error}` }
          },
        })
      }
    }
  }
  return changes
}

export type RewriteRun = {
  /** The documents rewritten. */
  rewrites: RewrittenDoc[]
  paths: string[]
  warnings: string[]
  /** The documents left unchanged because a rewritten body would no longer compile. */
  skipped: SkippedDoc[]
}

/**
 * Rewrite every document `mdx` (and the CV / home transforms) change; never
 * throws per document. A document whose rewritten body would not compile is
 * skipped (nothing of it is written) and listed in `skipped`.
 */
export async function rewriteDocuments(mdx: MdxTransform, json: { cv?: JsonTransform; home?: JsonTransform } = {}): Promise<RewriteRun> {
  const changes = await collect(mdx, json)
  const { mdxProblem } = await import('../mdx-admin')
  const paths = new Set<string>()
  const warnings: string[] = []
  const rewrites: RewrittenDoc[] = []
  const skipped: SkippedDoc[] = []
  for (const change of changes) {
    try {
      let problem: string | null = null
      for (const body of change.bodies) {
        const p = await mdxProblem(body)
        if (p) {
          problem = p.error
          break
        }
      }
      if (problem) {
        log.warn('media: a document was left unchanged, its new text would not compile', { target: change.target, problem })
        skipped.push({ ...change.target, reason: problem })
        continue
      }
      const out = await change.apply()
      if (!out.ok) {
        warnings.push(out.error)
        continue
      }
      if (out.warning) warnings.push(out.warning)
      rewrites.push(change.target)
      change.paths.forEach((p) => paths.add(p))
    } catch (err) {
      log.error('media: updating a document failed', { err, target: change.target })
      warnings.push(`could not update ${change.target.title}`)
    }
  }
  return { rewrites, paths: Array.from(paths), warnings, skipped }
}
