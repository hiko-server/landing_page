/**
 * Tiny, dependency-free URL predicates shared by client and server code
 * (homeShape, the contact inquiry model). Pure.
 */

/** Uploaded image reference: a site upload path (/uploads/…) or an https URL. */
export function isCvImageRef(v: string): boolean {
  if (/^\/uploads\/[^/\s?#][^\s?#]*$/.test(v) && !v.includes('..')) return true
  return isHttpsUrl(v)
}

/** An absolute https:// URL with a host and no embedded credentials. */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || /\s/.test(value.trim())) return false
  try {
    const u = new URL(value.trim())
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password
  } catch {
    return false
  }
}
