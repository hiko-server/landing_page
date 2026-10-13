/**
 * Helpers for the /colophon release timeline (pages/colophon.tsx), pure so
 * they are unit-tested (tests/chrome-identity.test.ts).
 */

/** Anchor id of a release ("2.3.0" → "v2-3-0"). */
export function releaseAnchor(version: string): string {
  return `v${version.replace(/\./g, '-')}`
}

/** The release a location hash points at ("#v2-2-0" → "2.2.0"), or null. */
export function releaseIdFromHash(hash: string, versions: readonly string[]): string | null {
  let id = (hash || '').replace(/^#/, '')
  try {
    id = decodeURIComponent(id)
  } catch {
    return null
  }
  if (!id) return null
  return versions.find((v) => releaseAnchor(v) === id) ?? null
}

/** Number of changes (bullets) listed in a release's groups. */
export function releaseChangeCount(groups: readonly { count: number }[]): number {
  return groups.reduce((n, g) => n + (Number.isFinite(g.count) && g.count > 0 ? g.count : 0), 0)
}
