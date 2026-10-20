import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { uploadNameOf, uploadNamesIn } from './uploadVariants'
import { buildZip, type ZipEntry } from './zip'

/**
 * The content export (H16): one .zip with everything the owner wrote, in
 * portable formats —
 *
 *   README.txt                         what is inside
 *   manifest.json                      date, counts, file list
 *   blog/<slug>.mdx                    every post (drafts too), YAML frontmatter + MDX body
 *   work/<slug>.mdx                    every case study
 *   unpublished-changes/<c>/<slug>.mdx saved changes of live items not published yet (H4)
 *   pages/<now|uses|about>.mdx         the single pages that have content
 *   cv.json                            the full CV { en, zh } as CV Studio edits it
 *   home.json                          the home page document
 *   redirects.json                     old addresses of renamed items (H6)
 *   images.json                        every image the content uses (uploads and
 *                                      external URLs) with the files that use it,
 *                                      plus uploads nothing uses
 *
 * Image files are not inside (they can be large); the full-site snapshots
 * under Storage & backups carry them. Built on request by
 * /api/admin/export, served no-store. The pure helpers are unit-tested;
 * buildContentExport() reads the store (server-only).
 */

export type ImageRef = {
  url: string
  kind: 'upload' | 'external'
  /** The upload's stored size (bytes), when it is on disk. */
  bytes?: number
  /** The upload is referenced but not on disk. */
  missing?: boolean
  /** Export paths of the documents that use it (empty: an upload nothing uses). */
  usedIn: string[]
}

const MD_IMAGE_RE = /!\[[^\]]*\]\(\s*<?([^\s)>]+)/g
const ATTR_RE = /\b(?:src|poster)\s*=\s*\{?\s*["']([^"']+)["']/g
const IMAGE_URL_RE = /^(?:https?:)?\/\/\S+\.(?:png|jpe?g|webp|gif|avif|svg)(?:[?#]\S*)?$/i

/** An image URL worth listing ("/uploads/x.png", "https://…/y.jpg"), normalised; '' otherwise. */
export function imageUrlOf(raw: string): string {
  const url = raw.trim()
  if (!url || url.startsWith('data:')) return ''
  if (url.startsWith('/uploads/')) {
    const name = uploadNameOf(url)
    return name ? `/uploads/${name}` : ''
  }
  if (/^https?:\/\//i.test(url) || url.startsWith('//')) return url
  return ''
}

/** Image URLs an MDX body references: Markdown images, src / poster attributes and any /uploads/ path. */
export function imageRefsInBody(body: string): string[] {
  const out = new Set<string>()
  for (const re of [MD_IMAGE_RE, ATTR_RE]) {
    for (const m of body.matchAll(re)) {
      const url = imageUrlOf(m[1])
      if (url) out.add(url)
    }
  }
  for (const name of uploadNamesIn(body)) out.add(`/uploads/${name}`)
  return Array.from(out)
}

/** Image URLs among the string values of a JSON-like value (covers, photos, logos…). */
export function imageRefsInValue(value: unknown): string[] {
  const out = new Set<string>()
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      const t = v.trim()
      if (t.startsWith('/uploads/')) {
        const url = imageUrlOf(t)
        if (url) out.add(url)
      } else if (IMAGE_URL_RE.test(t)) out.add(t)
      for (const name of uploadNamesIn(t)) out.add(`/uploads/${name}`)
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk)
  }
  walk(value)
  return Array.from(out)
}

/** A document as exported: YAML frontmatter + body (gray-matter, the format the seed files use). */
export function mdxFile(frontmatter: Record<string, unknown>, body: string): string {
  return matter.stringify(body && body.endsWith('\n') ? body : `${body || ''}\n`, frontmatter || {})
}

/**
 * images.json: every referenced image with the files that use it, then the
 * uploads nothing references. `uploads` maps stored upload names to bytes.
 */
export function imageList(uses: ReadonlyArray<{ file: string; urls: readonly string[] }>, uploads: ReadonlyMap<string, number>): ImageRef[] {
  const byUrl = new Map<string, ImageRef>()
  for (const { file, urls } of uses) {
    for (const url of urls) {
      let ref = byUrl.get(url)
      if (!ref) {
        const name = url.startsWith('/uploads/') ? url.slice('/uploads/'.length) : ''
        ref = name
          ? uploads.has(name)
            ? { url, kind: 'upload', bytes: uploads.get(name), usedIn: [] }
            : { url, kind: 'upload', missing: true, usedIn: [] }
          : { url, kind: 'external', usedIn: [] }
        byUrl.set(url, ref)
      }
      if (!ref.usedIn.includes(file)) ref.usedIn.push(file)
    }
  }
  const used = Array.from(byUrl.values()).sort((a, b) => a.url.localeCompare(b.url, 'en'))
  const unused: ImageRef[] = Array.from(uploads.entries())
    .filter(([name]) => !byUrl.has(`/uploads/${name}`))
    .sort((a, b) => a[0].localeCompare(b[0], 'en'))
    .map(([name, bytes]) => ({ url: `/uploads/${name}`, kind: 'upload', bytes, usedIn: [] }))
  return [...used, ...unused]
}

/** "lucian-dev.com-content-2026-10-20.zip" */
export function exportFilename(host: string, now: Date): string {
  const safeHost = host.replace(/[^A-Za-z0-9.-]/g, '') || 'site'
  return `${safeHost}-content-${now.toISOString().slice(0, 10)}.zip`
}

/** Original uploads on disk (no responsive variants) → size in bytes. */
function storedUploads(): Map<string, number> {
  const dir = path.join(process.cwd(), 'public', 'uploads')
  const out = new Map<string, number>()
  let files: string[] = []
  try {
    files = fs.readdirSync(dir)
  } catch {
    return out
  }
  for (const f of files) {
    const name = uploadNameOf(`/uploads/${f}`)
    if (!name) continue
    try {
      const st = fs.statSync(path.join(dir, f))
      if (st.isFile()) out.set(name, st.size)
    } catch {
      /* vanished meanwhile */
    }
  }
  return out
}

const README = (host: string, at: string) => `Content export of ${host}
Exported ${at}

blog/<slug>.mdx       Posts, drafts included (draft: true in the frontmatter).
work/<slug>.mdx       Case studies.
unpublished-changes/  Saved changes of live posts / case studies that are not
                      published yet (the live version is in blog/ or work/).
pages/                The /now, /uses and /about pages that have content.
cv.json               The CV in English and Chinese, every entry with its
                      visibility settings, as CV Studio edits it.
cv-variants.json      The tailored CV variants (sections and entries by uid,
                      page targets), when there are any. Their private links
                      are not exported: they live on the server only.
home.json             The home page document.
redirects.json        Old addresses of renamed posts and case studies and
                      where they lead now.
images.json           Every image the content uses — uploads (/uploads/…)
                      and external URLs — with the files that use it, then
                      the uploads nothing uses. The image files themselves
                      are not in this archive: the full-site snapshots under
                      Admin → Storage & backups include them.
manifest.json         Date, counts and the list of files.

Each .mdx file is YAML frontmatter between --- lines followed by the MDX body.
`

export type ContentExport = { filename: string; zip: Buffer; files: number }

/** Build the export from the content store (server-only). */
export async function buildContentExport(now = new Date()): Promise<ContentExport> {
  const [{ listItems }, { listPendingRevisions }, { readPage, PAGE_NAMES }, { readCvData }, { readHome }, { listRedirects }, { SITE_HOST }] =
    await Promise.all([
      import('./contentStore'),
      import('./pendingRevisions'),
      import('./mdx-admin'),
      import('./cvdata'),
      import('./home'),
      import('./redirects'),
      import('./schema'),
    ])
  const entries: ZipEntry[] = []
  const uses: Array<{ file: string; urls: string[] }> = []
  const add = (name: string, data: string, urls: string[] = []) => {
    entries.push({ name, data, mtime: now })
    if (urls.length) uses.push({ file: name, urls })
  }
  const counts = { posts: 0, caseStudies: 0, unpublishedChanges: 0, pages: 0, redirects: 0, images: 0 }

  for (const c of ['blog', 'work'] as const) {
    for (const item of listItems(c)) {
      const name = `${c}/${item.slug}.mdx`
      add(name, mdxFile(item.frontmatter, item.body), [...imageRefsInValue(item.frontmatter), ...imageRefsInBody(item.body)])
      if (c === 'blog') counts.posts++
      else counts.caseStudies++
    }
    for (const rev of listPendingRevisions(c)) {
      const name = `unpublished-changes/${c}/${rev.slug}.mdx`
      add(name, mdxFile(rev.frontmatter, rev.body), [...imageRefsInValue(rev.frontmatter), ...imageRefsInBody(rev.body)])
      counts.unpublishedChanges++
    }
  }
  for (const page of PAGE_NAMES) {
    const p = readPage(page)
    if (!p.updatedAt && !p.body.trim()) continue
    add(`pages/${page}.mdx`, mdxFile(p.frontmatter, p.body), [...imageRefsInValue(p.frontmatter), ...imageRefsInBody(p.body)])
    counts.pages++
  }
  const cv = readCvData()
  add('cv.json', `${JSON.stringify({ en: cv.en, zh: cv.zh }, null, 2)}\n`, imageRefsInValue(cv))
  const { readVariants } = await import('./cvVariantsStore')
  const { variants } = readVariants()
  if (variants.length) add('cv-variants.json', `${JSON.stringify({ variants }, null, 2)}\n`)
  const home = readHome()
  if (home) add('home.json', `${JSON.stringify(home, null, 2)}\n`, imageRefsInValue(home))
  const redirects = listRedirects().map((r) => ({
    from: `/${r.collection}/${r.from}`,
    to: `/${r.collection}/${r.to}`,
    since: new Date(r.createdAt).toISOString(),
  }))
  counts.redirects = redirects.length
  add('redirects.json', `${JSON.stringify(redirects, null, 2)}\n`)
  const images = imageList(uses, storedUploads())
  counts.images = images.length
  add('images.json', `${JSON.stringify(images, null, 2)}\n`)

  const at = now.toISOString()
  entries.unshift({ name: 'README.txt', data: README(SITE_HOST, at), mtime: now })
  const manifest = {
    format: 'content-export',
    version: 1,
    site: SITE_HOST,
    exportedAt: at,
    counts,
    files: [...entries.map((e) => e.name), 'manifest.json'],
  }
  entries.splice(1, 0, { name: 'manifest.json', data: `${JSON.stringify(manifest, null, 2)}\n`, mtime: now })
  return { filename: exportFilename(SITE_HOST, now), zip: buildZip(entries), files: entries.length }
}
