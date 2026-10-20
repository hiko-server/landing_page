/**
 * "Connect your ORCID iD" — the words and decisions the CV Studio shows
 * (pure, shared by the server routes and the browser; no server imports).
 *
 *   - where the flow returns: /admin/dashboard?tab=cv&orcid=connected
 *     (…&replaced=1) or …&orcid=error&reason=<reason>, and the toast each
 *     one becomes (orcidConnectNotice);
 *   - what the Personal Info row shows next to the iD field
 *     (orcidConnectPanel): connected / changed since connecting /
 *     unauthenticated / not configured on the server / save first / loading.
 */

import { canonicalOrcid } from './uri'
import { orcidAuthMarkerOf } from './marker'

/** The Studio, where the flow returns. */
export const STUDIO_PATH = '/admin/dashboard'

/** The flow's routes (pages/api/admin/orcid; lib/orcid/connectRoute). */
export const ORCID_CONNECT_PATH = '/api/admin/orcid/connect'
export const ORCID_CALLBACK_PATH = '/api/admin/orcid/callback'
export const ORCID_CONNECTION_PATH = '/api/admin/orcid/connection'

/** README section on registering the ORCID client (the disabled button links here). */
export const ORCID_SETUP_DOCS_URL = 'https://github.com/hiko-server/landing_page#connect-your-orcid-id'

export const ORCID_CONNECT_REASONS = [
  'config',
  'host',
  'session',
  'state',
  'expired',
  'denied',
  'orcid',
  'client',
  'exchange',
  'busy',
  'timeout',
  'unreachable',
  'malformed',
  'nopi',
  'save',
  'rate',
] as const
export type OrcidConnectReason = (typeof ORCID_CONNECT_REASONS)[number]

export type OrcidConnectOutcome = { result: 'connected'; replaced?: boolean } | { result: 'error'; reason: OrcidConnectReason }

/** The Studio address an outcome returns to (a same-origin path). */
export function studioReturnPath(outcome: OrcidConnectOutcome): string {
  const q = new URLSearchParams({ tab: 'cv' })
  if (outcome.result === 'connected') {
    q.set('orcid', 'connected')
    if (outcome.replaced) q.set('replaced', '1')
  } else {
    q.set('orcid', 'error')
    q.set('reason', outcome.reason)
  }
  return `${STUDIO_PATH}?${q.toString()}`
}

export type OrcidNotice = { status: 'success' | 'error' | 'warning'; title: string; description: string }

const REASON_TEXT: Record<OrcidConnectReason, Omit<OrcidNotice, 'status'> & { status?: OrcidNotice['status'] }> = {
  config: {
    title: 'ORCID is not set up on the server',
    description: 'Connecting needs ORCID_CLIENT_ID and ORCID_CLIENT_SECRET (a free ORCID Public API client). Nothing changed.',
  },
  host: {
    title: 'Open the Studio at the site’s own address',
    description: 'ORCID returns to the address registered for this site (SITE_URL), so connect from there. Nothing changed.',
  },
  session: {
    title: 'Your admin session changed during the ORCID sign-in',
    description: 'The session that started connecting ended or is not this one. Connect again from this browser. Nothing changed.',
  },
  state: {
    title: 'This ORCID sign-in could not be matched',
    description: 'The link back from ORCID was already used or does not belong to this browser. Connect again. Nothing changed.',
  },
  expired: {
    title: 'The ORCID sign-in took too long',
    description: 'Connecting has to finish within 10 minutes. Connect again. Nothing changed.',
  },
  denied: {
    status: 'warning',
    title: 'Not connected',
    description: 'You cancelled on ORCID, so nothing changed. The iD stays as it was.',
  },
  orcid: {
    title: 'ORCID could not complete the sign-in',
    description: 'ORCID sent back an error instead of a sign-in. Try again; if it repeats, check the client in ORCID’s developer tools. Nothing changed.',
  },
  client: {
    title: 'ORCID refused this site’s client credentials',
    description: 'Check ORCID_CLIENT_ID, ORCID_CLIENT_SECRET and ORCID_ENV (sandbox and production clients are separate). Nothing changed.',
  },
  exchange: {
    title: 'ORCID did not confirm the sign-in',
    description: 'The one-time code from ORCID was refused (expired, already used, or the redirect URI does not match the registered one). Connect again. Nothing changed.',
  },
  busy: {
    title: 'ORCID is busy or unavailable',
    description: 'Try again in a minute. Nothing changed.',
  },
  timeout: {
    title: 'ORCID did not answer in time',
    description: 'Try again. Nothing changed.',
  },
  unreachable: {
    title: 'ORCID could not be reached from the server',
    description: 'Try again later. Nothing changed.',
  },
  malformed: {
    title: 'ORCID’s answer could not be read',
    description: 'It did not contain an ORCID iD. Try again later. Nothing changed.',
  },
  nopi: {
    title: 'Add Personal Info first',
    description: 'The CV has no Personal Info section to hold the iD. Add it, save, then connect. Nothing changed.',
  },
  save: {
    title: 'ORCID confirmed your iD, but saving it failed',
    description: 'The CV could not be written. Try connecting again.',
  },
  rate: {
    title: 'Too many attempts',
    description: 'Wait a few minutes before connecting again. Nothing changed.',
  },
}

const isReason = (v: unknown): v is OrcidConnectReason => typeof v === 'string' && (ORCID_CONNECT_REASONS as readonly string[]).includes(v)
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v)

/** The toast for a return from the flow (the Studio's query), or null when the query is not one. */
export function orcidConnectNotice(query: Record<string, unknown>): OrcidNotice | null {
  const kind = first(query.orcid)
  if (kind === 'connected') {
    return {
      status: 'success',
      title: 'ORCID iD connected',
      description:
        first(query.replaced) === '1'
          ? 'ORCID confirmed your iD, and it replaced the one typed in Personal Info. The CV, /about and /publications show it as authenticated.'
          : 'ORCID confirmed your iD. The CV, /about and /publications show it as authenticated.',
    }
  }
  if (kind !== 'error') return null
  const reason = first(query.reason)
  const text = isReason(reason) ? REASON_TEXT[reason] : REASON_TEXT.orcid
  return { status: text.status || 'error', title: text.title, description: text.description }
}

/** The query keys the flow adds (removed from the address once the toast is shown). */
export const ORCID_RETURN_KEYS = ['orcid', 'reason', 'replaced'] as const

/** What GET /api/admin/orcid/connection answers. */
export type OrcidConnectStatus = {
  configured: boolean
  env: 'production' | 'sandbox'
  /** Why it is not configured: no credentials, a malformed client ID, an unknown ORCID_ENV. */
  problem?: 'missing' | 'client-id' | 'env'
  /** The redirect URI to register with ORCID (null when it cannot be derived). */
  redirectUri: string | null
}

export type OrcidConnectPanel =
  | { kind: 'loading' }
  | { kind: 'unconfigured'; problem: 'missing' | 'client-id' | 'env' | 'unknown' }
  | { kind: 'dirty' }
  | { kind: 'connected'; id: string; at: string; dirty: boolean }
  | { kind: 'unauthenticated'; hasId: boolean }

/**
 * The Personal Info row's state. `status` is the server's answer (null while
 * loading, 'error' when it could not be read); `pi` is the unsaved Personal
 * Info of the language being edited; `dirty` whether the document has
 * unsaved changes (connecting and disconnecting write the stored CV and
 * reload the Studio, so they wait for a save).
 */
export function orcidConnectPanel(input: { status: OrcidConnectStatus | null | 'error'; pi: unknown; dirty: boolean }): OrcidConnectPanel {
  const marker = orcidAuthMarkerOf(input.pi)
  const raw = input.pi && typeof input.pi === 'object' ? (input.pi as Record<string, unknown>).orcid : undefined
  const current = canonicalOrcid(raw)
  // A confirmed iD shows as connected whatever the server setup (disconnecting needs no credentials).
  if (marker && current === marker.id) return { kind: 'connected', id: marker.id, at: marker.at || '', dirty: input.dirty }
  if (input.status === null) return { kind: 'loading' }
  if (input.status === 'error') return { kind: 'unconfigured', problem: 'unknown' }
  if (!input.status.configured) return { kind: 'unconfigured', problem: input.status.problem || 'missing' }
  if (input.dirty) return { kind: 'dirty' }
  return { kind: 'unauthenticated', hasId: typeof raw === 'string' && !!raw.trim() }
}

/** The one-line explanation under the iD field for a panel state. */
export function orcidConnectLine(panel: OrcidConnectPanel, formatDate: (iso: string) => string = (iso) => iso.slice(0, 10)): string {
  switch (panel.kind) {
    case 'loading':
      return 'Checking the ORCID setup…'
    case 'unconfigured':
      return panel.problem === 'client-id'
        ? 'ORCID_CLIENT_ID is not an ORCID client ID (APP-…), so connecting is off.'
        : panel.problem === 'env'
          ? 'ORCID_ENV must be production or sandbox, so connecting is off.'
          : panel.problem === 'unknown'
            ? 'The ORCID setup could not be checked. Reload to try again.'
            : 'Connecting needs ORCID API credentials on the server (ORCID_CLIENT_ID, ORCID_CLIENT_SECRET).'
    case 'dirty':
      return 'Save or undo your changes first: connecting leaves the Studio and comes back.'
    case 'connected': {
      const when = panel.at ? `Authenticated: you signed in to ORCID on ${formatDate(panel.at)}.` : 'Authenticated by signing in to ORCID.'
      return panel.dirty ? `${when} Save or undo your changes to disconnect.` : `${when} Shown with ORCID’s iD icon.`
    }
    case 'unauthenticated':
      return panel.hasId
        ? 'Typed in, so it shows as “(unauthenticated)”. Sign in to ORCID to prove it is yours.'
        : 'Sign in to ORCID to fill in your iD, shown as authenticated.'
  }
}
