import { getItem, listItems } from './contentStore'
import { getPendingRevision, listPendingRevisions, putPendingRevision, rebasedPendingBase } from './pendingRevisions'
import { COLLECTION_EXTRA_PATHS, CV_DOCUMENT_PATHS, collectionPaths } from './revalidate'
import { TAG_FIELD, retagList, tagInventory, tagNameProblem, tagsOf, type TagCollection, type TagEntry } from './tagAdmin'
import { tagSlug } from './tagFilter'
import { log } from './log'

/**
 * Tag rename / merge across posts or case studies (H16) — the store side of
 * lib/tagAdmin. Every changed item is written through lib/mdx-admin
 * writeOne (a history snapshot first, the R2 mirror, the same as a save
 * from the editor); an item's unpublished changes (H4) get the same tags, so
 * publishing them later never brings an old tag back. Server-only.
 */

export type TagChangeRequest = {
  collection: TagCollection
  /** Slugs of the tags to rename (one) or merge (several). */
  from: string[]
  /** The new name. */
  to: string
}

export type TagChangeItem = { slug: string; title: string; before: string[]; after: string[]; pendingOnly: boolean }

export type TagChangePlan = { ok: true; items: TagChangeItem[]; mergesInto: string | null }
export type TagChangeOutcome = TagChangePlan & { paths: string[]; warnings: string[] }
export type TagChangeFailure = { ok: false; status: 400; error: string }

const titleOf = (fm: Record<string, unknown> | undefined, slug: string) =>
  typeof fm?.title === 'string' && fm.title.trim() ? fm.title.trim() : slug

/** The tag inventory of a collection: live items plus their unpublished changes. */
export function readTagInventory(collection: TagCollection): TagEntry[] {
  const field = TAG_FIELD[collection]
  const pending = new Map(listPendingRevisions(collection).map((p) => [p.slug, p]))
  return tagInventory(
    listItems(collection).map((item) => ({
      slug: item.slug,
      title: titleOf(item.frontmatter, item.slug),
      tags: tagsOf(item.frontmatter?.[field]),
      draft: !!item.frontmatter?.draft,
      pendingTags: pending.has(item.slug) ? tagsOf(pending.get(item.slug)?.frontmatter?.[field]) : null,
    })),
  )
}

function validate(req: TagChangeRequest): TagChangeFailure | null {
  if (req.collection !== 'blog' && req.collection !== 'work') return { ok: false, status: 400, error: 'collection must be "blog" or "work"' }
  if (!Array.isArray(req.from) || !req.from.length || req.from.length > 50 || req.from.some((s) => typeof s !== 'string' || !s || s !== tagSlug(s))) {
    return { ok: false, status: 400, error: 'from must list the slugs of the tags to change' }
  }
  const problem = tagNameProblem(typeof req.to === 'string' ? req.to : '')
  if (problem) return { ok: false, status: 400, error: problem }
  return null
}

/** Which items change, and how (nothing is written). */
export function planTagChange(req: TagChangeRequest): TagChangePlan | TagChangeFailure {
  const invalid = validate(req)
  if (invalid) return invalid
  const field = TAG_FIELD[req.collection]
  const from = new Set(req.from)
  const target = tagSlug(req.to)
  const pending = new Map(listPendingRevisions(req.collection).map((p) => [p.slug, p]))
  const items: TagChangeItem[] = []
  let existsElsewhere = false
  for (const item of listItems(req.collection)) {
    const live = tagsOf(item.frontmatter?.[field])
    const rev = pending.get(item.slug)
    const pend = rev ? tagsOf(rev.frontmatter?.[field]) : null
    if (!from.has(target) && [...live, ...(pend || [])].some((t) => tagSlug(t) === target)) existsElsewhere = true
    const a = retagList(live, from, req.to)
    const b = pend ? retagList(pend, from, req.to) : null
    if (!a.changed && !b?.changed) continue
    items.push({
      slug: item.slug,
      title: titleOf(item.frontmatter, item.slug),
      before: a.changed ? live : pend || live,
      after: a.changed ? a.list : b?.list || live,
      pendingOnly: !a.changed,
    })
  }
  items.sort((a, b) => a.title.localeCompare(b.title, 'en') || a.slug.localeCompare(b.slug, 'en'))
  // Renaming into a tag that already exists (and is not one of those renamed) merges into it.
  return { ok: true, items, mergesInto: existsElsewhere ? target : null }
}

/** Rename / merge: write every changed item (snapshot first) and its unpublished changes. */
export async function applyTagChange(req: TagChangeRequest): Promise<TagChangeOutcome | TagChangeFailure> {
  const plan = planTagChange(req)
  if (!plan.ok) return plan
  const { writeOne } = await import('./mdx-admin')
  const field = TAG_FIELD[req.collection]
  const from = new Set(req.from)
  const warnings: string[] = []
  const done: TagChangeItem[] = []
  for (const change of plan.items) {
    try {
      const item = getItem(req.collection, change.slug)
      if (!item) continue
      const before = Math.trunc(item.updated_at)
      const live = retagList(tagsOf(item.frontmatter?.[field]), from, req.to)
      if (live.changed) {
        const result = await writeOne(req.collection, change.slug, { ...item.frontmatter, [field]: live.list.length ? live.list : undefined }, item.body)
        if (!result.ok) {
          warnings.push(`${change.title}: ${result.error}`)
          continue
        }
        if ('r2Warning' in result && result.r2Warning) warnings.push(result.r2Warning)
      }
      const rev = getPendingRevision(req.collection, change.slug)
      if (rev) {
        const pend = retagList(tagsOf(rev.frontmatter?.[field]), from, req.to)
        const base = rebasedPendingBase(rev.baseUpdatedAt, before, Math.trunc(getItem(req.collection, change.slug)?.updated_at ?? 0))
        if (pend.changed || base !== rev.baseUpdatedAt) {
          const frontmatter = pend.changed ? { ...rev.frontmatter, [field]: pend.list.length ? pend.list : undefined } : rev.frontmatter
          putPendingRevision(req.collection, change.slug, frontmatter, rev.body, base)
        }
      }
      done.push(change)
    } catch (err) {
      log.error('tag change failed on an item', { err, collection: req.collection, slug: change.slug })
      warnings.push(`${change.title}: not updated`)
    }
  }
  // Tags feed the related-reading links of every post and case study, the
  // /blog and /work filters, the home page and the CV's skill evidence.
  const paths = new Set<string>([
    ...collectionPaths('blog', undefined, listItems('blog').map((i) => i.slug)),
    ...collectionPaths('work', undefined, listItems('work').map((i) => i.slug)),
    ...COLLECTION_EXTRA_PATHS.blog,
    ...COLLECTION_EXTRA_PATHS.work,
    ...CV_DOCUMENT_PATHS,
  ])
  return { ok: true, items: done, mergesInto: plan.mergesInto, paths: done.length ? Array.from(paths) : [], warnings }
}
