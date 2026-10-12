import type { NextApiRequest, NextApiResponse } from 'next'
import { GhUnavailable, cachedGh, ghFetch, publicGithubUser, setGhCache } from '../../../lib/github'

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

/** `available: false` = GitHub unreachable (UI shows an error state); `repos: []` with `available: true` = genuinely none. */
type Payload = { repos: Repo[]; available: boolean }

const TTL = 10 * 60 * 1000

async function load(user: string): Promise<Payload> {
  const gh = await ghFetch(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=updated`)
  if (!gh.ok) throw new GhUnavailable(`repos ${gh.status}`)
  const list = (await gh.json()) as Repo[]
  const repos = list
    .filter((r) => !r.name.startsWith('.'))
    .sort((a, b) => b.stargazers_count - a.stargazers_count || Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, 6)
    .map(({ id, name, html_url, description, stargazers_count, forks_count, language, updated_at }) => ({
      id,
      name,
      html_url,
      description,
      stargazers_count,
      forks_count,
      language,
      updated_at,
    }))
  return { repos, available: true }
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const unavailable: Payload = { repos: [], available: false }
  try {
    const user = publicGithubUser()
    if (!user) {
      setGhCache(res, true, 300)
      return res.status(200).json({ repos: [], available: true })
    }
    const data = await cachedGh(`top-repos:${user}`, TTL, unavailable, () => load(user))
    setGhCache(res, data.available, 600)
    return res.status(200).json(data)
  } catch {
    setGhCache(res, false)
    return res.status(200).json(unavailable)
  }
}
