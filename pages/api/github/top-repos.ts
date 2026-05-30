import type { NextApiRequest, NextApiResponse } from 'next'
import { readHome } from '../../../lib/home'
import { ghFetch, extractGithubUser } from '../../../lib/github'

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

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const home = readHome()
    const user = extractGithubUser(home?.socials?.github)
    if (!user) return res.status(200).json({ repos: [] })
    const now = Date.now()
    if (cache && now - cache.ts < TTL) {
      return res.status(200).json({ repos: cache.data })
    }
    const gh = await ghFetch(`https://api.github.com/users/${user}/repos?per_page=100&sort=updated`, {
      // Unauthenticated fallback is limited to 60/hr; the in-memory cache above
      // plus this revalidate hint keep us comfortably under it.
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
