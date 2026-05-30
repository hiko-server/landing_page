import type { NextApiRequest, NextApiResponse } from 'next'
import { readHome } from '../../../lib/home'
import { ghFetch, extractGithubUser } from '../../../lib/github'

type Event = {
  id: string
  type: string
  created_at: string
  repo?: { name: string; url?: string }
  payload?: any
  actor?: { login?: string }
}

let cache: { data: Event[]; ts: number } | null = null
const TTL = 5 * 60 * 1000 // 5 minutes

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const home = readHome()
    const user = extractGithubUser(home?.socials?.github)
    if (!user) return res.status(200).json({ events: [] })
    const now = Date.now()
    if (cache && now - cache.ts < TTL) {
      return res.status(200).json({ events: cache.data })
    }
    const gh = await ghFetch(`https://api.github.com/users/${user}/events/public?per_page=30`, {
      next: { revalidate: TTL / 1000 },
    })
    let list: Event[] = []
    if (gh.ok) list = (await gh.json()) as Event[]

    // GitHub's public events feed only goes back ~90 days. If a user hasn't
    // had public activity in that window the feed is empty, which made the
    // home/about "Recent Activity" section render nothing. Fall back to the
    // most recently updated repos so the section always shows something
    // meaningful when the account exists.
    if (!list.length) {
      const repoRes = await ghFetch(
        `https://api.github.com/users/${user}/repos?per_page=12&sort=updated`,
        { next: { revalidate: TTL / 1000 } },
      )
      if (repoRes.ok) {
        const repos = (await repoRes.json()) as Array<{
          name: string
          full_name: string
          updated_at: string
          pushed_at: string
          fork: boolean
        }>
        list = repos
          .filter(r => !r.fork)
          .slice(0, 12)
          .map(r => ({
            id: `repo-${r.full_name}`,
            type: 'RepoUpdateEvent',
            created_at: r.pushed_at || r.updated_at,
            repo: { name: r.full_name },
            payload: {},
          }))
      }
    }

    cache = { data: list.slice(0, 12), ts: now }
    return res.status(200).json({ events: cache.data })
  } catch {
    return res.status(200).json({ events: [] })
  }
}

