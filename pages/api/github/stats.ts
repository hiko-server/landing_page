import type { NextApiRequest, NextApiResponse } from 'next'
import { GhUnavailable, cachedGh, ghFetch, publicGithubUser, setGhCache } from '../../../lib/github'

type Stats = {
  user: string
  public_repos: number
  followers: number
  total_stars: number
  /**
   * false when GitHub couldn't be reached — the UI shows an error state
   * instead of zeros. `user: ''` with `available: true` = no profile configured.
   */
  available: boolean
}

const TTL = 4 * 60 * 60 * 1000 // 4 hours

async function load(user: string): Promise<Stats> {
  const uRes = await ghFetch(`https://api.github.com/users/${encodeURIComponent(user)}`)
  if (!uRes.ok) throw new GhUnavailable(`user ${uRes.status}`)
  const u = await uRes.json()
  const rRes = await ghFetch(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=updated`)
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
    const user = publicGithubUser()
    // No GitHub profile configured: nothing to show, but nothing is broken either.
    if (!user) {
      setGhCache(res, true, 300)
      return res.status(200).json({ ...empty, available: true })
    }
    const data = await cachedGh(`stats:${user}`, TTL, { ...empty, user }, () => load(user))
    setGhCache(res, data.available, 1800)
    return res.status(200).json(data)
  } catch {
    setGhCache(res, false)
    return res.status(200).json(empty)
  }
}
