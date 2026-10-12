/**
 * Admin session revocation.
 *
 * data/admin.json carries `sessionVersion`; every admin JWT carries it as the
 * `sv` claim. A token is only honoured while its `sv` equals the stored
 * version, so bumping the version (password reset, logout) signs out every
 * device at once. Tokens minted before this existed have no claim and count
 * as version 0 — exactly what a record without `sessionVersion` stores — so
 * the session that was live during the upgrade keeps working until the first
 * bump.
 */

export const SESSION_VERSION_CLAIM = 'sv'

/** Normalise a stored or claimed version: non-negative integer, else 0. */
export function toSessionVersion(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export function tokenSessionVersion(claims: Record<string, unknown> | null | undefined): number {
  return toSessionVersion(claims?.[SESSION_VERSION_CLAIM])
}

export function isSessionCurrent(claims: Record<string, unknown> | null | undefined, currentVersion: number): boolean {
  return tokenSessionVersion(claims) === toSessionVersion(currentVersion)
}
