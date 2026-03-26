export type RemoteDataStatus = 'ok' | 'empty' | 'unconfigured' | 'error'

export function extractGitHubUser(url?: string): string | null {
  if (!url) return null

  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/').filter(Boolean)
    return parts[0] || null
  } catch {
    return null
  }
}
