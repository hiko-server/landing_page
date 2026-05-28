import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import {
  getPage,
  putPage as storePutPage,
  listItems,
  getItem,
  putItem as storePutItem,
  removeItem,
  type StoreError,
} from './contentStore'

/**
 * Admin-only operations for MDX collections.
 *
 * Backed by the dual-write content store (SQLite + Cloudflare R2). Legacy
 * filesystem (content/*.mdx) is auto-seeded into the DB on first read and
 * is no longer mutated by admin writes — operators manage the canonical
 * copy through the DB/R2 pair, with the migration scripts as the bridge.
 *
 * Snapshot strategy:
 *   On every write/delete, the current DB record (if any) is serialised to
 *   data/{collection}_snapshots/{slug}_{ISO timestamp}.mdx so the admin
 *   version-history view can offer rollback. Snapshots remain on disk and
 *   are picked up by the existing /api/mongo backup.
 */

const SNAPSHOT_DIR = path.join(process.cwd(), 'data')
const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/

export type Collection = 'blog' | 'work'

function snapshotDir(c: Collection): string {
  return path.join(SNAPSHOT_DIR, `${c}_snapshots`)
}

function isSafeSlug(slug: string): boolean {
  return SLUG_RE.test(slug)
}

export function listAll(c: Collection): Array<{
  slug: string
  frontmatter: Record<string, any>
  size: number
  mtime: number
}> {
  return listItems(c).map((item) => {
    const yaml = matter.stringify(item.body || '\n', item.frontmatter)
    return {
      slug: item.slug,
      frontmatter: item.frontmatter,
      size: Buffer.byteLength(yaml, 'utf-8'),
      mtime: item.updated_at,
    }
  })
}

export function readOne(c: Collection, slug: string): {
  slug: string
  frontmatter: Record<string, any>
  body: string
} | null {
  if (!isSafeSlug(slug)) return null
  const item = getItem(c, slug)
  if (!item) return null
  return { slug: item.slug, frontmatter: item.frontmatter, body: item.body }
}

function snapshot(c: Collection, slug: string) {
  const existing = getItem(c, slug)
  if (!existing) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const snapDir = snapshotDir(c)
  fs.mkdirSync(snapDir, { recursive: true })
  const yaml = matter.stringify(existing.body || '\n', existing.frontmatter)
  fs.writeFileSync(path.join(snapDir, `${slug}_${stamp}.mdx`), yaml, 'utf-8')
}

export async function writeOne(
  c: Collection,
  slug: string,
  frontmatter: Record<string, any>,
  body: string,
): Promise<StoreError> {
  if (!isSafeSlug(slug)) return { ok: false, error: 'Invalid slug (use a-z, 0-9, -, _)' }
  snapshot(c, slug)
  return await storePutItem(c, slug, frontmatter, body)
}

export async function deleteOne(
  c: Collection,
  slug: string,
): Promise<StoreError | { ok: false; error: string }> {
  if (!isSafeSlug(slug)) return { ok: false, error: 'Invalid slug' }
  const existing = getItem(c, slug)
  if (!existing) return { ok: false, error: 'Not found' }
  snapshot(c, slug)
  return await removeItem(c, slug)
}

/**
 * Single-file MDX pages — content-store backed (no direct file IO).
 */
export type PageName = 'now' | 'uses'

const PAGE_NAMES: ReadonlyArray<PageName> = ['now', 'uses']

function pageSnapshotDir(): string {
  return path.join(SNAPSHOT_DIR, 'page_snapshots')
}

export function isPageName(value: unknown): value is PageName {
  return typeof value === 'string' && (PAGE_NAMES as ReadonlyArray<string>).includes(value)
}

export function readPage(name: PageName): {
  name: PageName
  frontmatter: Record<string, any>
  body: string
} {
  const page = getPage(name)
  if (!page) return { name, frontmatter: {}, body: '' }
  return { name, frontmatter: page.frontmatter, body: page.body }
}

function snapshotPage(name: PageName) {
  const existing = getPage(name)
  if (!existing) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const snapDir = pageSnapshotDir()
  fs.mkdirSync(snapDir, { recursive: true })
  const yaml = matter.stringify(existing.body || '\n', existing.frontmatter)
  fs.writeFileSync(path.join(snapDir, `${name}_${stamp}.mdx`), yaml, 'utf-8')
}

export async function writePage(
  name: PageName,
  frontmatter: Record<string, any>,
  body: string,
): Promise<StoreError> {
  if (!isPageName(name)) return { ok: false, error: 'Invalid page name' }
  snapshotPage(name)
  return await storePutPage(name, frontmatter, body)
}
