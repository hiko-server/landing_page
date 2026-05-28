import fs from 'fs'
import path from 'path'

export type HomeData = {
  hero: {
    welcome: string
    brand: string
    tagline: string
    avatarUrl: string
    phone?: string
    email?: string
    /** Object-position (x,y in %) + scale, set by the admin Home GUI's
     *  drag-to-position avatar editor. Used by PersonalInfo and the home
     *  card. Stored as JSON in data/home.json. */
    avatarTransform?: {
      x?: number
      y?: number
      scale?: number
    }
  }
  socials: {
    github?: string
    gitlab?: string
    linkedin?: string
    whatsapp?: string
  }
  brands: { name: string; href: string; image: string }[]
  quickAccess: { label: string; url: string }[]
  photos?: { url: string; describe?: string; redirectTo?: string; visible?: boolean }[]
}

const homePath = path.join(process.cwd(), 'data', 'home.json')
const homeSnapshotDir = path.join(process.cwd(), 'data', 'home_snapshots')

export function readHome(): HomeData | null {
  try {
    const raw = fs.readFileSync(homePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function writeHome(data: HomeData) {
  fs.mkdirSync(path.dirname(homePath), { recursive: true })
  fs.writeFileSync(homePath, JSON.stringify(data, null, 2), 'utf-8')
}

export function saveHomeSnapshot(): string {
  const now = new Date()
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const filename = `home_${stamp}.json`
  const filePath = path.join(homeSnapshotDir, filename)
  fs.mkdirSync(homeSnapshotDir, { recursive: true })
  const current = readHome()
  fs.writeFileSync(filePath, JSON.stringify(current, null, 2), 'utf-8')
  return filename
}

export function listHomeSnapshots(): string[] {
  try {
    return fs.readdirSync(homeSnapshotDir).filter(f => f.endsWith('.json')).sort().reverse()
  } catch {
    return []
  }
}

export function restoreHomeSnapshot(filename: string): boolean {
  const safe = filename.replace(/[^a-zA-Z0-9_.\-]/g, '_')
  const filePath = path.join(homeSnapshotDir, safe)
  if (!fs.existsSync(filePath)) return false
  const raw = fs.readFileSync(filePath, 'utf-8')
  fs.mkdirSync(path.dirname(homePath), { recursive: true })
  fs.writeFileSync(homePath, raw, 'utf-8')
  return true
}

export function readHomeSnapshot(filename: string): string | null {
  const safe = filename.replace(/[^a-zA-Z0-9_.\-]/g, '_')
  const filePath = path.join(homeSnapshotDir, safe)
  try {
    if (!fs.existsSync(filePath)) return null
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

