import fs from 'fs'
import path from 'path'
import { getKv, putKv, type StoreError } from './contentStore'

/**
 * Server-side HomeData IO: SQLite/R2-backed reader + writer + filesystem
 * snapshot helpers.
 *
 * The pure data shape (types, section keys, the `isSectionVisible`
 * helper) lives in `./homeShape` so client-bundled components can import
 * it without pulling in `better-sqlite3` / `node:fs`. This file is the
 * Node-only surface — never import it from anything under `components/`.
 */

export { HOME_SECTION_META, isSectionVisible } from './homeShape'
export type { HomeData, SectionKey } from './homeShape'
import type { HomeData } from './homeShape'

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
