import fs from 'fs'
import path from 'path'
import { getKv, putKv, type StoreError } from './contentStore'
import { publicCvDoc, type CvAudience, type CvDoc, type CvLang } from './cvVisibility'

const snapshotDir = path.join(process.cwd(), 'data', 'cv_snapshots')

export function readCvData(): { en: any[]; zh: any[] } {
  const json = getKv<any>('cvdata')
  if (!json) return { en: [], zh: [] }
  const en = Array.isArray(json.en) ? json.en : Array.isArray(json) ? json : []
  const zh = Array.isArray(json.zh) ? json.zh : []
  return { en, zh }
}

/**
 * The CV as visitors may see it: hidden sections / entries / fields / bullets
 * removed (see lib/cvVisibility.ts). Use this for every public page and the
 * unauthenticated API — never ship readCvData() output to the browser.
 */
export function readPublicCvData(audience: CvAudience = 'any'): CvDoc {
  return publicCvDoc(readCvData(), audience)
}

/**
 * Public view restricted to the sections a page actually renders (by
 * `sessionName`) and the languages it needs. Pages must use this instead of
 * shipping the whole public CV, so e.g. contact details never end up in the
 * __NEXT_DATA__ of a page that does not display them.
 */
export function readPublicCvSections(
  audience: CvAudience,
  sessionNames: readonly string[],
  langs: readonly CvLang[] = ['en', 'zh'],
): CvDoc {
  const wanted = new Set(sessionNames)
  const doc = readPublicCvData(audience)
  const pick = (lang: CvLang) =>
    langs.includes(lang) ? doc[lang].filter((s) => wanted.has(String(s.sessionName))) : []
  return { en: pick('en'), zh: pick('zh') }
}

export async function writeCvData(data: { en: any[]; zh: any[] }): Promise<StoreError> {
  return await putKv('cvdata', data)
}

// Re-exported for existing importers; implementation is pure (lib/cvSync.ts).
export { syncStructure, syncLanguage } from './cvSync'

export function saveSnapshot(): string {
  const now = new Date()
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z','')
  const filename = `cv_${stamp}.json`
  const filePath = path.join(snapshotDir, filename)
  fs.mkdirSync(snapshotDir, { recursive: true })
  const current = readCvData()
  fs.writeFileSync(filePath, JSON.stringify(current, null, 2), 'utf-8')
  return filename
}

export function listSnapshots(): string[] {
  try {
    return fs.readdirSync(snapshotDir).filter(f => f.endsWith('.json')).sort().reverse()
  } catch {
    return []
  }
}

export async function restoreSnapshot(filename: string): Promise<StoreError> {
  // Sanitize like readSnapshot() — never let a caller-supplied name escape the
  // snapshot dir (path traversal). Same allowlist as the sibling reader.
  const safe = filename.replace(/[^a-zA-Z0-9_.-]/g, '_')
  const filePath = path.join(snapshotDir, safe)
  if (!fs.existsSync(filePath)) return { ok: false, error: 'Snapshot not found' }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return await putKv('cvdata', data)
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to restore' }
  }
}

export function readSnapshot(filename: string): string | null {
  const safe = filename.replace(/[^a-zA-Z0-9_.-]/g, '_')
  const filePath = path.join(snapshotDir, safe)
  try {
    if (!fs.existsSync(filePath)) return null
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}
