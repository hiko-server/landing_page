import type { NextApiRequest, NextApiResponse } from 'next'
import { readHome } from '../../../lib/home'
import { extractGitHubUser, RemoteDataStatus } from '../../../lib/github'

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

type ResponseBody = {
  status: RemoteDataStatus
  repos: Repo[]
}

let cache: { data: ResponseBody; ts: number } | null = null
const TTL = 10 * 60 * 1000

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const home = readHome()
    const user = extractGitHubUser(home?.socials?.github)
    if (!user) return res.status(200).json({ status: 'unconfigured', repos: [] })
    const now = Date.now()
    if (cache && now - cache.ts < TTL) {
      return res.status(200).json(cache.data)
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
    if (!gh.ok) return res.status(200).json({ status: 'error', repos: [] })
    const list = (await gh.json()) as Repo[]
    const top = list
      .filter(r => !r.name.startsWith('.'))
      .sort((a, b) => (b.stargazers_count - a.stargazers_count) || (Date.parse(b.updated_at) - Date.parse(a.updated_at)))
      .slice(0, 6)
    const data: ResponseBody = {
      status: top.length ? 'ok' : 'empty',
      repos: top,
    }
    cache = { data, ts: now }
    return res.status(200).json(data)
  } catch {
    return res.status(200).json({ status: 'error', repos: [] })
  }
}
