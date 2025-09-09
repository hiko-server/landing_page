import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const adminPath = path.join(process.cwd(), 'data', 'admin.json')

type ResetToken = { token: string; expires: number }
export type AdminData = { email: string; passwordHash: string; salt: string; resets?: ResetToken[] }

function hashPassword(password: string, salt: string) {
  const key = crypto.scryptSync(password, salt, 64)
  return key.toString('hex')
}

export function readAdmin(): AdminData | null {
  try {
    const raw = fs.readFileSync(adminPath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function ensureAdminFromEnv(): AdminData | null {
  const current = readAdmin()
  if (current) return current
  const email = process.env.ADMIN_EMAIL || process.env.ADMIN_USER
  const pass = process.env.ADMIN_PASS
  if (!email || !pass) return null
  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = hashPassword(pass, salt)
  const data: AdminData = { email, passwordHash, salt, resets: [] }
  fs.mkdirSync(path.dirname(adminPath), { recursive: true })
  fs.writeFileSync(adminPath, JSON.stringify(data, null, 2), 'utf-8')
  return data
}

export function verifyPassword(email: string, password: string): boolean {
  const data = readAdmin() || ensureAdminFromEnv()
  if (!data) return false
  if (data.email !== email) return false
  const check = hashPassword(password, data.salt)
  return timingSafeEqualHex(check, data.passwordHash)
}

export function updatePassword(newPassword: string) {
  const data = readAdmin() || ensureAdminFromEnv()
  if (!data) throw new Error('admin not configured')
  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = hashPassword(newPassword, salt)
  const next = { ...data, salt, passwordHash, resets: [] }
  fs.writeFileSync(adminPath, JSON.stringify(next, null, 2), 'utf-8')
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let res = 0
  for (let i = 0; i < a.length; i++) {
    res |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return res === 0
}

export function createResetToken(): { token: string; expires: number } {
  const data = readAdmin() || ensureAdminFromEnv()
  if (!data) throw new Error('admin not configured')
  const token = crypto.randomBytes(24).toString('hex')
  const expires = Date.now() + 1000 * 60 * 30 // 30 min
  const resets = data.resets || []
  resets.push({ token, expires })
  fs.writeFileSync(adminPath, JSON.stringify({ ...data, resets }, null, 2), 'utf-8')
  return { token, expires }
}

export function consumeResetToken(token: string): boolean {
  const data = readAdmin() || ensureAdminFromEnv()
  if (!data) return false
  const now = Date.now()
  const resets = (data.resets || []).filter((t) => t.expires > now)
  const found = resets.find((t) => t.token === token)
  const remaining = resets.filter((t) => t.token !== token)
  fs.writeFileSync(adminPath, JSON.stringify({ ...data, resets: remaining }, null, 2), 'utf-8')
  return !!found
}
