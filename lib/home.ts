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

/**
 * Server-side HomeData IO: SQLite/R2-backed reader + writer + filesystem
 * snapshot helpers.
 *
 * The pure data shape (types, section keys, the `isSectionVisible`
 * helper) lives in `./homeShape` so client-bundled components can import
 * it without pulling in `better-sqlite3` / `node:fs`. This file is the
 * Node-only surface — never import it from anything under `components/`.
 */

export { HOME_SECTION_META, isSectionVisible, normalizeHomeWrite, publicHome } from './homeShape'
export type { HomeData, HomeFieldError, SectionKey } from './homeShape'
import type { HomeData } from './homeShape'
import { normalizeHomeWrite, publicHome } from './homeShape'

const homeSnapshotDir = path.join(process.cwd(), 'data', 'home_snapshots')

/** FULL home document — admin editors and server-only consumers. */
export function readHome(): HomeData | null {
  return getKvWithMeta<HomeData>('home').value
}

/** FULL home document plus its version (kv `updated_at`, 0 when no row). */
export function readHomeWithVersion(): { home: HomeData | null; version: number } {
  const row = getKvWithMeta<HomeData>('home')
  return { home: row.value, version: row.updatedAt }
}

/**
 * Home data for public pages and the unauthenticated API — hidden photos and
 * switched-off sections removed (see publicHome). Never ship readHome()
 * output to the browser.
 */
export function readPublicHome(): HomeData | null {
  return publicHome(readHome())
}

/**
 * Write the full document. Pass `precondition` for an atomic If-Match check.
 *
 * The owner-editable extras (availability, open-source picks, site name,
 * logo scales) are validated and normalised first (normalizeHomeWrite); a
 * document that fails is not stored. API routes validate up front to answer
 * with field-level errors — this is the last line of defence for every
 * other writer.
 */
export async function writeHome(data: HomeData, opts: KvPutOptions = {}): Promise<KvPutResult> {
  const checked = normalizeHomeWrite(data)
  if (!checked.ok) {
    return { ok: false, error: `Invalid home document: ${checked.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}` }
  }
  return await putKv('home', checked.home, opts)
}

/**
 * Snapshot the stored home document into data/home_snapshots (newest 100
 * kept). Skips the write when the newest snapshot is identical. A row that is
 * not valid JSON is snapshotted verbatim.
 */
export function saveHomeSnapshot(): string {
  const row = getKvWithMeta<HomeData>('home')
  const content = row.corrupt && row.raw !== null ? row.raw : JSON.stringify(row.value, null, 2)
  return writeSnapshotFile(homeSnapshotDir, 'home', content)
}

export function listHomeSnapshots(): string[] {
  return listSnapshotFiles(homeSnapshotDir)
}

export async function restoreHomeSnapshot(filename: unknown): Promise<KvPutResult> {
  if (!safeSnapshotName(filename)) return { ok: false, error: 'Invalid snapshot name' }
  const raw = readSnapshotFile(homeSnapshotDir, filename)
  if (raw === null) return { ok: false, error: SNAPSHOT_NOT_FOUND }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'Snapshot is not valid JSON' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'Snapshot does not contain a home document' }
  }
  return await putKv('home', data)
}

export function readHomeSnapshot(filename: unknown): string | null {
  return readSnapshotFile(homeSnapshotDir, filename)
}
