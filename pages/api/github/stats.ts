import type { NextApiRequest, NextApiResponse } from 'next'
import { readHome } from '../../../lib/home'
import { GhUnavailable, cachedGh, ghFetch, extractGithubUser, setPublicCache } from '../../../lib/github'

type Stats = {
  user: string
  public_repos: number
  followers: number
  total_stars: number
  /** false when GitHub couldn't be reached — the UI hides the row instead of showing zeros. */
  available?: boolean
}

const TTL = 4 * 60 * 60 * 1000 // 4 hours

async function load(user: string): Promise<Stats> {
  const uRes = await ghFetch(`https://api.github.com/users/${user}`)
  if (!uRes.ok) throw new GhUnavailable(`user ${uRes.status}`)
  const u = await uRes.json()
  const rRes = await ghFetch(`https://api.github.com/users/${user}/repos?per_page=100&sort=updated`)
  const repos = rRes.ok ? ((await rRes.json()) as any[]) : []
  const total_stars = repos.reduce((sum, r) => sum + (r?.stargazers_count || 0), 0)
  return {
    user,
    public_repos: Number(u.public_repos) || repos.length || 0,
    followers: Number(u.followers) || 0,
    total_stars,
    available: true,
  }
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const empty: Stats = { user: '', public_repos: 0, followers: 0, total_stars: 0, available: false }
  try {
    const user = extractGithubUser(readHome()?.socials?.github)
    if (!user) return res.status(200).json(empty)
    const data = await cachedGh(`stats:${user}`, TTL, { ...empty, user }, () => load(user))
    setPublicCache(res, 1800)
    return res.status(200).json(data)
  } catch {
    return res.status(200).json(empty)
  }
}
