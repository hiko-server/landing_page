import type { NextApiRequest, NextApiResponse } from 'next'
import { readHome } from '../../../lib/home'
import { ghFetch, extractGithubUser } from '../../../lib/github'

type LangMap = Record<string, number>

let cache: { data: { total: number; breakdown: LangMap } | null; ts: number } | null = null
const TTL = 6 * 60 * 60 * 1000 // 6 hours

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const home = readHome()
    const user = extractGithubUser(home?.socials?.github)
    if (!user) return res.status(200).json({ total: 0, breakdown: {} })

    const now = Date.now()
    if (cache && now - cache.ts < TTL) {
      return res.status(200).json(cache.data)
    }

    // fetch up to 100 repos (public), then pick top by stargazers to limit language calls
    const repoRes = await ghFetch(`https://api.github.com/users/${user}/repos?per_page=100&sort=updated`)
    if (!repoRes.ok) return res.status(200).json({ total: 0, breakdown: {} })
    const repos: any[] = await repoRes.json()
    // Select top 30 by stars (then updated)
    const chosen = repos
      .filter(r => !r.fork) // own work
      .sort((a, b) => (b.stargazers_count - a.stargazers_count) || (Date.parse(b.updated_at) - Date.parse(a.updated_at)))
      .slice(0, 30)

    // Fetch each repo's language breakdown with bounded concurrency. This used
    // to be a sequential await-in-loop (3-9s cold on a 6h cache); batching cuts
    // it to a few round-trips while staying polite to GitHub's rate limit
    // (<=8 in flight) on the unauthenticated path.
    const breakdown: LangMap = {}
    let total = 0
    const CONCURRENCY = 8
    const fetchLangs = async (name: string): Promise<LangMap | null> => {
      try {
        const langRes = await ghFetch(`https://api.github.com/repos/${user}/${name}/languages`)
        if (!langRes.ok) return null
        return (await langRes.json()) as LangMap
      } catch {
        return null // skip broken repo
      }
    }
    for (let i = 0; i < chosen.length; i += CONCURRENCY) {
      const batch = await Promise.all(chosen.slice(i, i + CONCURRENCY).map((r) => fetchLangs(r.name)))
      for (const langs of batch) {
        if (!langs) continue
        for (const [k, v] of Object.entries(langs)) {
          const n = typeof v === 'number' ? v : 0
          breakdown[k] = (breakdown[k] || 0) + n
          total += n
        }
      }
    }

    cache = { data: { total, breakdown }, ts: now }
    return res.status(200).json({ total, breakdown })
  } catch {
    return res.status(200).json({ total: 0, breakdown: {} })
  }
}

