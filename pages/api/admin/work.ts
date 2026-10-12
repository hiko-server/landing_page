import type { NextApiRequest, NextApiResponse } from 'next'
import { listAll, readOne, writeOne, deleteOne } from '../../../lib/mdx-admin'
import { rateLimit } from '../../../lib/rateLimit'
import { isAdminRequest } from '../../../lib/auth'
import { collectionPaths, revalidatePaths } from '../../../lib/revalidate'

const isAuthed = isAdminRequest

/**
 * Admin CRUD for project case studies (content/work/*.mdx). Mirror of
 * /api/admin/posts: successful writes regenerate /work and /work/<slug> and
 * list them in `revalidated`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method === 'GET') {
    const slug = req.query.slug as string | undefined
    if (slug) {
      const one = readOne('work', slug)
      if (!one) return res.status(404).json({ error: 'Not found' })
      return res.status(200).json(one)
    }
    return res.status(200).json({ items: listAll('work') })
  }

  if (req.method === 'PUT') {
    const rl = rateLimit(req, 30, 10 * 60 * 1000)
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) return res.status(429).json({ error: 'Too many writes, try later' })
    const { slug, frontmatter, body, create } = (req.body || {}) as {
      create?: boolean
      slug?: string
      frontmatter?: Record<string, any>
      body?: string
    }
    if (!slug) return res.status(400).json({ error: 'Missing slug' })
    if (!frontmatter?.title) return res.status(400).json({ error: 'frontmatter.title required' })
    if (create && readOne('work', slug)) return res.status(409).json({ error: 'A case study with this slug already exists' })
    const result = await writeOne('work', slug, frontmatter, body || '')
    if (!result.ok) return res.status(400).json({ error: result.error })
    return res.status(200).json({ ...result, ...(await refresh(res, slug)) })
  }

  if (req.method === 'DELETE') {
    const slug = req.query.slug as string | undefined
    if (!slug) return res.status(400).json({ error: 'Missing slug' })
    const result = await deleteOne('work', slug)
    if (!result.ok) return res.status(404).json({ error: result.error })
    return res.status(200).json({ ...result, ...(await refresh(res, slug)) })
  }

  res.setHeader('Allow', 'GET,PUT,DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}

/**
 * Regenerate /work and /work/<slug> right away so "Save" means "live".
 * A failed refresh never fails the write (the 60 s ISR window still applies).
 */
async function refresh(res: NextApiResponse, slug: string) {
  const paths = collectionPaths('work', slug, listAll('work').map((i) => i.slug))
  const failed = await revalidatePaths(res, paths)
  return {
    revalidated: paths.filter((p) => !failed.includes(p)),
    ...(failed.length ? { revalidateFailed: failed } : {}),
  }
}

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }
