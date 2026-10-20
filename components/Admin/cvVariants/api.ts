/**
 * Client side of the CV variants admin API (E4): pages/api/admin/cv-variants
 * and pages/api/admin/cv-share-links. The interpret* parts are pure.
 */

import type { CvLang } from '../../../lib/cvVisibility'
import type { CvVariant } from '../../../lib/cvVariants'
import type { ShareLink } from '../../../lib/cvShare/links'
import { readJsonObject } from '../shell/http'

export const VARIANTS_URL = '/api/admin/cv-variants'
export const LINKS_URL = '/api/admin/cv-share-links'

export type VariantsRead =
  | { kind: 'ok'; variants: CvVariant[]; etag: string | null; keyConfigured: boolean }
  | { kind: 'unauthorized' }
  | { kind: 'error'; error: string }

export type VariantsSave =
  | { kind: 'ok'; variants: CvVariant[]; etag: string | null; revoked: number; warning?: string }
  | { kind: 'conflict' }
  | { kind: 'invalid'; error: string; path: Array<string | number> | null }
  | { kind: 'unauthorized' }
  | { kind: 'error'; error: string }

export type Measured = { pages: number; lastPageFill: number } | null
export type Measurement = Record<CvLang, Measured>

const json = { 'Content-Type': 'application/json' }

export async function readVariantsDoc(): Promise<VariantsRead> {
  try {
    const res = await fetch(VARIANTS_URL, { cache: 'no-store', credentials: 'same-origin' })
    if (res.status === 401 || res.status === 403) return { kind: 'unauthorized' }
    const body = await readJsonObject(res)
    if (!res.ok || !Array.isArray(body.variants)) return { kind: 'error', error: body.error || `Server responded ${res.status}` }
    return { kind: 'ok', variants: body.variants, etag: res.headers.get('ETag'), keyConfigured: body.keyConfigured === true }
  } catch {
    return { kind: 'error', error: 'Network error — check the connection and retry.' }
  }
}

export function interpretVariantsSave(status: number, etag: string | null, body: Record<string, any>): VariantsSave {
  if (status === 401 || status === 403) return { kind: 'unauthorized' }
  if (status === 409) return { kind: 'conflict' }
  if (status === 422) {
    const first = Array.isArray(body.errors) ? body.errors[0] : null
    return { kind: 'invalid', error: String(body.error || 'A value is not valid.'), path: first && Array.isArray(first.path) ? first.path : null }
  }
  if (status >= 200 && status < 300 && Array.isArray(body.variants)) {
    return { kind: 'ok', variants: body.variants, etag, revoked: Number(body.revoked) || 0, ...(body.r2Warning ? { warning: String(body.r2Warning) } : {}) }
  }
  return { kind: 'error', error: String(body.error || `Server responded ${status}`) }
}

export async function saveVariantsDoc(variants: CvVariant[], etag: string | null): Promise<VariantsSave> {
  try {
    const res = await fetch(VARIANTS_URL, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { ...json, ...(etag ? { 'If-Match': etag } : {}) },
      body: JSON.stringify({ variants }),
    })
    return interpretVariantsSave(res.status, res.headers.get('ETag'), await readJsonObject(res))
  } catch {
    return { kind: 'error', error: 'Network error — nothing was saved.' }
  }
}

export async function measureVariant(variant: CvVariant, signal?: AbortSignal): Promise<Measurement | null> {
  const res = await fetch(VARIANTS_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: json,
    body: JSON.stringify({ action: 'measure', variant }),
    signal,
  })
  if (!res.ok) return null
  const body = await readJsonObject(res)
  const one = (v: any): Measured => (v && typeof v.pages === 'number' ? { pages: v.pages, lastPageFill: typeof v.lastPageFill === 'number' ? v.lastPageFill : 1 } : null)
  return { en: one(body.en), zh: one(body.zh) }
}

/** The saved variant's PDF, as its links serve it. */
export function variantPdfHref(id: string, lang: CvLang): string {
  return `${VARIANTS_URL}?pdf=${encodeURIComponent(id)}&lang=${lang}`
}

export async function readLinks(): Promise<ShareLink[] | null> {
  try {
    const res = await fetch(LINKS_URL, { cache: 'no-store', credentials: 'same-origin' })
    if (!res.ok) return null
    const body = await readJsonObject(res)
    return Array.isArray(body.links) ? body.links : null
  } catch {
    return null
  }
}
