/**
 * Pure helpers for the GitHub activity feed (components/GitHub/ActivityFeed).
 */

export type GhEvent = {
  id: string
  type: string
  created_at: string
  repo?: { name: string }
  payload?: {
    action?: string
    number?: number
    ref_type?: string
    size?: number
    issue?: { number?: number }
  }
}

export type EventKind = 'push' | 'pr' | 'issue' | 'create' | 'repo' | 'other'

const REPO_RE = /^[\w.-]+\/[\w.-]+$/

/** https://github.com/<owner>/<repo> for a well-formed repo name, else ''. */
export function repoUrl(name: unknown): string {
  return typeof name === 'string' && REPO_RE.test(name) ? `https://github.com/${name}` : ''
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

export function eventKind(type: string): EventKind {
  switch (type) {
    case 'PushEvent':
      return 'push'
    case 'PullRequestEvent':
      return 'pr'
    case 'IssuesEvent':
      return 'issue'
    case 'CreateEvent':
      return 'create'
    case 'RepoUpdateEvent':
      return 'repo'
    default:
      return 'other'
  }
}

/** Verb phrase without the repo, e.g. "Pushed 3 commits to", "Opened PR #12 in". */
export function eventAction(e: GhEvent): string {
  const p = e.payload || {}
  switch (e.type) {
    case 'PushEvent': {
      const n = typeof p.size === 'number' && p.size > 0 ? p.size : 0
      return n ? `Pushed ${n} commit${n > 1 ? 's' : ''} to` : 'Pushed to'
    }
    case 'PullRequestEvent': {
      const num = typeof p.number === 'number' ? ` #${p.number}` : ''
      const verb = p.action === 'opened' ? 'Opened' : p.action === 'closed' ? 'Closed' : 'Updated'
      return `${verb} PR${num} in`
    }
    case 'IssuesEvent': {
      const n = p.issue?.number
      const num = typeof n === 'number' ? ` #${n}` : ''
      const verb = p.action === 'opened' ? 'Opened' : p.action === 'closed' ? 'Closed' : 'Updated'
      return `${verb} issue${num} in`
    }
    case 'CreateEvent':
      return p.ref_type === 'repository' ? 'Created repository' : `Created ${p.ref_type || 'ref'} in`
    case 'RepoUpdateEvent':
      return 'Updated'
    case 'WatchEvent':
      return 'Starred'
    case 'ForkEvent':
      return 'Forked'
    case 'ReleaseEvent':
      return 'Published a release in'
    default: {
      const words = String(e.type || '')
        .replace(/Event$/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
      return words ? `${cap(words)} in` : 'Activity in'
    }
  }
}

/** "just now", "5m ago", "3h ago", "2d ago", or a short date beyond 30 days. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d <= 30) return `${d}d ago`
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
