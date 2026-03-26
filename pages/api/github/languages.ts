import type { NextApiRequest, NextApiResponse } from 'next'
import { readHome } from '../../../lib/home'
import { extractGitHubUser, RemoteDataStatus } from '../../../lib/github'

type LangMap = Record<string, number>
type ResponseBody = {
  status: RemoteDataStatus
  total: number
  breakdown: LangMap
}

let cache: { data: ResponseBody | null; ts: number } | null = null
const TTL = 6 * 60 * 60 * 1000 // 6 hours

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const home = readHome()
    const user = extractGitHubUser(home?.socials?.github)
    if (!user) return res.status(200).json({ status: 'unconfigured', total: 0, breakdown: {} })

    const now = Date.now()
    if (cache && now - cache.ts < TTL) {
      return res.status(200).json(cache.data)
    }

    const token = process.env.GITHUB_TOKEN
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'hiko.dev-site',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    // fetch up to 100 repos (public), then pick top by stargazers to limit language calls
    const repoRes = await fetch(`https://api.github.com/users/${user}/repos?per_page=100&sort=updated`, { headers })
    if (!repoRes.ok) return res.status(200).json({ status: 'error', total: 0, breakdown: {} })
    const repos: any[] = await repoRes.json()
    // Select top 30 by stars (then updated)
    const chosen = repos
      .filter(r => !r.fork) // own work
      .sort((a, b) => (b.stargazers_count - a.stargazers_count) || (Date.parse(b.updated_at) - Date.parse(a.updated_at)))
      .slice(0, 30)

    if (!chosen.length) {
      return res.status(200).json({ status: 'empty', total: 0, breakdown: {} })
    }

    const breakdown: LangMap = {}
    let total = 0
    for (const r of chosen) {
      try {
        const langRes = await fetch(`https://api.github.com/repos/${user}/${r.name}/languages`, { headers })
        if (!langRes.ok) continue
        const langs: LangMap = await langRes.json()
        for (const [k, v] of Object.entries(langs)) {
          breakdown[k] = (breakdown[k] || 0) + (typeof v === 'number' ? v : 0)
          total += typeof v === 'number' ? v : 0
        }
      } catch {
        // skip broken repo
      }
    }

    const data: ResponseBody = {
      status: total > 0 ? 'ok' : 'empty',
      total,
      breakdown,
    }
    cache = { data, ts: now }
    return res.status(200).json(data)
  } catch {
    return res.status(200).json({ status: 'error', total: 0, breakdown: {} })
  }
}
