import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../../lib/env'
import { isPageName, readPage, writePage } from '../../../lib/mdx-admin'
import { rateLimit } from '../../../lib/rateLimit'

function isAuthed(req: NextApiRequest, res: NextApiResponse): boolean {
  const token = getCookie('cv_admin_token', { req, res }) as string | undefined
  if (!token) return false
  try {
    return ((jwt.verify(token, getJwtSecret()) as { role?: string })?.role === 'admin')
  } catch {
    return false
  }
}

/**
 * Admin CRUD for single-file MDX pages (content/now.mdx, content/uses.mdx).
 *
 *   GET /api/admin/page?name=now       → { name, frontmatter, body }
 *   PUT /api/admin/page                → { name, frontmatter, body } write
 *
 * Snapshots into data/page_snapshots/ on every write (rollback via /admin
 * version-history once that view lands).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAuthed(req, res)) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method === 'GET') {
    const name = req.query.name
    if (!isPageName(name)) return res.status(400).json({ error: 'Invalid page name' })
    return res.status(200).json(readPage(name))
  }

  if (req.method === 'PUT') {
    const rl = rateLimit(req, 30, 10 * 60 * 1000)
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
    if (!rl.allowed) return res.status(429).json({ error: 'Too many writes, try later' })
    const { name, frontmatter, body } = (req.body || {}) as {
      name?: string
      frontmatter?: Record<string, any>
      body?: string
    }
    if (!isPageName(name)) return res.status(400).json({ error: 'Invalid page name' })
    if (!frontmatter || typeof frontmatter !== 'object')
      return res.status(400).json({ error: 'Missing frontmatter' })
    if (!frontmatter.title) return res.status(400).json({ error: 'frontmatter.title required' })
    const result = await writePage(name, frontmatter, body || '')
    if (!result.ok) return res.status(400).json({ error: result.error })
    return res.status(200).json(result)
  }

  res.setHeader('Allow', 'GET,PUT')
  return res.status(405).json({ error: 'Method not allowed' })
}

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }
