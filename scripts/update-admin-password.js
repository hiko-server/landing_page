#!/usr/bin/env node
// Usage:
//   node scripts/update-admin-password.js NEW_PASSWORD [EMAIL]
// If data/admin.json exists, updates its password.
// If it does not exist, creates it using EMAIL (or process.env.ADMIN_EMAIL).

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const newPassword = process.argv[2]
const emailArg = process.argv[3]
if (!newPassword) {
  console.error('Error: Missing NEW_PASSWORD.\nUsage: node scripts/update-admin-password.js NEW_PASSWORD [EMAIL]')
  process.exit(1)
}

const adminPath = path.join(process.cwd(), 'data', 'admin.json')

function hashPassword(password, salt) {
  const key = crypto.scryptSync(password, salt, 64)
  return key.toString('hex')
}

let admin
if (fs.existsSync(adminPath)) {
  try {
    admin = JSON.parse(fs.readFileSync(adminPath, 'utf-8'))
  } catch (e) {
    console.error('Error: Failed to read existing data/admin.json:', e.message)
    process.exit(1)
  }
  if (!admin.email) {
    console.error('Error: Existing admin.json has no email. Please recreate it or provide EMAIL.')
    process.exit(1)
  }
} else {
  const email = emailArg || process.env.ADMIN_EMAIL
  if (!email) {
    console.error('Error: data/admin.json not found. Provide EMAIL arg or set ADMIN_EMAIL in env to create it.')
    process.exit(1)
  }
  admin = { email, passwordHash: '', salt: '', resets: [] }
}

const salt = crypto.randomBytes(16).toString('hex')
const passwordHash = hashPassword(newPassword, salt)
const next = { ...admin, salt, passwordHash, resets: [] }

fs.mkdirSync(path.dirname(adminPath), { recursive: true })
fs.writeFileSync(adminPath, JSON.stringify(next, null, 2), 'utf-8')
console.log(`Admin password updated for ${next.email}.`)

