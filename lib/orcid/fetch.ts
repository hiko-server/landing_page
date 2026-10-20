/**
 * Reading a public ORCID record's works — SERVER-ONLY (the browser never
 * talks to ORCID: connect-src is this origin). Every request goes through
 * lib/security/safeFetch (public addresses only, pinned DNS, time and size
 * caps) to ONE allow-listed host, `pub.orcid.org`; a redirect anywhere is
 * not followed. Outcomes are explicit so the API route can answer each with
 * a clear message:
 *
 *   ok          the works (mapped, details applied where they loaded)
 *   not-found   ORCID knows no such record (404)
 *   busy        ORCID rate-limited or is unavailable (429 / 5xx), with its Retry-After
 *   timeout     the request budget ran out
 *   malformed   not JSON, or not the works shape (an HTML error page, XML)
 *   unreachable DNS, network or a blocked / redirected address
 *
 * The follow-up requests (the full works, for authors and abstracts — up to
 * 100 per call) are best effort: when one fails the candidates it did not
 * reach come back from the summaries alone and `detailsFailed` says how many
 * are missing their authors.
 */

import { SafeFetchError, safeFetch, type SafeFetchOptions, type SafeFetchResult } from '../security/safeFetch'
import { normalizeOrcidId } from './id'
import { DETAILS_BATCH, applyWorkDetails, mapOrcidWorks, type OrcidWorkCandidate } from './works'

export const ORCID_API_HOST = 'pub.orcid.org'
export const ORCID_API_BASE = `https://${ORCID_API_HOST}/v3.0`

/** Whole-request budgets (ms) and body caps (bytes). */
export const WORKS_TIMEOUT_MS = 8_000
export const DETAILS_TIMEOUT_MS = 10_000
/** All detail reads together (up to MAX_WORKS / DETAILS_BATCH calls). */
export const DETAILS_BUDGET_MS = 15_000
const WORKS_MAX_BYTES = 4 * 1024 * 1024
const DETAILS_MAX_BYTES = 8 * 1024 * 1024

export type Fetcher = (url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>

const now = () => Date.now()

export type OrcidJsonResult =
  | { kind: 'ok'; json: unknown }
  | { kind: 'not-found' }
  | { kind: 'busy'; status: number; retryAfterS: number | null }
  | { kind: 'timeout' }
  | { kind: 'malformed'; detail: string }
  | { kind: 'unreachable'; detail: string }

export type OrcidWorksResult =
  | { kind: 'ok'; candidates: OrcidWorkCandidate[]; detailsFailed: number }
  | Exclude<OrcidJsonResult, { kind: 'ok' }>

const retryAfterOf = (h: string | string[] | undefined): number | null => {
  const v = Array.isArray(h) ? h[0] : h
  const n = Number(v)
  return v !== undefined && Number.isFinite(n) && n >= 0 ? Math.min(3600, Math.round(n)) : null
}

/** GET one ORCID public API path (relative to ORCID_API_BASE) as JSON. */
export async function fetchOrcidJson(path: string, fetcher: Fetcher = safeFetch, timeoutMs = WORKS_TIMEOUT_MS, maxBytes = WORKS_MAX_BYTES): Promise<OrcidJsonResult> {
  const url = `${ORCID_API_BASE}${path}`
  if (new URL(url).host !== ORCID_API_HOST) return { kind: 'unreachable', detail: 'Only pub.orcid.org is allowed' }
  let res: SafeFetchResult
  try {
    res = await fetcher(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      timeoutMs,
      maxBytes,
      // A redirect would leave the allow-listed host: never followed.
      redirect: 'manual',
    })
  } catch (err) {
    if (err instanceof SafeFetchError) {
      if (err.code === 'TIMEOUT') return { kind: 'timeout' }
      if (err.code === 'TOO_LARGE') return { kind: 'malformed', detail: 'The answer was too large' }
      return { kind: 'unreachable', detail: err.message }
    }
    return { kind: 'unreachable', detail: err instanceof Error ? err.message : 'Network error' }
  }
  if (res.status === 404) return { kind: 'not-found' }
  if (res.status === 429 || res.status >= 500) return { kind: 'busy', status: res.status, retryAfterS: retryAfterOf(res.headers['retry-after']) }
  if (res.status >= 300 && res.status < 400) return { kind: 'unreachable', detail: `ORCID redirected (${res.status})` }
  if (res.status !== 200) return { kind: 'malformed', detail: `ORCID answered ${res.status}` }
  const type = String(res.headers['content-type'] || '')
  if (!/json/i.test(type)) return { kind: 'malformed', detail: `Not JSON (${type.split(';')[0] || 'no content type'})` }
  try {
    return { kind: 'ok', json: JSON.parse(res.body.toString('utf8')) }
  } catch {
    return { kind: 'malformed', detail: 'The answer was not valid JSON' }
  }
}

/**
 * The works of a public ORCID record as publication candidates. `id` is
 * validated and normalised first (an invalid iD is 'not-found' here; the
 * route refuses it earlier with 400). Details (authors, abstracts) are
 * fetched in batches of DETAILS_BATCH, best effort, within DETAILS_BUDGET_MS.
 */
export async function fetchOrcidWorks(id: unknown, fetcher: Fetcher = safeFetch): Promise<OrcidWorksResult> {
  const orcid = normalizeOrcidId(id)
  if (!orcid) return { kind: 'not-found' }
  const works = await fetchOrcidJson(`/${orcid}/works`, fetcher)
  if (works.kind !== 'ok') return works
  const mapped = mapOrcidWorks(works.json)
  if (!mapped) return { kind: 'malformed', detail: 'Not the shape of an ORCID works answer' }
  if (!mapped.length) return { kind: 'ok', candidates: [], detailsFailed: 0 }

  // The full works, DETAILS_BATCH put-codes per call, within one overall
  // budget; the first failure stops the reads (ORCID is busy or slow), and
  // what loaded so far is kept.
  let candidates = mapped
  let loaded = 0
  const deadline = now() + DETAILS_BUDGET_MS
  for (let i = 0; i < mapped.length; i += DETAILS_BATCH) {
    const left = deadline - now()
    if (left < 1_000) break
    const codes = mapped.slice(i, i + DETAILS_BATCH).map((c) => c.putCode)
    const details = await fetchOrcidJson(`/${orcid}/works/${codes.join(',')}`, fetcher, Math.min(DETAILS_TIMEOUT_MS, left), DETAILS_MAX_BYTES)
    if (details.kind !== 'ok') break
    const applied = applyWorkDetails(candidates, details.json)
    candidates = applied.candidates
    loaded += applied.loaded
  }
  return { kind: 'ok', candidates, detailsFailed: Math.max(0, mapped.length - loaded) }
}
