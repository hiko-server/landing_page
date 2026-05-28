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

/**
 * MongoDB connection settings sourced from environment.
 * When `uri` is set, the admin UI treats it as read-only.
 */
export function getMongoConfig(): { uri: string; dbName: string; fromEnv: boolean } {
  const uri = (process.env.MONGODB_URI || '').trim()
  const dbName = (process.env.MONGODB_DB_NAME || '').trim() || 'cv_database'
  return { uri, dbName, fromEnv: !!uri }
}

