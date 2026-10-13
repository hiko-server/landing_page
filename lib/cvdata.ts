import path from 'path'
import {
  getKvWithMeta,
  listSnapshotFiles,
  putKv,
  readSnapshotFile,
  safeSnapshotName,
  SNAPSHOT_NOT_FOUND,
  writeSnapshotFile,
  type KvPutOptions,
  type KvPutResult,
} from './contentStore'
import { publicCvDoc, type CvAudience, type CvDoc, type CvLang } from './cvVisibility'
import { pdfPhoto } from './cvLocale'

const snapshotDir = path.join(process.cwd(), 'data', 'cv_snapshots')

export type FullCvDoc = { en: any[]; zh: any[] }

/** Accept the stored `{ en, zh }` shape and the legacy bare EN array. */
function normalizeCv(json: any): FullCvDoc {
  if (!json) return { en: [], zh: [] }
  const en = Array.isArray(json.en) ? json.en : Array.isArray(json) ? json : []
  const zh = Array.isArray(json.zh) ? json.zh : []
  return { en, zh }
}

/** FULL document with visibility metadata — admin editors only, never public output. */
export function readCvData(): FullCvDoc {
  return normalizeCv(getKvWithMeta<any>('cvdata').value)
}

/**
 * FULL document plus its version (kv `updated_at`, 0 when no row) for
 * ETag / If-Match handling in the admin API.
 */
export function readCvDataWithVersion(): FullCvDoc & { version: number } {
  const row = getKvWithMeta<any>('cvdata')
  return { ...normalizeCv(row.value), version: row.updatedAt }
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

/**
 * PDF hook (E10): the photo the given language's PDF may print, or null.
 * Reads the FULL document — public views never carry the photo — and
 * applies lib/cvLocale pdfPhoto (switch on, section on the CV). For the
 * server-side PDF generator only; never send the result to a web page.
 */
export function readCvPdfPhoto(lang: CvLang): string | null {
  return pdfPhoto(readCvData()[lang])
}

/** Write the full document. Pass `precondition` for an atomic If-Match check. */
export async function writeCvData(data: FullCvDoc, opts: KvPutOptions = {}): Promise<KvPutResult> {
  return await putKv('cvdata', data, opts)
}

// Re-exported for existing importers; implementation is pure (lib/cvSync.ts).
export { syncStructure, syncLanguage } from './cvSync'

/**
 * Snapshot the stored CV into data/cv_snapshots (newest 100 kept). Skips the
 * write when the newest snapshot is identical. A row that is not valid JSON
 * is snapshotted verbatim so its bytes survive the next save.
 */
export function saveSnapshot(): string {
  const row = getKvWithMeta<any>('cvdata')
  const content = row.corrupt && row.raw !== null ? row.raw : JSON.stringify(normalizeCv(row.value), null, 2)
  return writeSnapshotFile(snapshotDir, 'cv', content)
}

export function listSnapshots(): string[] {
  return listSnapshotFiles(snapshotDir)
}

export async function restoreSnapshot(filename: unknown): Promise<KvPutResult> {
  // Never let a caller-supplied name escape the snapshot dir.
  if (!safeSnapshotName(filename)) return { ok: false, error: 'Invalid snapshot name' }
  const raw = readSnapshotFile(snapshotDir, filename)
  if (raw === null) return { ok: false, error: SNAPSHOT_NOT_FOUND }
  let data: any
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'Snapshot is not valid JSON' }
  }
  return await putKv('cvdata', normalizeCv(data))
}

export function readSnapshot(filename: unknown): string | null {
  return readSnapshotFile(snapshotDir, filename)
}
