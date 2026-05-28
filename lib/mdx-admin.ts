import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

/**
 * Admin-only filesystem operations for MDX collections.
 *
 * Reads + writes content/blog/*.mdx and content/work/*.mdx with the same
 * slug regex as the public loader (`[a-z0-9][a-z0-9-_]*`).
 *
 * All slug + collection inputs are sanitised — the writer never touches a
 * path that escapes the content directory.
 *
 * Snapshot strategy (mirrors cvdata.ts / home.ts):
 *   On every write/delete, the old file (if any) is copied to
 *   data/{collection}_snapshots/{slug}_{ISO timestamp}.mdx so the admin
 *   version-history page can offer rollback later.
 */

const CONTENT_DIR = path.join(process.cwd(), 'content')
const SNAPSHOT_DIR = path.join(process.cwd(), 'data')
const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/

export type Collection = 'blog' | 'work'

function collectionDir(c: Collection): string {
  return path.join(CONTENT_DIR, c)
}

function snapshotDir(c: Collection): string {
  return path.join(SNAPSHOT_DIR, `${c}_snapshots`)
}

function isSafeSlug(slug: string): boolean {
  return SLUG_RE.test(slug)
}

function filePath(c: Collection, slug: string): string {
  return path.join(collectionDir(c), `${slug}.mdx`)
}

export function listAll(c: Collection): Array<{
  slug: string
  frontmatter: Record<string, any>
  size: number
  mtime: number
}> {
  const dir = collectionDir(c)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx') && !f.startsWith('.'))
    .map((f) => {
      const slug = f.replace(/\.mdx$/, '')
      const fp = path.join(dir, f)
      const stat = fs.statSync(fp)
      const raw = fs.readFileSync(fp, 'utf-8')
      const { data } = matter(raw)
      return { slug, frontmatter: data, size: stat.size, mtime: stat.mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

export function readOne(c: Collection, slug: string): {
  slug: string
  frontmatter: Record<string, any>
  body: string
} | null {
  if (!isSafeSlug(slug)) return null
  const fp = filePath(c, slug)
  if (!fs.existsSync(fp)) return null
  const raw = fs.readFileSync(fp, 'utf-8')
  const { data, content } = matter(raw)
  return { slug, frontmatter: data, body: content }
}

function snapshot(c: Collection, slug: string) {
  const fp = filePath(c, slug)
  if (!fs.existsSync(fp)) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const snapDir = snapshotDir(c)
  fs.mkdirSync(snapDir, { recursive: true })
  fs.copyFileSync(fp, path.join(snapDir, `${slug}_${stamp}.mdx`))
}

export function writeOne(
  c: Collection,
  slug: string,
  frontmatter: Record<string, any>,
  body: string,
): { ok: true } | { ok: false; error: string } {
  if (!isSafeSlug(slug)) return { ok: false, error: 'Invalid slug (use a-z, 0-9, -, _)' }
  fs.mkdirSync(collectionDir(c), { recursive: true })
  snapshot(c, slug)
  const yaml = matter.stringify(body || '\n', frontmatter)
  fs.writeFileSync(filePath(c, slug), yaml, 'utf-8')
  return { ok: true }
}

export function deleteOne(c: Collection, slug: string): boolean {
  if (!isSafeSlug(slug)) return false
  const fp = filePath(c, slug)
  if (!fs.existsSync(fp)) return false
  snapshot(c, slug) // keep last copy in snapshots before delete
  fs.unlinkSync(fp)
  return true
}
