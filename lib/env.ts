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
