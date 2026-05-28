import fs from 'fs'
import path from 'path'
import { getKv, putKv, type StoreError } from './contentStore'

const snapshotDir = path.join(process.cwd(), 'data', 'cv_snapshots')

export function readCvData(): { en: any[]; zh: any[] } {
  const json = getKv<any>('cvdata')
  if (!json) return { en: [], zh: [] }
  const en = Array.isArray(json.en) ? json.en : Array.isArray(json) ? json : []
  const zh = Array.isArray(json.zh) ? json.zh : []
  return { en, zh }
}

export async function writeCvData(data: { en: any[]; zh: any[] }): Promise<StoreError> {
  return await putKv('cvdata', data)
}

export function syncStructure(template: any, target: any): any {
  if (Array.isArray(template)) {
    const tArr = Array.isArray(target) ? target : []
    return template.map((item, idx) => syncStructure(item, tArr[idx]))
  }
  if (template && typeof template === 'object') {
    const result: any = {}
    const tObj = target && typeof target === 'object' ? target : {}
    for (const key of Object.keys(template)) {
      result[key] = syncStructure(template[key], tObj[key])
    }
    return result
  }
  // primitive: prefer target if defined, otherwise copy template
  if (target === undefined || target === null) return template
  return target
}

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
  const filePath = path.join(snapshotDir, filename)
  if (!fs.existsSync(filePath)) return { ok: false, error: 'Snapshot not found' }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return await putKv('cvdata', data)
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to restore' }
  }
}

export function readSnapshot(filename: string): string | null {
  const safe = filename.replace(/[^a-zA-Z0-9_.\-]/g, '_')
  const filePath = path.join(snapshotDir, safe)
  try {
    if (!fs.existsSync(filePath)) return null
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}
