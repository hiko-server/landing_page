import type { NextApiRequest, NextApiResponse } from 'next'
import { readHome } from '../../../lib/home'
import { extractGitHubUser, RemoteDataStatus } from '../../../lib/github'

type Stats = {
  status: RemoteDataStatus
  user: string
  public_repos: number
  followers: number
  total_stars: number
}

let cache: { data: Stats | null; ts: number } | null = null
const TTL = 4 * 60 * 60 * 1000 // 4 hours

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const home = readHome()
    const user = extractGitHubUser(home?.socials?.github)
    if (!user) {
      return res.status(200).json({
        status: 'unconfigured',
        user: '',
        public_repos: 0,
        followers: 0,
        total_stars: 0,
      })
    }

    const now = Date.now()
    if (cache && cache.data && now - cache.ts < TTL) return res.status(200).json(cache.data)

    const token = process.env.GITHUB_TOKEN
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'hiko.dev-site' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const uRes = await fetch(`https://api.github.com/users/${user}`, { headers })
    if (!uRes.ok) {
      return res.status(200).json({
        status: 'error',
        user,
        public_repos: 0,
        followers: 0,
        total_stars: 0,
      })
    }
    const u = await uRes.json()

    const rRes = await fetch(`https://api.github.com/users/${user}/repos?per_page=100&sort=updated`, { headers })
    const repos = rRes.ok ? (await rRes.json()) as any[] : []
    const total_stars = repos.reduce((sum, r) => sum + (r?.stargazers_count || 0), 0)

    const data: Stats = {
      status: 'ok',
      user,
      public_repos: Number(u.public_repos) || repos.length || 0,
      followers: Number(u.followers) || 0,
      total_stars,
    }
    cache = { data, ts: now }
    return res.status(200).json(data)
  } catch {
    return res.status(200).json({
      status: 'error',
      user: '',
      public_repos: 0,
      followers: 0,
      total_stars: 0,
    })
  }
}
