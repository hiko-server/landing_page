import type { NextApiRequest, NextApiResponse } from 'next'
import { readHome } from '../../../lib/home'
import { GhUnavailable, cachedGh, ghFetch, extractGithubUser, setPublicCache } from '../../../lib/github'

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

const TTL = 10 * 60 * 1000

async function load(user: string): Promise<Repo[]> {
  const gh = await ghFetch(`https://api.github.com/users/${user}/repos?per_page=100&sort=updated`)
  if (!gh.ok) throw new GhUnavailable(`repos ${gh.status}`)
  const list = (await gh.json()) as Repo[]
  return list
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
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = extractGithubUser(readHome()?.socials?.github)
    if (!user) return res.status(200).json({ repos: [] })
    const repos = await cachedGh(`top-repos:${user}`, TTL, [] as Repo[], () => load(user))
    setPublicCache(res, 600)
    return res.status(200).json({ repos })
  } catch {
    return res.status(200).json({ repos: [] })
  }
}
