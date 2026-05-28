import fs from 'fs'
import path from 'path'
import { getKv, putKv, type StoreError } from './contentStore'

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

const homeSnapshotDir = path.join(process.cwd(), 'data', 'home_snapshots')

export function readHome(): HomeData | null {
  return getKv<HomeData>('home')
}

export async function writeHome(data: HomeData): Promise<StoreError> {
  return await putKv('home', data)
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

export function restoreHomeSnapshot(filename: string): Promise<StoreError> {
  const safe = filename.replace(/[^a-zA-Z0-9_.\-]/g, '_')
  const filePath = path.join(homeSnapshotDir, safe)
  if (!fs.existsSync(filePath)) return Promise.resolve({ ok: false, error: 'Snapshot not found' })
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as HomeData
    return putKv('home', data)
  } catch (err: any) {
    return Promise.resolve({ ok: false, error: err?.message || 'Failed to restore' })
  }
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

