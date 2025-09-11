import fs from 'fs'
import path from 'path'

const dataPath = path.join(process.cwd(), 'data', 'cvdata.json')
const snapshotDir = path.join(process.cwd(), 'data', 'cv_snapshots')

export function readCvData(): { en: any[]; zh: any[] } {
  try {
    const raw = fs.readFileSync(dataPath, 'utf-8')
    const json = JSON.parse(raw)
    if (!json.en || !json.zh) throw new Error('invalid structure')
    return json
  } catch {
    // fallback to example static if file missing or invalid
    // use require to avoid bundler trying to parse TS at runtime; provide empty arrays instead
    return { en: [], zh: [] }
  }
}

export function writeCvData(data: { en: any[]; zh: any[] }) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true })
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8')
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

export function restoreSnapshot(filename: string): boolean {
  const filePath = path.join(snapshotDir, filename)
  if (!fs.existsSync(filePath)) return false
  const raw = fs.readFileSync(filePath, 'utf-8')
  fs.mkdirSync(path.dirname(dataPath), { recursive: true })
  fs.writeFileSync(dataPath, raw, 'utf-8')
  return true
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
