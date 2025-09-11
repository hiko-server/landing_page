import type { NextApiRequest, NextApiResponse } from 'next'
import { readHome } from '../../../lib/home'

type Repo = {
  id: number
  name: string
  html_url: string
  description: string | null
  stargazers_count: number
  forks_count: number
  language: string | null
  updated_at: string
}

let cache: { data: Repo[]; ts: number } | null = null
const TTL = 10 * 60 * 1000

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
    if (!user) return res.status(200).json({ repos: [] })
    const now = Date.now()
    if (cache && now - cache.ts < TTL) {
      return res.status(200).json({ repos: cache.data })
    }
    const token = process.env.GITHUB_TOKEN
    const gh = await fetch(`https://api.github.com/users/${user}/repos?per_page=100&sort=updated`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'hiko.dev-site',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      // no auth -> limited to 60/hr
      next: { revalidate: TTL / 1000 },
    })
    if (!gh.ok) return res.status(200).json({ repos: [] })
    const list = (await gh.json()) as Repo[]
    const top = list
      .filter(r => !r.name.startsWith('.'))
      .sort((a, b) => (b.stargazers_count - a.stargazers_count) || (Date.parse(b.updated_at) - Date.parse(a.updated_at)))
      .slice(0, 6)
    cache = { data: top, ts: now }
    return res.status(200).json({ repos: top })
  } catch {
    return res.status(200).json({ repos: [] })
  }
}
