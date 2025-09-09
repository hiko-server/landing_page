import fs from 'fs'
import path from 'path'

const dataPath = path.join(process.cwd(), 'data', 'cvdata.json')

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

