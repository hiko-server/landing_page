import type { NextApiRequest, NextApiResponse } from 'next'
import { readHome } from '../../../lib/home'
import { ghFetch, extractGithubUser } from '../../../lib/github'

type Stats = {
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
    const user = extractGithubUser(home?.socials?.github)
    if (!user) return res.status(200).json({ user: '', public_repos: 0, followers: 0, total_stars: 0 })

    const now = Date.now()
    if (cache && cache.data && now - cache.ts < TTL) return res.status(200).json(cache.data)

    const uRes = await ghFetch(`https://api.github.com/users/${user}`)
    if (!uRes.ok) return res.status(200).json({ user, public_repos: 0, followers: 0, total_stars: 0 })
    const u = await uRes.json()

    const rRes = await ghFetch(`https://api.github.com/users/${user}/repos?per_page=100&sort=updated`)
    const repos = rRes.ok ? (await rRes.json()) as any[] : []
    const total_stars = repos.reduce((sum, r) => sum + (r?.stargazers_count || 0), 0)

    const data: Stats = { user, public_repos: Number(u.public_repos) || repos.length || 0, followers: Number(u.followers) || 0, total_stars }
    cache = { data, ts: now }
    return res.status(200).json(data)
  } catch {
    return res.status(200).json({ user: '', public_repos: 0, followers: 0, total_stars: 0 })
  }
}

