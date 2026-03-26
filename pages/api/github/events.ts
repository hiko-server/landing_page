import type { NextApiRequest, NextApiResponse } from 'next'
import { readHome } from '../../../lib/home'
import { extractGitHubUser, RemoteDataStatus } from '../../../lib/github'

type Event = {
  id: string
  type: string
  created_at: string
  repo?: { name: string; url?: string }
  payload?: any
  actor?: { login?: string }
}

type ResponseBody = {
  status: RemoteDataStatus
  events: Event[]
}

let cache: { data: ResponseBody; ts: number } | null = null
const TTL = 5 * 60 * 1000 // 5 minutes

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const home = readHome()
    const user = extractGitHubUser(home?.socials?.github)
    if (!user) return res.status(200).json({ status: 'unconfigured', events: [] })
    const now = Date.now()
    if (cache && now - cache.ts < TTL) {
      return res.status(200).json(cache.data)
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
    if (!gh.ok) return res.status(200).json({ status: 'error', events: [] })
    const list = (await gh.json()) as Event[]
    const data: ResponseBody = {
      status: list.length ? 'ok' : 'empty',
      events: list.slice(0, 12),
    }
    cache = { data, ts: now }
    return res.status(200).json(data)
  } catch {
    return res.status(200).json({ status: 'error', events: [] })
  }
}
