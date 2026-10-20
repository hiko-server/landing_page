/**
 * orcid — POST /api/admin/orcid/works (lib/orcid/route) driven like the
 * real route, with an injected transport instead of the network: admin
 * only, POST only, the iD validated before anything goes out, every answer
 * ORCID can give mapped to its status and code, the per-browser rate limit,
 * and each outgoing read in the activity log without the iD.
 *
 * The iD is ORCID's documented example record; the works are the synthetic
 * fixture in ORCID's v3.0 shape (tests/fixtures).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { editorialHarness } from './editorialHarness'
import { SafeFetchError, type SafeFetchResult } from '../lib/security/safeFetch'
import type { Fetcher } from '../lib/orcid/fetch'
import { EXAMPLE_ORCID_ID, EXAMPLE_ORCID_TYPO } from './fixtures/orcid'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', name), 'utf8'))
const WORKS = fixture('orcid-works.json')
const BULK = fixture('orcid-works-bulk.json')
const ID = EXAMPLE_ORCID_ID

const h = editorialHarness('orcid-route')
before(h.setup)
after(h.teardown)

const answer = (status: number, body: unknown, headers: Record<string, string> = {}): SafeFetchResult => ({
  status,
  headers: { 'content-type': 'application/json', ...headers },
  body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  url: 'https://pub.orcid.org/x',
})

/** A transport that answers every request with `reply(url)` and remembers the URLs. */
function transport(reply: (url: string) => SafeFetchResult | Error) {
  const urls: string[] = []
  const fetcher: Fetcher = async (url) => {
    urls.push(url)
    const out = reply(url)
    if (out instanceof Error) throw out
    return out
  }
  return { fetcher, urls }
}

let ipSeq = 10
/** Mount the real handler (withApi + the route) on a transport; each call gets its own client address unless given one. */
async function post(fetcher: Fetcher, body: unknown, opts: { auth?: boolean; ip?: string; method?: string } = {}) {
  const { withApi } = await import('../lib/apiHandler')
  const { orcidWorksRoute } = await import('../lib/orcid/route')
  const handler = withApi('admin/orcid/works', orcidWorksRoute(fetcher))
  return h.call(handler as any, { method: opts.method || 'POST', body, auth: opts.auth, ip: opts.ip || `127.0.1.${ipSeq++}` })
}

test('admin only and POST only; a missing or mistyped iD is refused before anything goes out', async () => {
  const t = transport(() => answer(200, WORKS))
  assert.equal((await post(t.fetcher, { orcid: ID }, { auth: false })).statusCode, 401)
  const get = await post(t.fetcher, undefined, { method: 'GET' })
  assert.equal(get.statusCode, 405)
  assert.equal(get.headers.allow, 'POST')
  for (const body of [{}, { orcid: '' }, { orcid: EXAMPLE_ORCID_TYPO }, { orcid: 42 }, 'nope']) {
    const r = await post(t.fetcher, body)
    assert.equal(r.statusCode, 400, JSON.stringify(body))
    assert.equal(r.body.code, 'BAD_ORCID')
  }
  assert.equal(t.urls.length, 0, 'ORCID was never asked')
})

test('200: the mapped candidates with their details; a pasted link is accepted; the read is in the activity log without the iD', async () => {
  const t = transport((url) => (url.endsWith('/works') ? answer(200, WORKS) : answer(200, BULK)))
  const r = await post(t.fetcher, { orcid: `https://orcid.org/${ID}` })
  assert.equal(r.statusCode, 200)
  assert.equal(r.headers['cache-control'], 'no-store')
  assert.equal(r.body.orcid, ID)
  assert.equal(r.body.candidates.length, 5)
  assert.equal(r.body.candidates[0].title, 'Measuring Example Effects in Synthetic Journals')
  assert.deepEqual(r.body.candidates[0].authors, ['Example Person', 'Jane Doe', 'Sam Example'])
  assert.equal(r.body.detailsFailed, 3)
  assert.ok(!Number.isNaN(Date.parse(r.body.fetchedAt)))
  assert.ok(t.urls.every((u) => new URL(u).host === 'pub.orcid.org'))

  const { listAudit } = await import('../lib/audit/store')
  const entry = listAudit({ q: 'ORCID' }).entries[0]
  assert.ok(entry, 'an activity log entry')
  assert.equal(entry.action, 'orcid.read-works')
  assert.equal(entry.area, 'cv')
  assert.equal(entry.status, 200)
  assert.match(entry.summary, /Read 5 works from ORCID/)
  assert.ok(!JSON.stringify(entry).includes(ID), 'the iD is not logged')
})

test('an empty record is a 200 with no candidates (the dialog says "no public works")', async () => {
  const r = await post(transport(() => answer(200, { group: [] })).fetcher, { orcid: ID })
  assert.equal(r.statusCode, 200)
  assert.deepEqual(r.body.candidates, [])
  assert.equal(r.body.detailsFailed, 0)
})

test('every failure of ORCID has its status and code: 404, 429 / 5xx (Retry-After), timeout, malformed, unreachable', async () => {
  const cases: Array<[SafeFetchResult | Error, number, string, Record<string, unknown>?]> = [
    [answer(404, { 'response-code': 404 }), 404, 'NOT_FOUND'],
    [answer(429, '', { 'retry-after': '120' }), 503, 'UPSTREAM_BUSY', { retryAfter: 120 }],
    [answer(502, 'bad gateway', { 'content-type': 'text/html' }), 503, 'UPSTREAM_BUSY'],
    [new SafeFetchError('TIMEOUT', 'Request timed out'), 504, 'TIMEOUT'],
    [answer(200, '<html>maintenance</html>', { 'content-type': 'text/html' }), 502, 'MALFORMED'],
    [answer(200, '{"group": ['), 502, 'MALFORMED'],
    [answer(200, { 'not-works': true }), 502, 'MALFORMED'],
    [answer(301, '', { location: 'https://example.com/' }), 502, 'UNREACHABLE'],
    [new SafeFetchError('BLOCKED_HOST', 'Host resolves to a non-public address'), 502, 'UNREACHABLE'],
  ]
  for (const [reply, status, code, extra] of cases) {
    const r = await post(transport(() => reply).fetcher, { orcid: ID })
    const label = `${code} (${reply instanceof Error ? reply.message : reply.status})`
    assert.equal(r.statusCode, status, label)
    assert.equal(r.body.code, code, label)
    assert.equal(typeof r.body.error, 'string', label)
    assert.ok(!('candidates' in r.body), label)
    for (const [k, v] of Object.entries(extra || {})) assert.equal(r.body[k], v, `${label}: ${k}`)
  }
  const busy = await post(transport(() => answer(429, '', { 'retry-after': '120' })).fetcher, { orcid: ID })
  assert.equal(busy.headers['retry-after'], '120')

  const { listAudit } = await import('../lib/audit/store')
  const failed = listAudit({ q: 'Tried to read works from ORCID' }).entries
  assert.ok(failed.some((e) => e.status === 404) && failed.some((e) => e.status === 504), 'failed reads are logged with their status')
})

test('the rate limit: ten reads per browser in ten minutes, then 429 with Retry-After — another browser is not affected', async () => {
  const t = transport(() => answer(200, { group: [] }))
  const ip = '127.0.2.1'
  for (let i = 0; i < 10; i++) assert.equal((await post(t.fetcher, { orcid: ID }, { ip })).statusCode, 200, `read ${i + 1}`)
  const limited = await post(t.fetcher, { orcid: ID }, { ip })
  assert.equal(limited.statusCode, 429)
  assert.equal(limited.body.code, 'RATE_LIMITED')
  assert.ok(Number(limited.headers['retry-after']) > 0)
  assert.equal(t.urls.length, 10, 'the eleventh read never reached ORCID')
  assert.equal((await post(t.fetcher, { orcid: ID }, { ip: '127.0.2.2' })).statusCode, 200)
})
