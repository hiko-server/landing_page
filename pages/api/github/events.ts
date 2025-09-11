import type { NextApiRequest, NextApiResponse } from 'next'
import { readHome } from '../../../lib/home'

type Event = {
  id: string
  type: string
  created_at: string
  repo?: { name: string; url?: string }
  payload?: any
  actor?: { login?: string }
}

let cache: { data: Event[]; ts: number } | null = null
const TTL = 5 * 60 * 1000 // 5 minutes

function extractUser(url?: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    return parts[0] || null
  } catch {
    return null
  }
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const home = readHome()
    const user = extractUser(home?.socials?.github)
    if (!user) return res.status(200).json({ events: [] })
    const now = Date.now()
    if (cache && now - cache.ts < TTL) {
      return res.status(200).json({ events: cache.data })
    }
    const token = process.env.GITHUB_TOKEN
    const gh = await fetch(`https://api.github.com/users/${user}/events/public?per_page=30`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'hiko.dev-site',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: TTL / 1000 },
    })
    if (!gh.ok) return res.status(200).json({ events: [] })
    const list = (await gh.json()) as Event[]
    cache = { data: list.slice(0, 12), ts: now }
    return res.status(200).json({ events: cache.data })
  } catch {
    return res.status(200).json({ events: [] })
  }
}

