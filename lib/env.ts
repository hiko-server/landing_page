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
  return process.env.SITE_URL || 'https://hiko.dev'
}

