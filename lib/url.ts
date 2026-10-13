/**
 * Tiny, dependency-free URL predicates shared by client and server code
 * (homeShape, the contact inquiry model, lib/cvFormat's safeHref). Pure.
 */

/**
 * Href for admin-supplied links rendered on public pages. Allows only
 * http(s), mailto: and tel: (plus same-site paths starting with a single
 * "/"); bare domains get https://. Anything else — javascript:, data:,
 * vbscript:, protocol-relative "//evil" — yields '' so callers render text
 * instead of a link.
 */
export function safeHref(url: unknown): string {
  if (typeof url !== 'string') return ''
  const u = url.trim()
  if (!u) return ''
  if (/^\/(?!\/)/.test(u)) return u
  if (/^(mailto|tel):/i.test(u)) return u
  if (/^https?:\/\//i.test(u)) return u
  // Any other explicit scheme (javascript:, data:, …) or protocol-relative URL is refused.
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return ''
  // Bare domain ("lucian-dev.com/x"): must look like a host.
  return /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(u) ? `https://${u}` : ''
}

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
