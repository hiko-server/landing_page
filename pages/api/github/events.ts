import type { NextApiRequest, NextApiResponse } from 'next'
import { GhUnavailable, cachedGh, ghFetch, publicGithubUser, setGhCache } from '../../../lib/github'

type Event = {
  id: string
  type: string
  created_at: string
  repo?: { name: string; url?: string }
  payload?: any
  actor?: { login?: string }
}

/** `available: false` = GitHub unreachable (UI shows an error state); `events: []` with `available: true` = genuinely none. */
type Payload = { events: Event[]; available: boolean }

const TTL = 5 * 60 * 1000 // 5 minutes

async function load(user: string): Promise<Payload> {
  const login = encodeURIComponent(user)
  const gh = await ghFetch(`https://api.github.com/users/${login}/events/public?per_page=30`)
  let list: Event[] = gh.ok ? ((await gh.json()) as Event[]) : []

  // GitHub's public events feed only goes back ~90 days. If a user hasn't
  // had public activity in that window the feed is empty, which made the
  // home/about "Recent Activity" section render nothing. Fall back to the
  // most recently updated repos so the section always shows something
  // meaningful when the account exists.
  if (!list.length) {
    const repoRes = await ghFetch(`https://api.github.com/users/${login}/repos?per_page=12&sort=updated`)
    if (!repoRes.ok) {
      if (!gh.ok) throw new GhUnavailable(`events ${gh.status} / repos ${repoRes.status}`)
      return { events: [], available: true }
    }
    const repos = (await repoRes.json()) as Array<{
      name: string
      full_name: string
      updated_at: string
      pushed_at: string
      fork: boolean
    }>
    list = repos
      .filter((r) => !r.fork)
      .slice(0, 12)
      .map((r) => ({
        id: `repo-${r.full_name}`,
        type: 'RepoUpdateEvent',
        created_at: r.pushed_at || r.updated_at,
        repo: { name: r.full_name },
        payload: {},
      }))
  }
  // Ship only what the feed renders (no actor / full payload blobs).
  const events = list.slice(0, 12).map((e) => ({
    id: String(e.id),
    type: e.type,
    created_at: e.created_at,
    repo: e.repo?.name ? { name: e.repo.name } : undefined,
    payload: {
      action: e.payload?.action,
      number: e.payload?.number ?? e.payload?.pull_request?.number,
      ref_type: e.payload?.ref_type,
      size: Array.isArray(e.payload?.commits) ? e.payload.commits.length : e.payload?.size,
      issue: e.payload?.issue?.number != null ? { number: e.payload.issue.number } : undefined,
    },
  }))
  return { events, available: true }
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const unavailable: Payload = { events: [], available: false }
  try {
    const user = publicGithubUser()
    if (!user) {
      setGhCache(res, true, 300)
      return res.status(200).json({ events: [], available: true })
    }
    const data = await cachedGh(`events:${user}`, TTL, unavailable, () => load(user))
    setGhCache(res, data.available, 300)
    return res.status(200).json(data)
  } catch {
    setGhCache(res, false)
    return res.status(200).json(unavailable)
  }
}
