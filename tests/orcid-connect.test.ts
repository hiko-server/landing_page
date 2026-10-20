/**
 * orcid-connect — the pure parts of "Connect your ORCID iD": the client
 * configuration, ORCID's authorize URL, the session-bound single-use state
 * (expiry, tampering, replay, mismatch), the "authenticated" marker's public
 * form and lifecycle (connect, disconnect, edit, save), the display choice
 * (authenticated vs unauthenticated icon and suffix), the Studio's states
 * and messages (including the no-credentials state), the return page, and
 * the proxy's one exemption. The routes run in orcid-connect-route.test.ts.
 *
 * The iD is ORCID's documented example record (tests/fixtures/orcid); every
 * credential here is synthetic.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EXAMPLE_ORCID_ID, EXAMPLE_ORCID_URI, SYNTHETIC_ORCID_ID } from './fixtures/orcid'
import { ORCID_CLIENT_ID_RE, ORCID_SCOPE, orcidAuthorizeUrl, orcidTokenUrl, readOrcidOAuthConfig } from '../lib/orcid/oauth'
import { ORCID_FLOW_TTL_S, checkOrcidCallbackState, newOrcidFlow, readOrcidFlow } from '../lib/orcid/flow'
import { createReplayGuard } from '../lib/security/replayGuard'
import { ORCID_UNAUTHENTICATED_SUFFIX, orcidDisplay } from '../lib/orcid/display'
import { ORCID_AUTH_FIELD, markerConfirms, orcidAuthMarkerOf, publicOrcidAuth } from '../lib/orcid/marker'
import { orcidAuthenticatedOf } from '../lib/orcid/cv'
import { connectOrcidInCv, disconnectOrcidInCv, dropStaleOrcidAuth, reconcileOrcidAuth, storedOrcidAuth } from '../lib/orcid/connection'
import {
  ORCID_CONNECT_REASONS,
  ORCID_DISCONNECT_CONFIRM_LINE,
  ORCID_SETUP_DOCS_URL,
  orcidConnectLine,
  orcidConnectNotice,
  orcidConnectPanel,
  studioReturnPath,
  type OrcidConnectStatus,
} from '../lib/orcid/connectUi'
import { publicSections } from '../lib/cvVisibility'
import { profileLinks, withEvidenceLinks } from '../lib/cvLinks'

const ID = EXAMPLE_ORCID_ID
const OTHER = SYNTHETIC_ORCID_ID
const SECRET = 'orcid-connect-test-secret'
const SID = 'AAAAAAAAAAAAAAAAAAAAAA'
const CLIENT = { ORCID_CLIENT_ID: 'APP-ABCDEFGHIJ012345', ORCID_CLIENT_SECRET: 'synthetic-client-secret' }
const AT = '2026-10-21T08:00:00.000Z'

// ── Configuration ──────────────────────────────────────────────────────────

test('config: both credentials are needed; the client ID must look like ORCID’s; ORCID_ENV is production (default) or sandbox', () => {
  assert.deepEqual(readOrcidOAuthConfig({}), { ok: false, problem: 'missing', env: 'production' })
  assert.deepEqual(readOrcidOAuthConfig({ ORCID_CLIENT_ID: CLIENT.ORCID_CLIENT_ID }), { ok: false, problem: 'missing', env: 'production' })
  assert.deepEqual(readOrcidOAuthConfig({ ORCID_CLIENT_SECRET: 'x', ORCID_ENV: 'sandbox' }), { ok: false, problem: 'missing', env: 'sandbox' })
  assert.deepEqual(readOrcidOAuthConfig({ ...CLIENT, ORCID_CLIENT_ID: 'my-app' }), { ok: false, problem: 'client-id', env: 'production' })
  assert.deepEqual(readOrcidOAuthConfig({ ...CLIENT, ORCID_ENV: 'staging' }), { ok: false, problem: 'env', env: 'production' })

  const prod = readOrcidOAuthConfig({ ...CLIENT, ORCID_CLIENT_ID: `  ${CLIENT.ORCID_CLIENT_ID} ` })
  assert.ok(prod.ok)
  assert.deepEqual(prod.config, { clientId: CLIENT.ORCID_CLIENT_ID, clientSecret: CLIENT.ORCID_CLIENT_SECRET, env: 'production', host: 'orcid.org' })
  const sandbox = readOrcidOAuthConfig({ ...CLIENT, ORCID_ENV: 'Sandbox' })
  assert.ok(sandbox.ok && sandbox.config.host === 'sandbox.orcid.org' && sandbox.config.env === 'sandbox')
  assert.ok(ORCID_CLIENT_ID_RE.test('APP-0123456789ABCDEF') && !ORCID_CLIENT_ID_RE.test('APP-0123456789abcdef'))
})

test('the authorize URL: the configured ORCID, code flow, /authenticate only, the state and redirect URI; a canonical iD pre-fills the sign-in', () => {
  const cfg = readOrcidOAuthConfig(CLIENT)
  assert.ok(cfg.ok)
  const url = new URL(orcidAuthorizeUrl(cfg.config, { state: 's'.repeat(43), redirectUri: 'https://example.com/api/admin/orcid/callback', orcid: ID }))
  assert.equal(url.origin + url.pathname, 'https://orcid.org/oauth/authorize')
  assert.equal(url.searchParams.get('client_id'), CLIENT.ORCID_CLIENT_ID)
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('scope'), ORCID_SCOPE)
  assert.equal(ORCID_SCOPE, '/authenticate')
  assert.equal(url.searchParams.get('state'), 's'.repeat(43))
  assert.equal(url.searchParams.get('redirect_uri'), 'https://example.com/api/admin/orcid/callback')
  assert.equal(url.searchParams.get('orcid'), ID)
  assert.equal(url.searchParams.get('client_secret'), null, 'the secret never goes to the browser')
  assert.ok(!url.toString().includes(CLIENT.ORCID_CLIENT_SECRET))
  // Only a canonical iD is passed on.
  const plain = new URL(orcidAuthorizeUrl(cfg.config, { state: 's'.repeat(43), redirectUri: 'https://example.com/cb', orcid: 'not an iD' }))
  assert.equal(plain.searchParams.has('orcid'), false)
  assert.equal(orcidTokenUrl(cfg.config), 'https://orcid.org/oauth/token')
  const sb = readOrcidOAuthConfig({ ...CLIENT, ORCID_ENV: 'sandbox' })
  assert.ok(sb.ok)
  assert.equal(new URL(orcidAuthorizeUrl(sb.config, { state: 's'.repeat(43), redirectUri: 'http://127.0.0.1:3000/cb' })).host, 'sandbox.orcid.org')
  assert.equal(orcidTokenUrl(sb.config), 'https://sandbox.orcid.org/oauth/token')
})

// ── State and its browser binding ──────────────────────────────────────────

test('flow: a fresh random state per connect, bound to the session in a signed cookie', () => {
  const now = Date.parse(AT)
  const a = newOrcidFlow(SECRET, { sid: SID, sv: 2 }, now)
  const b = newOrcidFlow(SECRET, { sid: SID, sv: 2 }, now)
  assert.match(a.state, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(a.state, b.state, 'random')
  const read = readOrcidFlow(SECRET, a.cookie, now + 1000)
  assert.ok(read.ok)
  assert.deepEqual(read.flow, { state: a.state, sid: SID, sv: 2, issuedAt: Math.floor(now / 1000) })
  assert.throws(() => newOrcidFlow(SECRET, { sid: 'short', sv: 0 }, now))
  assert.throws(() => newOrcidFlow(SECRET, { sid: SID, sv: -1 }, now))
})

test('flow: expired after ten minutes, refused from the future, tampered or under another secret', () => {
  const now = Date.parse(AT)
  const { cookie } = newOrcidFlow(SECRET, { sid: SID, sv: 0 }, now)
  assert.ok(readOrcidFlow(SECRET, cookie, now + (ORCID_FLOW_TTL_S - 1) * 1000).ok)
  assert.deepEqual(readOrcidFlow(SECRET, cookie, now + ORCID_FLOW_TTL_S * 1000), { ok: false, problem: 'expired' })
  assert.deepEqual(readOrcidFlow(SECRET, cookie, now - 5 * 60_000), { ok: false, problem: 'expired' })
  assert.deepEqual(readOrcidFlow('another-secret', cookie, now), { ok: false, problem: 'malformed' })
  const parts = cookie.split('.')
  // Another session, version or state under the same MAC: refused.
  for (const i of [1, 2, 3, 4]) {
    const forged = [...parts]
    forged[i] = i === 2 ? 'BBBBBBBBBBBBBBBBBBBBBB' : i === 1 ? 'x'.repeat(43) : '7'
    assert.deepEqual(readOrcidFlow(SECRET, forged.join('.'), now), { ok: false, problem: 'malformed' }, `part ${i}`)
  }
  assert.deepEqual(readOrcidFlow(SECRET, undefined, now), { ok: false, problem: 'no-flow' })
  assert.deepEqual(readOrcidFlow(SECRET, '', now), { ok: false, problem: 'no-flow' })
  for (const junk of ['v1', 'v2.a.b.c.d.e', 'x'.repeat(300), 42]) assert.equal(readOrcidFlow(SECRET, junk, now).ok, false)
})

test('callback state: must equal the cookie’s state, and works once (replay refused)', () => {
  const now = Date.parse(AT)
  const guard = createReplayGuard()
  const { state, cookie } = newOrcidFlow(SECRET, { sid: SID, sv: 0 }, now)
  assert.deepEqual(checkOrcidCallbackState(SECRET, { cookie, state: 'y'.repeat(43) }, guard, now), { ok: false, problem: 'state-mismatch' })
  assert.deepEqual(checkOrcidCallbackState(SECRET, { cookie, state: undefined }, guard, now), { ok: false, problem: 'state-mismatch' })
  assert.deepEqual(checkOrcidCallbackState(SECRET, { cookie, state: [state] }, guard, now), { ok: false, problem: 'state-mismatch' })
  assert.deepEqual(checkOrcidCallbackState(SECRET, { cookie: undefined, state }, guard, now), { ok: false, problem: 'no-flow' })
  const ok = checkOrcidCallbackState(SECRET, { cookie, state }, guard, now)
  assert.ok(ok.ok && ok.flow.sid === SID)
  assert.deepEqual(checkOrcidCallbackState(SECRET, { cookie, state }, guard, now + 1000), { ok: false, problem: 'replayed' })
  // A state from another browser's flow does not fit this browser's cookie.
  const other = newOrcidFlow(SECRET, { sid: SID, sv: 0 }, now)
  assert.equal(checkOrcidCallbackState(SECRET, { cookie, state: other.state }, guard, now).ok, false)
  // Expired beats everything.
  const late = newOrcidFlow(SECRET, { sid: SID, sv: 0 }, now)
  assert.deepEqual(checkOrcidCallbackState(SECRET, { cookie: late.cookie, state: late.state }, guard, now + ORCID_FLOW_TTL_S * 1000), { ok: false, problem: 'expired' })
})

// ── Display ────────────────────────────────────────────────────────────────

test('display: authenticated → the green iD icon, nothing after the URI; typed in → the unauthenticated icon and ORCID’s suffix', () => {
  assert.deepEqual(orcidDisplay(true), { icon: 'authenticated', suffix: '' })
  assert.deepEqual(orcidDisplay(true, 'zh'), { icon: 'authenticated', suffix: '' })
  assert.deepEqual(orcidDisplay(false), { icon: 'unauthenticated', suffix: '(unauthenticated)' })
  assert.deepEqual(orcidDisplay(false, 'zh'), { icon: 'unauthenticated', suffix: '（未经认证）', suffixLang: 'zh-Hans' })
  assert.equal(ORCID_UNAUTHENTICATED_SUFFIX.en, '(unauthenticated)')
})

// ── The marker and its public form ─────────────────────────────────────────

const pi = (extra: Record<string, unknown> = {}) => ({ sessionName: 'personalInformation', firstName: 'Example', lastName: 'Person', orcid: ID, ...extra })
const marked = (extra: Record<string, unknown> = {}) => pi({ [ORCID_AUTH_FIELD]: { id: ID, at: AT }, ...extra })

test('marker: well formed only with a canonical iD; it confirms the iD only while the field holds that iD', () => {
  assert.deepEqual(orcidAuthMarkerOf(marked()), { id: ID, at: AT })
  assert.deepEqual(orcidAuthMarkerOf(pi({ [ORCID_AUTH_FIELD]: { id: EXAMPLE_ORCID_URI } })), { id: ID })
  assert.equal(orcidAuthMarkerOf(pi({ [ORCID_AUTH_FIELD]: { id: 'nope', at: AT } })), null)
  assert.equal(orcidAuthMarkerOf(pi({ [ORCID_AUTH_FIELD]: true })), null)
  assert.deepEqual(orcidAuthMarkerOf(pi({ [ORCID_AUTH_FIELD]: { id: ID, at: 'yesterday' } })), { id: ID })
  assert.equal(markerConfirms(marked()), true)
  assert.equal(markerConfirms(marked({ orcid: OTHER })), false)
  assert.equal(markerConfirms(marked({ orcid: '' })), false)
  assert.equal(publicOrcidAuth(marked(), false)?.id, ID)
  assert.equal(publicOrcidAuth(marked(), true), null)
})

test('public views carry { id } only while the iD is public and still the confirmed one — never the connection time', () => {
  const [visible] = publicSections([marked()], 'any')
  assert.deepEqual(visible[ORCID_AUTH_FIELD], { id: ID })
  assert.ok(!JSON.stringify(visible).includes(AT))
  assert.equal(orcidAuthenticatedOf(visible), true)

  const [hidden] = publicSections([marked({ hiddenFields: ['orcid'] })], 'any')
  assert.equal(ORCID_AUTH_FIELD in hidden, false, 'a hidden iD takes its marker with it')
  assert.equal(orcidAuthenticatedOf(hidden), false)
  assert.ok(!JSON.stringify(hidden).includes(ID))

  const [edited] = publicSections([marked({ orcid: OTHER })], 'any')
  assert.equal(ORCID_AUTH_FIELD in edited, false)
  assert.equal(orcidAuthenticatedOf(edited), false)

  const [hiddenMarker] = publicSections([marked({ hiddenFields: [ORCID_AUTH_FIELD] })], 'any')
  assert.equal(ORCID_AUTH_FIELD in hiddenMarker, false)
  assert.equal((hiddenMarker.redacted || []).includes(ORCID_AUTH_FIELD), false)

  // Only Personal Info carries the marker's meaning.
  const [other] = publicSections([{ sessionName: 'education', [ORCID_AUTH_FIELD]: { id: ID, at: AT } }], 'any')
  assert.deepEqual(other[ORCID_AUTH_FIELD], { id: ID, at: AT })
  // The editor's full document reads the same way (the Studio preview).
  assert.equal(orcidAuthenticatedOf(marked()), true)
  assert.equal(orcidAuthenticatedOf(marked({ hiddenFields: ['orcid'] })), false)
})

test('evidence links: the ORCID profile link says whether it is authenticated; the decorated section keeps { id } only when it confirms the iD', () => {
  const [decorated] = withEvidenceLinks(publicSections([marked()], 'cv'))
  assert.deepEqual(decorated[ORCID_AUTH_FIELD], { id: ID })
  const link = profileLinks(decorated).find((l) => l.kind === 'orcid')
  assert.deepEqual(link, { kind: 'orcid', label: 'ORCID', href: EXAMPLE_ORCID_URI, text: EXAMPLE_ORCID_URI, authenticated: true })
  const typed = profileLinks(withEvidenceLinks(publicSections([pi()], 'cv'))[0]).find((l) => l.kind === 'orcid')
  assert.equal(typed?.authenticated, false)
  // A public payload that claims a marker for another iD is not believed.
  const [forged] = withEvidenceLinks([pi({ [ORCID_AUTH_FIELD]: { id: OTHER } })])
  assert.equal(ORCID_AUTH_FIELD in forged, false)
  assert.equal(profileLinks(forged).find((l) => l.kind === 'orcid')?.authenticated, false)
})

// ── Lifecycle ──────────────────────────────────────────────────────────────

const doc = (en: any[], zh: any[] = []) => ({ en, zh })

test('connect: the confirmed iD and the marker go into Personal Info in both languages; visibility stays; a typed iD is replaced', () => {
  const before = doc([pi({ orcid: OTHER, hiddenFields: ['phoneNumber'] }), { sessionName: 'education' }], [pi({ firstName: '例', orcid: OTHER })])
  const r = connectOrcidInCv(before, ID, AT)
  assert.ok(r)
  assert.equal(r.replaced, OTHER)
  for (const lang of ['en', 'zh'] as const) {
    const p: any = r.doc[lang].find((s: any) => s.sessionName === 'personalInformation')
    assert.equal(p.orcid, ID)
    assert.deepEqual(p[ORCID_AUTH_FIELD], { id: ID, at: AT })
  }
  assert.deepEqual(r.doc.en[0].hiddenFields, ['phoneNumber'])
  assert.deepEqual(r.doc.en[1], { sessionName: 'education' })
  assert.equal(before.en[0].orcid, OTHER, 'the input is not mutated')
  assert.equal(connectOrcidInCv(doc([pi({ orcid: '' })]), ID, AT)?.replaced, '')
  assert.equal(connectOrcidInCv(doc([{ sessionName: 'education' }]), ID, AT), null, 'no Personal Info to hold it')
  assert.throws(() => connectOrcidInCv(doc([pi()]), 'not-an-id', AT))
  assert.deepEqual(storedOrcidAuth(r.doc), { id: ID, at: AT })
})

test('disconnect: the marker goes everywhere, the iD stays', () => {
  const r = disconnectOrcidInCv(doc([marked()], [marked({ firstName: '例' })]))
  assert.equal(r.changed, true)
  for (const s of [...r.doc.en, ...r.doc.zh]) {
    assert.equal(ORCID_AUTH_FIELD in s, false)
    assert.equal(s.orcid, ID)
  }
  const same = doc([pi()])
  assert.equal(disconnectOrcidInCv(same).changed, false)
  assert.equal(disconnectOrcidInCv(same).doc.en, same.en)
})

test('edit (Studio): changing the iD drops the marker in the same step; typing the old iD back does not restore it', () => {
  const start = doc([marked()], [marked()])
  assert.equal(dropStaleOrcidAuth(start), start, 'nothing stale: the same document')
  const edited = dropStaleOrcidAuth(doc([marked({ orcid: OTHER })], [marked({ orcid: OTHER })]))
  assert.equal(ORCID_AUTH_FIELD in edited.en[0], false)
  assert.equal(ORCID_AUTH_FIELD in edited.zh[0], false)
  const back = dropStaleOrcidAuth({ ...edited, en: [{ ...edited.en[0], orcid: ID }] })
  assert.equal(ORCID_AUTH_FIELD in back.en[0], false)
  assert.equal(orcidAuthenticatedOf(back.en[0]), false)
  // Half-typed: still stale.
  assert.equal(ORCID_AUTH_FIELD in dropStaleOrcidAuth(doc([marked({ orcid: '0000-0002-18' })])).en[0], false)
})

test('save (server): a browser can drop the marker but never create or change it; an edited iD loses it', () => {
  const stored = doc([marked()], [marked()])
  // Unchanged document: kept, as stored.
  const same = reconcileOrcidAuth(doc([marked()], [marked()]), stored)
  assert.deepEqual(same.en[0][ORCID_AUTH_FIELD], { id: ID, at: AT })
  // A stale copy of the marker (another time, extra keys) is normalised to the stored one.
  const normalised = reconcileOrcidAuth(doc([pi({ [ORCID_AUTH_FIELD]: { id: ID, at: '2020-01-01T00:00:00.000Z', extra: 1 } })]), stored)
  assert.deepEqual(normalised.en[0][ORCID_AUTH_FIELD], { id: ID, at: AT })
  // The iD edited by hand: gone.
  const edited = reconcileOrcidAuth(doc([marked({ orcid: OTHER })], [marked({ orcid: OTHER })]), stored)
  assert.equal(ORCID_AUTH_FIELD in edited.en[0], false)
  assert.equal(ORCID_AUTH_FIELD in edited.zh[0], false)
  // Removed by the browser (the Studio dropped it on an edit, then the iD was typed back): stays removed.
  const dropped = reconcileOrcidAuth(doc([pi()], [pi()]), stored)
  assert.equal(ORCID_AUTH_FIELD in dropped.en[0], false)
  // Typed into the JSON with nothing stored, or for another iD: ignored.
  const forged = reconcileOrcidAuth(doc([marked()]), doc([pi()]))
  assert.equal(ORCID_AUTH_FIELD in forged.en[0], false)
  const otherId = reconcileOrcidAuth(doc([pi({ orcid: OTHER, [ORCID_AUTH_FIELD]: { id: OTHER, at: AT } })]), stored)
  assert.equal(ORCID_AUTH_FIELD in otherId.en[0], false)
  // Nothing to do: the same object back.
  const plain = doc([pi()], [])
  assert.equal(reconcileOrcidAuth(plain, doc([pi()])), plain)
})

// ── Studio states and messages ─────────────────────────────────────────────

const configured: OrcidConnectStatus = { configured: true, env: 'production', redirectUri: 'https://example.com/api/admin/orcid/callback' }
const unconfigured: OrcidConnectStatus = { configured: false, env: 'production', problem: 'missing', redirectUri: 'https://example.com/api/admin/orcid/callback' }

test('Studio row: without credentials the button is off and says why (with the set-up guide); unsaved changes wait; a connected iD shows as such', () => {
  assert.deepEqual(orcidConnectPanel({ status: null, pi: pi(), dirty: false }), { kind: 'loading' })
  const off = orcidConnectPanel({ status: unconfigured, pi: pi(), dirty: false })
  assert.deepEqual(off, { kind: 'unconfigured', problem: 'missing' })
  assert.match(orcidConnectLine(off), /needs ORCID API credentials on the server \(ORCID_CLIENT_ID, ORCID_CLIENT_SECRET\)/)
  assert.match(ORCID_SETUP_DOCS_URL, /^https:\/\/github\.com\/.+#connect-your-orcid-id$/)
  assert.deepEqual(orcidConnectPanel({ status: { ...unconfigured, problem: 'client-id' }, pi: pi(), dirty: false }), { kind: 'unconfigured', problem: 'client-id' })
  assert.deepEqual(orcidConnectPanel({ status: 'error', pi: pi(), dirty: false }), { kind: 'unconfigured', problem: 'unknown' })
  assert.deepEqual(orcidConnectPanel({ status: configured, pi: pi(), dirty: true }), { kind: 'dirty' })
  assert.match(orcidConnectLine({ kind: 'dirty' }), /Save or undo your changes first/)
  const typed = orcidConnectPanel({ status: configured, pi: pi(), dirty: false })
  assert.deepEqual(typed, { kind: 'unauthenticated', hasId: true })
  assert.match(orcidConnectLine(typed), /unauthenticated/)
  assert.deepEqual(orcidConnectPanel({ status: configured, pi: pi({ orcid: '' }), dirty: false }), { kind: 'unauthenticated', hasId: false })
  // Connected: shown whatever the server setup (disconnecting needs no credentials).
  const on = orcidConnectPanel({ status: unconfigured, pi: marked(), dirty: false })
  assert.deepEqual(on, { kind: 'connected', id: ID, at: AT, dirty: false })
  assert.match(orcidConnectLine(on, () => '21 Oct 2026'), /^Authenticated: you signed in to ORCID on 21 Oct 2026\./)
  assert.match(orcidConnectLine({ kind: 'connected', id: ID, at: AT, dirty: true }), /Save or undo your changes to disconnect/)
  assert.match(ORCID_DISCONNECT_CONFIRM_LINE, /The iD stays on your CV, shown as “\(unauthenticated\)”/)
  // A marker for another iD (left by a raw JSON edit) is not a connection.
  assert.deepEqual(orcidConnectPanel({ status: configured, pi: marked({ orcid: OTHER }), dirty: false }), { kind: 'unauthenticated', hasId: true })
})

test('return to the Studio: every outcome has its address and its toast; anything else is no toast', () => {
  assert.equal(studioReturnPath({ result: 'connected' }), '/admin/dashboard?tab=cv&orcid=connected')
  assert.equal(studioReturnPath({ result: 'connected', replaced: true }), '/admin/dashboard?tab=cv&orcid=connected&replaced=1')
  assert.equal(studioReturnPath({ result: 'error', reason: 'state' }), '/admin/dashboard?tab=cv&orcid=error&reason=state')
  const ok = orcidConnectNotice({ tab: 'cv', orcid: 'connected' })
  assert.equal(ok?.status, 'success')
  assert.match(ok?.description || '', /authenticated/)
  assert.match(orcidConnectNotice({ orcid: 'connected', replaced: '1' })?.description || '', /replaced/)
  for (const reason of ORCID_CONNECT_REASONS) {
    const q = Object.fromEntries(new URL(studioReturnPath({ result: 'error', reason }), 'https://x').searchParams)
    const n = orcidConnectNotice(q)
    assert.ok(n && n.title && n.description, reason)
    assert.equal(n.status, reason === 'denied' ? 'warning' : 'error', reason)
  }
  assert.match(orcidConnectNotice({ orcid: 'error', reason: 'state' })?.title || '', /could not be matched/)
  assert.equal(orcidConnectNotice({ orcid: 'error', reason: '<script>' })?.status, 'error')
  assert.equal(orcidConnectNotice({ tab: 'cv' }), null)
  assert.equal(orcidConnectNotice({ orcid: 'maybe' }), null)
})

// ── The return page and the proxy ──────────────────────────────────────────

test('the return page: same-origin target only, escaped, no script, no referrer', async () => {
  const { bounceHtml } = await import('../lib/orcid/connectRoute')
  const html = bounceHtml('/admin/dashboard?tab=cv&orcid=error&reason=state')
  assert.match(html, /<meta http-equiv="refresh" content="0; url=\/admin\/dashboard\?tab=cv&amp;orcid=error&amp;reason=state">/)
  assert.match(html, /<a href="\/admin\/dashboard\?tab=cv&amp;orcid=error&amp;reason=state">Continue<\/a>/)
  assert.match(html, /<meta name="referrer" content="no-referrer">/)
  assert.doesNotMatch(html, /<script/i)
  assert.throws(() => bounceHtml('https://evil.example/'))
  assert.throws(() => bounceHtml('//evil.example/'))
  assert.ok(!bounceHtml('/a"><b').includes('"><b'))
})

test('proxy: only GET /api/admin/orcid/callback goes through without a session; connect and connection stay gated', async () => {
  process.env.JWT_SECRET ||= SECRET
  const { isPublicAdminApi } = await import('../proxy')
  const q = new URLSearchParams()
  assert.equal(isPublicAdminApi('/api/admin/orcid/callback', 'GET', q), true)
  assert.equal(isPublicAdminApi('/api/admin/orcid/callback', 'POST', q), false)
  assert.equal(isPublicAdminApi('/api/admin/orcid/connect', 'GET', q), false)
  assert.equal(isPublicAdminApi('/api/admin/orcid/connection', 'GET', q), false)
  assert.equal(isPublicAdminApi('/api/admin/orcid/connection', 'DELETE', q), false)
  assert.equal(isPublicAdminApi('/api/admin/orcid/works', 'POST', q), false)
})

test('safeFetch POST (the token exchange): a body only with POST, and the same host rules as every fetch', async () => {
  const { safeFetch, SafeFetchError } = await import('../lib/security/safeFetch')
  const code = async (p: Promise<unknown>) => {
    try {
      await p
      return 'resolved'
    } catch (e) {
      return e instanceof SafeFetchError ? e.code : `other:${(e as Error).message}`
    }
  }
  const neverResolve = async (): Promise<string[]> => {
    throw new Error('the resolver must not be reached')
  }
  assert.equal(await code(safeFetch('https://orcid.example/oauth/token', { method: 'GET', body: 'a=b', resolve: neverResolve })), 'BAD_URL')
  assert.equal(await code(safeFetch('https://127.0.0.1/oauth/token', { method: 'POST', body: 'a=b' })), 'BLOCKED_HOST')
  assert.equal(await code(safeFetch('https://internal.example/oauth/token', { method: 'POST', body: 'a=b', resolve: async () => ['10.0.0.8'] })), 'BLOCKED_HOST')
  assert.equal(await code(safeFetch('http://orcid.example/oauth/token', { method: 'POST', body: 'a=b' })), 'BAD_URL')
})
