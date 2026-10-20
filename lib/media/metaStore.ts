import { getKvWithMeta, putKv } from '../contentStore'
import { MEDIA_META_KEY, cleanMeta, isEmptyMeta, readMetaDoc, type MediaMetaDoc, type MediaMetaInput } from './meta'
import type { MediaMeta } from './types'

/**
 * The media library's default texts in the kv row `media-library`
 * (SERVER-ONLY; shapes and cleaning in ./meta). A kv row: written through
 * putKv, so it is mirrored to R2, reconciled by the boot sync, covered by
 * the scheduled backups' change detection and restored with the content.
 */

export function readMediaMeta(): { doc: MediaMetaDoc; updatedAt: number } {
  const row = getKvWithMeta<unknown>(MEDIA_META_KEY)
  return { doc: readMetaDoc(row.value), updatedAt: row.updatedAt }
}

type MetaUpdate = { ok: true; r2Warning?: string } | { ok: false; error: string }

/**
 * Change the stored texts with `mutate` (returns false when nothing
 * changed). The read and the write happen in one synchronous step, so two
 * requests of this process never interleave; the kv precondition catches a
 * write from anywhere else, and the change is then re-applied on top of it.
 */
async function updateMetaDoc(mutate: (items: Record<string, MediaMeta>) => boolean): Promise<MetaUpdate> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { doc, updatedAt } = readMediaMeta()
    const items = { ...doc.items }
    if (!mutate(items)) return { ok: true }
    const result = await putKv(MEDIA_META_KEY, { v: 1, items }, { precondition: (at) => at === updatedAt })
    if (result.ok) return result.r2Warning ? { ok: true, r2Warning: result.r2Warning } : { ok: true }
    if (!result.conflict) return { ok: false, error: result.error }
  }
  return { ok: false, error: 'The image texts kept changing while saving; try again' }
}

export type SaveMetaResult =
  | { ok: true; meta: MediaMeta | null; r2Warning?: string }
  | { ok: false; status: 409; error: string; current: MediaMeta | null }
  | { ok: false; status: 500; error: string }

const sameTexts = (a: Omit<MediaMeta, 'updatedAt'>, b: Omit<MediaMeta, 'updatedAt'>) =>
  a.alt === b.alt && a.altZh === b.altZh && a.caption === b.caption && a.captionZh === b.captionZh

const textsOf = (m: MediaMeta): Omit<MediaMeta, 'updatedAt'> => ({ alt: m.alt, altZh: m.altZh, caption: m.caption, captionZh: m.captionZh })

/**
 * Save the default texts of one upload (fields left out keep their value;
 * all empty removes the entry). `expectedUpdatedAt` — the version the form
 * was opened with, 0 for none — turns a save from a stale form into a 409
 * that carries the current texts.
 */
export async function saveMediaMeta(name: string, input: MediaMetaInput, expectedUpdatedAt?: number, now = Date.now()): Promise<SaveMetaResult> {
  let saved: MediaMeta | null = null
  let conflict: MediaMeta | null | undefined
  const out = await updateMetaDoc((items) => {
    const current = items[name] ?? null
    if (expectedUpdatedAt !== undefined && (current?.updatedAt ?? 0) !== expectedUpdatedAt) {
      conflict = current
      return false
    }
    const next = cleanMeta(input, current ? textsOf(current) : undefined)
    if (isEmptyMeta(next)) {
      saved = null
      if (!current) return false
      delete items[name]
      return true
    }
    if (current && sameTexts(textsOf(current), next)) {
      saved = current
      return false
    }
    saved = { ...next, updatedAt: Math.max(now, (current?.updatedAt ?? 0) + 1) }
    items[name] = saved
    return true
  })
  if (conflict !== undefined) return { ok: false, status: 409, error: 'These texts were changed elsewhere since you opened them', current: conflict }
  if (!out.ok) return { ok: false, status: 500, error: out.error }
  return { ok: true, meta: saved, ...(out.r2Warning ? { r2Warning: out.r2Warning } : {}) }
}

/** Remove one upload's texts and return them (it moves to the trash). */
export async function takeMediaMeta(name: string): Promise<Omit<MediaMeta, 'updatedAt'> | null> {
  let taken: Omit<MediaMeta, 'updatedAt'> | null = null
  await updateMetaDoc((items) => {
    const cur = items[name]
    if (!cur) return false
    taken = textsOf(cur)
    delete items[name]
    return true
  })
  return taken
}

/** Give texts to an upload that has none: a restore from the trash, or the file that replaced it. */
export async function giveMediaMeta(name: string, meta: Omit<MediaMeta, 'updatedAt'> | null, now = Date.now()): Promise<void> {
  if (!meta) return
  const clean = cleanMeta(meta)
  if (isEmptyMeta(clean)) return
  await updateMetaDoc((items) => {
    if (items[name]) return false
    items[name] = { ...clean, updatedAt: now }
    return true
  })
}
