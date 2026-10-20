import type { MediaLibraryResponse, MediaMeta, MediaUsage } from '../../../lib/media/types'
import { fileToDataUrl, readJsonObject, uploadFilename } from '../shell/http'
import { UPLOAD_ACCEPT, UPLOAD_MAX_BYTES, uploadErrorMessage } from '../editor/upload'
import { wasStepUpCancelled } from '../security/stepUpClient'

/**
 * Client calls of the media library (H7): GET / POST /api/admin/media, the
 * upload route the library's queue sends files to, and "Replace file"
 * (POST /api/admin/media/replace). Failures resolve to `{ ok: false }` with
 * a message ready for a toast — never an unhandled rejection.
 */

/** `cancelled`: the owner closed the "Confirm it's you" dialog — show nothing. */
export type ApiResult<T> = { ok: true; status: number; body: T } | { ok: false; status: number; error: string; body: Record<string, any>; cancelled?: true }

const NETWORK = 'Network error — check your connection and try again.'

function errorText(status: number, body: Record<string, any>): string {
  if (status === 401) return 'Your session has expired — sign in again.'
  if (status === 429) return 'Too many changes in a short time — wait a moment and try again.'
  return typeof body.error === 'string' && body.error ? body.error : `Request failed (HTTP ${status}).`
}

export async function fetchLibrary(): Promise<ApiResult<MediaLibraryResponse>> {
  let res: Response
  try {
    res = await fetch('/api/admin/media', { cache: 'no-store', credentials: 'same-origin' })
  } catch {
    return { ok: false, status: 0, error: NETWORK, body: {} }
  }
  const body = await readJsonObject(res)
  if (!res.ok || !Array.isArray(body.items)) return { ok: false, status: res.status, error: errorText(res.status, body), body }
  return { ok: true, status: res.status, body: body as MediaLibraryResponse }
}

export type MediaAction =
  | { action: 'meta'; name: string; alt?: string; altZh?: string; caption?: string; captionZh?: string; expectedUpdatedAt?: number }
  | { action: 'apply-alt'; name: string }
  | { action: 'delete' | 'restore' | 'purge' | 'optimize' | 'r2-mirror' | 'r2-pull'; names: string[] }
  | { action: 'r2-scan' | 'refresh' }

export type BatchBody = {
  ok: boolean
  done: string[]
  failed: Array<{ name: string; code?: string; error: string; usage?: MediaUsage[] }>
  warnings?: string[]
  library?: MediaLibraryResponse
}

export type MetaBody = { ok: true; meta: MediaMeta | null; r2Warning?: string }
export type RewrittenDocBody = { kind: string; ref: string; title: string; references: number }
/** A document the server left unchanged because its new text would not render (lib/media/docRewrite). */
export type SkippedDocBody = RewrittenDocBody & { reason: string }
export type ApplyAltBody = {
  ok: true
  places: number
  rewrites: RewrittenDocBody[]
  revalidated: string[]
  revalidateFailed?: string[]
  warnings?: string[]
  skipped?: SkippedDocBody[]
  library: MediaLibraryResponse
}
export type OptimizeBody = { ok: true; processed: number; skipped: number; errors: Array<{ name: string; error: string }>; remaining: number; revalidated: string[]; library?: MediaLibraryResponse }

/**
 * POST /api/admin/media. `send` replaces `fetch` — a step-up fetch (useStepUp)
 * for the actions that need a recent sign-in ('purge').
 */
export async function postMedia<T = Record<string, any>>(
  payload: MediaAction,
  send: (input: string, init: RequestInit) => Promise<Response> = (input, init) => fetch(input, init),
): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await send('/api/admin/media', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    return { ok: false, status: 0, error: NETWORK, body: {} }
  }
  if (wasStepUpCancelled(res)) return { ok: false, status: res.status, error: '', body: {}, cancelled: true }
  const body = await readJsonObject(res)
  if (!res.ok) return { ok: false, status: res.status, error: errorText(res.status, body), body }
  return { ok: true, status: res.status, body: body as T }
}

/** Files the upload route accepts (also the pickers' `accept`). */
export const ACCEPT = UPLOAD_ACCEPT

/** Why a file cannot be uploaded at all, or null. */
export function fileProblem(file: File): string | null {
  if (!UPLOAD_ACCEPT.split(',').includes(file.type)) return `${file.name || 'This file'} is not a JPEG, PNG, WebP or GIF image.`
  if (file.size > UPLOAD_MAX_BYTES) return `${file.name || 'This image'} is over the 8 MB limit.`
  return null
}

export type UploadAttempt =
  | { ok: true; url: string; name: string; warning?: string }
  | { ok: false; error: string; status: number; /** Seconds to wait before trying again (429 / 503 BUSY). */ retryAfter: number | null }

const retryAfterOf = (res: Response) => {
  const v = Number(res.headers.get('Retry-After'))
  return Number.isFinite(v) && v > 0 ? Math.min(600, Math.ceil(v)) : null
}

async function postImage(endpoint: string, payload: Record<string, unknown>): Promise<{ res: Response | null; body: Record<string, any> }> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return { res, body: await readJsonObject(res) }
  } catch {
    return { res: null, body: {} }
  }
}

/** One upload through /api/admin/upload-image (the same pipeline as the editors). */
export async function uploadOne(file: File): Promise<UploadAttempt> {
  const problem = fileProblem(file)
  if (problem) return { ok: false, error: problem, status: 400, retryAfter: null }
  let dataUrl: string
  try {
    dataUrl = await fileToDataUrl(file)
  } catch {
    return { ok: false, error: 'Could not read that file.', status: 0, retryAfter: null }
  }
  const { res, body } = await postImage('/api/admin/upload-image', { filename: uploadFilename(file.name || 'image'), dataUrl })
  if (!res) return { ok: false, error: NETWORK, status: 0, retryAfter: null }
  if (!res.ok) {
    const wait = res.status === 429 || res.status === 503 ? retryAfterOf(res) ?? 30 : null
    return { ok: false, error: uploadErrorMessage(res.status, body), status: res.status, retryAfter: wait }
  }
  if (typeof body.url !== 'string') return { ok: false, error: 'Upload failed — the server returned no URL.', status: res.status, retryAfter: null }
  const name = decodeURIComponent(body.url.replace(/^\/uploads\//, ''))
  return { ok: true, url: body.url, name, warning: typeof body.r2Warning === 'string' ? body.r2Warning : undefined }
}

export type ReplaceBody = {
  ok: true
  from: string
  name: string
  url: string
  rewrites: RewrittenDocBody[]
  revalidated: string[]
  revalidateFailed?: string[]
  warnings?: string[]
  skipped?: SkippedDocBody[]
  library: MediaLibraryResponse
}

/** Replace an upload's file (POST /api/admin/media/replace). */
export async function replaceFile(name: string, file: File): Promise<ApiResult<ReplaceBody>> {
  const problem = fileProblem(file)
  if (problem) return { ok: false, status: 400, error: problem, body: {} }
  let dataUrl: string
  try {
    dataUrl = await fileToDataUrl(file)
  } catch {
    return { ok: false, status: 0, error: 'Could not read that file.', body: {} }
  }
  const { res, body } = await postImage('/api/admin/media/replace', { name, filename: uploadFilename(file.name || 'image'), dataUrl })
  if (!res) return { ok: false, status: 0, error: NETWORK, body: {} }
  if (!res.ok) return { ok: false, status: res.status, error: res.status === 413 || res.status === 415 ? uploadErrorMessage(res.status, body) : errorText(res.status, body), body }
  return { ok: true, status: res.status, body: body as ReplaceBody }
}
