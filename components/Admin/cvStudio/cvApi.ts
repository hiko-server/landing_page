/**
 * Client side of the CV admin API, shared by the Studio and the Raw JSON
 * editor.
 *
 *   GET /api/admin/cvdata   FULL document (visibility metadata included).
 *                           Must answer `X-CV-View: admin`; anything else
 *                           (a public / pruned view, a login page after a
 *                           redirect) is treated as an expired session and
 *                           its body is never used.
 *   PUT /api/cvdata         Conditional on `If-Match: <etag>`; 409 means the
 *                           server copy changed and nothing was written.
 *
 * The interpret* functions are pure so the protocol rules are unit-tested.
 */

export const ADMIN_CV_URL = '/api/admin/cvdata'
export const CV_PUT_URL = '/api/cvdata'
export const LOGIN_HREF = `/admin/login?next=${encodeURIComponent('/admin/dashboard?tab=cv')}`
export const DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14
/** If-Match value that never equals a server ETag — for drafts whose base version is unknown. */
export const UNKNOWN_BASE = '"unknown-base"'

export type CvBody = { en: any[]; zh: any[] }

export type AdminCvRead =
  | { kind: 'ok'; doc: CvBody; etag: string | null }
  | { kind: 'unauthorized' }
  | { kind: 'error'; error: string }

export type SaveOutcome =
  | { kind: 'ok'; etag: string | null; warning?: string }
  | { kind: 'conflict'; etag: string | null; message?: string }
  | { kind: 'unauthorized' }
  | { kind: 'error'; error: string }

const isSectionArray = (v: unknown): v is any[] =>
  Array.isArray(v) && v.every((s) => !!s && typeof s === 'object' && typeof (s as any).sessionName === 'string')

/** Decide what a GET /api/admin/cvdata response means. `body` is the parsed JSON (undefined when it was not JSON). */
export function interpretAdminRead(status: number, view: string | null, etag: string | null, body: unknown): AdminCvRead {
  if (status === 401 || status === 403) return { kind: 'unauthorized' }
  if (status < 200 || status >= 300) return { kind: 'error', error: `Server responded ${status}` }
  // Only the admin view may be edited: a public (pruned) copy would silently
  // delete every hidden field on the next save.
  if ((view || '').trim().toLowerCase() !== 'admin') return { kind: 'unauthorized' }
  const b = body as any
  if (!b || typeof b !== 'object' || !isSectionArray(b.en ?? []) || !isSectionArray(b.zh ?? [])) {
    return { kind: 'error', error: 'The server sent an unexpected CV document.' }
  }
  return { kind: 'ok', doc: { en: Array.isArray(b.en) ? b.en : [], zh: Array.isArray(b.zh) ? b.zh : [] }, etag: etag || null }
}

/** Decide what a PUT /api/cvdata response means. */
export function interpretSave(status: number, etagHeader: string | null, body: unknown): SaveOutcome {
  const b = (body && typeof body === 'object' ? body : {}) as any
  const etag = typeof b.etag === 'string' && b.etag ? b.etag : etagHeader || null
  if (status === 409) return { kind: 'conflict', etag, message: typeof b.message === 'string' ? b.message : undefined }
  if (status === 401 || status === 403) return { kind: 'unauthorized' }
  if (status < 200 || status >= 300) return { kind: 'error', error: (typeof b.error === 'string' && b.error) || `Save failed (${status})` }
  const warning = typeof b.r2Warning === 'string' ? b.r2Warning : typeof b.warning === 'string' ? b.warning : undefined
  return { kind: 'ok', etag, warning }
}

export async function readAdminCv(): Promise<AdminCvRead> {
  try {
    const res = await fetch(ADMIN_CV_URL, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
    const view = res.headers.get('X-CV-View')
    // Parse only a response that could be used; never read a non-admin body.
    const body = res.ok && (view || '').toLowerCase() === 'admin' ? await res.json().catch(() => undefined) : undefined
    return interpretAdminRead(res.status, view, res.headers.get('ETag'), body)
  } catch (e: any) {
    return { kind: 'error', error: e?.message || 'Network error' }
  }
}

/** PUT the document; `ifMatch` null sends an unconditional write. */
export async function saveCv(doc: CvBody, ifMatch: string | null): Promise<SaveOutcome> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (ifMatch) headers['If-Match'] = ifMatch
    const res = await fetch(CV_PUT_URL, {
      method: 'PUT',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({ en: doc.en, zh: doc.zh }),
    })
    const body = await res.json().catch(() => undefined)
    return interpretSave(res.status, res.headers.get('ETag'), body)
  } catch (e: any) {
    return { kind: 'error', error: e?.message || 'Network error' }
  }
}
