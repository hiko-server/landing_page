/**
 * "Connect your ORCID iD" — ORCID's OAuth 2.0 sign-in, used for one thing:
 * the owner proves which iD is theirs, so the site may show it with ORCID's
 * authenticated iD icon (ORCID's iD display guidelines show a typed-in iD
 * with the unauthenticated icon and "(unauthenticated)"). SERVER-ONLY.
 *
 * The three-legged authorization-code flow of a Public API client
 * (https://info.orcid.org/documentation/api-tutorials/api-tutorial-get-and-authenticated-orcid-id/):
 *
 *   1. the browser goes to https://orcid.org/oauth/authorize?client_id=…
 *      &response_type=code&scope=/authenticate&redirect_uri=…&state=…
 *   2. ORCID sends it back to the redirect URI with `code` and `state`
 *      (or `error=access_denied` when the owner cancels);
 *   3. the server POSTs the code with the client secret to
 *      https://orcid.org/oauth/token and reads `orcid` (and `name`) from the
 *      answer. That server-to-server answer, over TLS to the allow-listed
 *      host, is the authenticated iD.
 *
 * Choices (each from ORCID's documentation):
 *   - scope `/authenticate`: ORCID's "get the authenticated iD" scope.
 *     `openid` grants the same and adds an id_token, which would only have
 *     to be verified to learn what the token answer already says. Nothing
 *     else is requested — no read or write access to the record.
 *   - the access token in the answer is never stored, logged or returned
 *     (`exchangeOrcidCode` does not even read it): `/authenticate` needs
 *     nothing after the iD is known.
 *   - no PKCE: ORCID does not advertise it (its OpenID configuration at
 *     https://orcid.org/.well-known/openid-configuration has no
 *     `code_challenge_methods_supported`), this client is confidential (the
 *     secret never leaves the server, `client_secret_post` is the one method
 *     it lists), and the `state` is random, single-use, short-lived and bound
 *     to the admin session that started the flow (lib/orcid/flow) — which is
 *     what PKCE would add for a public client.
 *   - ORCID_ENV=sandbox points everything at https://sandbox.orcid.org (test
 *     records, its own client registration) for trying the flow out.
 *
 * Every request goes through lib/security/safeFetch to the one host of the
 * configured environment; a POST is never redirected (safeFetch).
 */

import { SafeFetchError, safeFetch } from '../security/safeFetch'
import { canonicalOrcid } from './uri'
import type { Fetcher } from './fetch'

export type OrcidEnv = 'production' | 'sandbox'

/** The environment variables read here (process.env, or a test's own). */
export type EnvLike = Readonly<Record<string, string | undefined>>

export type OrcidOAuthConfig = {
  clientId: string
  clientSecret: string
  env: OrcidEnv
  /** orcid.org or sandbox.orcid.org — the authorize page and the token endpoint. */
  host: string
}

/** Why "Connect your ORCID iD" is unavailable: no credentials, a malformed client ID, an unknown ORCID_ENV. */
export type OrcidConfigProblem = 'missing' | 'client-id' | 'env'

export type OrcidConfigStatus = { ok: true; config: OrcidOAuthConfig } | { ok: false; problem: OrcidConfigProblem; env: OrcidEnv }

export const ORCID_HOSTS: Record<OrcidEnv, string> = { production: 'orcid.org', sandbox: 'sandbox.orcid.org' }

export { ORCID_CALLBACK_PATH, ORCID_CONNECT_PATH } from './connectUi'

/** The only scope requested (see the module comment). */
export const ORCID_SCOPE = '/authenticate'

/** ORCID client IDs: "APP-" and 16 upper-case letters or digits. */
export const ORCID_CLIENT_ID_RE = /^APP-[A-Z0-9]{16}$/

/** Token request budget (ms) and answer cap (bytes): the answer is a small JSON object. */
export const TOKEN_TIMEOUT_MS = 10_000
const TOKEN_MAX_BYTES = 64 * 1024

/**
 * The OAuth client from the environment: ORCID_CLIENT_ID and
 * ORCID_CLIENT_SECRET (both required), ORCID_ENV `production` (default) or
 * `sandbox`. A malformed client ID or an unknown environment is reported, not
 * guessed around — the wrong environment would send the owner to the wrong
 * ORCID.
 */
export function readOrcidOAuthConfig(env: EnvLike = process.env): OrcidConfigStatus {
  const rawEnv = String(env.ORCID_ENV ?? '').trim().toLowerCase()
  const knownEnv = rawEnv === '' || rawEnv === 'production' || rawEnv === 'sandbox'
  const orcidEnv: OrcidEnv = rawEnv === 'sandbox' ? 'sandbox' : 'production'
  const clientId = String(env.ORCID_CLIENT_ID ?? '').trim()
  const clientSecret = String(env.ORCID_CLIENT_SECRET ?? '').trim()
  if (!clientId || !clientSecret) return { ok: false, problem: 'missing', env: orcidEnv }
  if (!knownEnv) return { ok: false, problem: 'env', env: orcidEnv }
  if (!ORCID_CLIENT_ID_RE.test(clientId)) return { ok: false, problem: 'client-id', env: orcidEnv }
  return { ok: true, config: { clientId, clientSecret, env: orcidEnv, host: ORCID_HOSTS[orcidEnv] } }
}

/**
 * The ORCID sign-in page for this flow. `orcid` (a canonical iD already on
 * the CV) pre-fills ORCID's sign-in form, as ORCID's sign-in customisation
 * allows; anything else is left out.
 */
export function orcidAuthorizeUrl(config: OrcidOAuthConfig, opts: { state: string; redirectUri: string; orcid?: string }): string {
  const url = new URL(`https://${config.host}/oauth/authorize`)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', ORCID_SCOPE)
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('state', opts.state)
  const hint = canonicalOrcid(opts.orcid)
  if (hint) url.searchParams.set('orcid', hint)
  return url.toString()
}

/** The token endpoint of the configured environment. */
export function orcidTokenUrl(config: OrcidOAuthConfig): string {
  return `https://${config.host}/oauth/token`
}

/** What a token exchange came to; the access token itself is never part of it. */
export type OrcidExchangeResult =
  | { kind: 'ok'; orcid: string; name: string }
  /** ORCID refused the code (expired, used, another redirect URI): OAuth `error` code. */
  | { kind: 'rejected'; status: number; error: string }
  /** ORCID refused the client: wrong ORCID_CLIENT_ID / ORCID_CLIENT_SECRET, or the other ORCID_ENV. */
  | { kind: 'client'; status: number }
  | { kind: 'busy'; status: number }
  | { kind: 'timeout' }
  | { kind: 'malformed'; detail: string }
  | { kind: 'unreachable'; detail: string }

/** An OAuth error code as ORCID sends it ("invalid_grant"), or '' for anything else. */
export function oauthErrorCode(value: unknown): string {
  return typeof value === 'string' && /^[a-z_]{1,40}$/.test(value) ? value : ''
}

/** Codes the browser may carry back: ORCID's alphabet, bounded. */
export const OAUTH_CODE_RE = /^[A-Za-z0-9._~-]{1,256}$/

/**
 * Exchange an authorization code for the authenticated iD (step 3). The
 * request carries the client secret, so it goes only to the configured
 * environment's token endpoint, never follows a redirect, and nothing about
 * it (secret, code, token) is logged. Reads `orcid` and `name` from the
 * answer and nothing else.
 */
export async function exchangeOrcidCode(
  config: OrcidOAuthConfig,
  input: { code: string; redirectUri: string },
  fetcher: Fetcher = safeFetch,
): Promise<OrcidExchangeResult> {
  const url = orcidTokenUrl(config)
  if (new URL(url).host !== config.host) return { kind: 'unreachable', detail: 'Not the configured ORCID host' }
  if (!OAUTH_CODE_RE.test(input.code)) return { kind: 'rejected', status: 400, error: 'invalid_request' }
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
  }).toString()
  let res
  try {
    res = await fetcher(url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body,
      timeoutMs: TOKEN_TIMEOUT_MS,
      maxBytes: TOKEN_MAX_BYTES,
      redirect: 'manual',
    })
  } catch (err) {
    if (err instanceof SafeFetchError) {
      if (err.code === 'TIMEOUT') return { kind: 'timeout' }
      if (err.code === 'TOO_LARGE') return { kind: 'malformed', detail: 'The answer was too large' }
      return { kind: 'unreachable', detail: err.code }
    }
    return { kind: 'unreachable', detail: 'Network error' }
  }

  const json = parseJson(res.body, res.headers['content-type'])
  if (res.status === 429 || res.status >= 500) return { kind: 'busy', status: res.status }
  if (res.status >= 300 && res.status < 400) return { kind: 'unreachable', detail: `ORCID redirected (${res.status})` }
  const error = oauthErrorCode(isObject(json) ? json.error : undefined)
  if (res.status === 401 || error === 'invalid_client' || error === 'unauthorized_client') return { kind: 'client', status: res.status }
  if (res.status >= 400) return { kind: 'rejected', status: res.status, error: error || 'invalid_request' }
  if (res.status !== 200) return { kind: 'malformed', detail: `ORCID answered ${res.status}` }
  if (!isObject(json)) return { kind: 'malformed', detail: 'Not a JSON object' }
  // ORCID answers with the canonical iD; anything else is not an answer we can trust.
  const orcid = canonicalOrcid(json.orcid)
  if (!orcid) return { kind: 'malformed', detail: 'No ORCID iD in the answer' }
  const name = typeof json.name === 'string' ? json.name.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
  return { kind: 'ok', orcid, name }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function parseJson(body: Buffer, contentType: string | string[] | undefined): unknown {
  const type = String(Array.isArray(contentType) ? contentType[0] : contentType || '')
  if (type && !/json/i.test(type)) return undefined
  try {
    return JSON.parse(body.toString('utf8'))
  } catch {
    return undefined
  }
}
