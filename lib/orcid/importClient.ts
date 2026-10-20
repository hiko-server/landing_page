/**
 * The CV Studio side of "Import from ORCID" (components/Admin/cvStudio/
 * OrcidImportDialog): the route it calls, what it ticks by default and the
 * sentence it shows for each answer that is not the works. Pure and
 * client-safe, so the decisions are unit-tested without a browser.
 */

import type { DedupedCandidate, OrcidWorkCandidate } from './works'
import type { OrcidWorksErrorCode } from './route'

export const ORCID_WORKS_URL = '/api/admin/orcid/works'

/** The JSON of POST /api/admin/orcid/works (lib/orcid/route): the works, or an error with its code. */
export type OrcidWorksBody = {
  orcid?: string
  fetchedAt?: string
  candidates?: OrcidWorkCandidate[]
  detailsFailed?: number
  error?: string
  code?: OrcidWorksErrorCode | string
  retryAfter?: number
}

export type ImportError = {
  message: string
  /** "Try again" is offered (a later read may work). */
  retry: boolean
  /** The session ended: offer "Sign in again" instead. */
  signIn: boolean
}

/** "2 minutes" / "a minute" for a Retry-After in seconds. */
function waitFor(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 60) return 'a minute'
  const m = Math.ceil(seconds / 60)
  return `${m} minutes`
}

/** The sentence for an answer of the route that is not the works. */
export function importErrorMessage(status: number, body: OrcidWorksBody | undefined): ImportError {
  const code = body?.code || ''
  const say = (message: string, retry: boolean, signIn = false): ImportError => ({ message, retry, signIn })
  if (status === 401 || status === 403) return say('Your session has ended. Sign in again, then run the import — your unsaved edits stay in this browser.', false, true)
  switch (code) {
    case 'BAD_ORCID':
      return say('The ORCID iD in Personal Info is not valid. Fix it there, then try again.', false)
    case 'NOT_FOUND':
      return say('ORCID has no public record for this iD. Check the iD in Personal Info — every digit counts.', false)
    case 'RATE_LIMITED':
      return say(`Too many ORCID reads in a short time. Try again in ${waitFor(body?.retryAfter)}.`, true)
    case 'UPSTREAM_BUSY':
      return say(`ORCID is busy or unavailable right now. Try again in ${waitFor(body?.retryAfter)}.`, true)
    case 'TIMEOUT':
      return say('ORCID did not answer in time. Try again.', true)
    case 'MALFORMED':
      return say('ORCID’s answer could not be read. Try again later — if it keeps happening, ORCID may have changed its API.', true)
    case 'UNREACHABLE':
      return say('ORCID could not be reached from the server. Check the server’s network, then try again.', true)
    default:
      break
  }
  if (body?.error) return say(body.error, true)
  return say(`The import failed (${status}). Try again.`, true)
}

/** Default selection: new papers only (never a work already on the CV, never a patent / dataset / software). */
export function defaultSelection(candidates: readonly DedupedCandidate[]): Set<number> {
  return new Set(candidates.filter((c) => c.paper && !c.existing).map((c) => c.putCode))
}
