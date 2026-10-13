export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret === 'change-me') {
    throw new Error('JWT_SECRET is not configured')
  }
  return secret
}

export function isProd(): boolean {
  return process.env.NODE_ENV === 'production'
}

export function getSiteUrl(): string {
  return process.env.SITE_URL || 'https://lucian-dev.com'
}

/**
 * MongoDB connection settings sourced from environment.
 * When `uri` is set, the admin UI treats it as read-only.
 */
export function getMongoConfig(): { uri: string; dbName: string; fromEnv: boolean } {
  const uri = (process.env.MONGODB_URI || '').trim()
  const dbName = (process.env.MONGODB_DB_NAME || '').trim() || 'cv_database'
  return { uri, dbName, fromEnv: !!uri }
}


/**
 * Header that carries the real client address (lower-cased). Defaults to
 * Cloudflare's `cf-connecting-ip`, which Cloudflare's edge overwrites on every
 * request, so a visitor can't forge it. `none` (or `off`) disables header trust
 * and uses the TCP peer only.
 */
export function getClientIpHeaderName(): string {
  const raw = (process.env.TRUST_CLIENT_IP_HEADER ?? '').trim().toLowerCase()
  if (!raw) return 'cf-connecting-ip'
  if (raw === 'none' || raw === 'off' || raw === 'false') return ''
  return /^[a-z0-9-]+$/.test(raw) ? raw : 'cf-connecting-ip'
}

/** Raw TRUSTED_PROXY_IPS (comma-separated IPs / CIDRs); parsed in lib/security/ip.ts. */
export function getTrustedProxySpec(): string {
  return process.env.TRUSTED_PROXY_IPS || ''
}

/** Configured public site origin(s), for the CSRF Origin check. */
export function getConfiguredSiteValues(): string[] {
  return [process.env.SITE_URL || '', process.env.NEXT_PUBLIC_SITE_HOST || ''].filter(Boolean)
}

const LOOPBACK_NAMES = new Set(['localhost', '0.0.0.0', '::1', '[::1]', '::', '[::]'])

/**
 * Lower-case hostname of a configured site value — a full origin
 * (`https://lucian-dev.com`) or a bare host (`lucian-dev.com`, `host:3002`) —
 * or null when it does not parse.
 */
export function hostnameOf(value: string): string | null {
  const raw = value.trim()
  if (!raw) return null
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
    return url.hostname.toLowerCase().replace(/\.$/, '') || null
  } catch {
    return null
  }
}

/** Loopback / unspecified addresses and *.localhost names: never a public host. */
export function isLocalHostname(host: string): boolean {
  const h = host.toLowerCase()
  return LOOPBACK_NAMES.has(h) || h.endsWith('.localhost') || /^127\.\d+\.\d+\.\d+$/.test(h)
}

/**
 * The public hostname the site is served on, from SITE_URL or
 * NEXT_PUBLIC_SITE_HOST (first usable one). Loopback names never qualify, so a
 * local or CI run (SITE_URL=http://127.0.0.1:3000) has no public host and
 * nothing host-specific (HTTPS redirect, CDN purge, IndexNow) happens there.
 */
export function getPublicHost(): string | null {
  for (const value of getConfiguredSiteValues()) {
    const host = hostnameOf(value)
    if (host && !isLocalHostname(host)) return host
  }
  return null
}

/** Cloudflare zone purge credentials (CF_ZONE_ID + CF_API_TOKEN), or null when either is unset. */
export function getCloudflarePurgeConfig(): { zoneId: string; apiToken: string } | null {
  const zoneId = (process.env.CF_ZONE_ID || '').trim()
  const apiToken = (process.env.CF_API_TOKEN || '').trim()
  return zoneId && apiToken ? { zoneId, apiToken } : null
}

/** IndexNow key format (8–128 of [A-Za-z0-9-], per the IndexNow protocol). */
export const INDEXNOW_KEY_RE = /^[A-Za-z0-9-]{8,128}$/

/** INDEXNOW_KEY when set and well-formed, else null (IndexNow stays off). */
export function getIndexNowKey(): string | null {
  const key = (process.env.INDEXNOW_KEY || '').trim()
  return INDEXNOW_KEY_RE.test(key) ? key : null
}
