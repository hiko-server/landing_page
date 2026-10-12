import type { NextApiRequest, NextApiResponse } from 'next'
import { listAll, readOne, writeOne, deleteOne } from '../../../lib/mdx-admin'
import { rateLimit } from '../../../lib/rateLimit'
import { isAdminRequest } from '../../../lib/auth'
import { collectionPaths, revalidatePaths } from '../../../lib/revalidate'

const isAuthed = isAdminRequest

/**
 * Admin CRUD for blog posts (content/blog/*.mdx).
 *
 *   GET    /api/admin/posts                → list all (including drafts)
 *   GET    /api/admin/posts?slug=foo       → read one
 *   PUT    /api/admin/posts                → { slug, frontmatter, body } write/overwrite
 *   DELETE /api/admin/posts?slug=foo       → delete (auto-snapshots first)
 *
 * Successful writes regenerate /blog and /blog/<slug> and list them in
 * `revalidated` (`revalidateFailed` names any page that could not be refreshed).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method === 'GET') {
    const slug = req.query.slug as string | undefined
    if (slug) {
      const one = readOne('blog', slug)
      if (!one) return res.status(404).json({ error: 'Not found' })
      return res.status(200).json(one)
    }
    return res.status(200).json({ items: listAll('blog') })
  }

  if (req.method === 'PUT') {
    const rl = rateLimit(req, 30, 10 * 60 * 1000)
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) return res.status(429).json({ error: 'Too many writes, try later' })
    const { slug, frontmatter, body, create } = (req.body || {}) as {
      slug?: string
      frontmatter?: Record<string, any>
      body?: string
      create?: boolean
    }
    if (!slug) return res.status(400).json({ error: 'Missing slug' })
    if (!frontmatter || typeof frontmatter !== 'object')
      return res.status(400).json({ error: 'Missing frontmatter' })
    if (!frontmatter.title) return res.status(400).json({ error: 'frontmatter.title required' })
    if (!frontmatter.date) return res.status(400).json({ error: 'frontmatter.date required' })
    // "New post" must never silently replace an existing one.
    if (create && readOne('blog', slug)) return res.status(409).json({ error: 'A post with this slug already exists' })
    const result = await writeOne('blog', slug, frontmatter, body || '')
    if (!result.ok) return res.status(400).json({ error: result.error })
    return res.status(200).json({ ...result, ...(await refresh(res, slug)) })
  }

  if (req.method === 'DELETE') {
    const slug = req.query.slug as string | undefined
    if (!slug) return res.status(400).json({ error: 'Missing slug' })
    const result = await deleteOne('blog', slug)
    if (!result.ok) return res.status(404).json({ error: result.error })
    return res.status(200).json({ ...result, ...(await refresh(res, slug)) })
  }

  res.setHeader('Allow', 'GET,PUT,DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

/**
 * Regenerate /blog and /blog/<slug> right away so "Save" means "live".
 * A failed refresh never fails the write (the 60 s ISR window still applies).
 */
async function refresh(res: NextApiResponse, slug: string) {
  const paths = collectionPaths('blog', slug, listAll('blog').map((i) => i.slug))
  const failed = await revalidatePaths(res, paths)
  return {
    revalidated: paths.filter((p) => !failed.includes(p)),
    ...(failed.length ? { revalidateFailed: failed } : {}),
  }
}

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }
