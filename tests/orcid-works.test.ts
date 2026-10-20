/**
 * orcid — importing works from the ORCID public API (lib/orcid/works,
 * lib/orcid/fetch, lib/orcid/importClient, the Studio's appendEntries): the mapping of ORCID's
 * documented works JSON shape (a synthetic fixture), the full-work details,
 * duplicate detection against the CV, the stored entry's validity, and
 * every outcome of the server fetch with an injected transport.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyWorkDetails, existingPapers, mapOrcidWorks, markDuplicates, orcidTypeLabel, titleKey, toPaperEntry, MAX_WORKS } from '../lib/orcid/works'
import { ORCID_API_BASE, fetchOrcidJson, fetchOrcidWorks, type Fetcher } from '../lib/orcid/fetch'
import { SafeFetchError, type SafeFetchResult } from '../lib/security/safeFetch'
import { validateCvDoc } from '../lib/cvValidate'
import { CV_SECTIONS } from '../lib/cvSections'
import { PAPERS_KEY } from '../lib/publications/types'
import { appendEntries, type Doc } from '../components/Admin/cvStudio/docOps'
import { ORCID_WORKS_URL, defaultSelection, importErrorMessage, type OrcidWorksBody } from '../lib/orcid/importClient'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', name), 'utf8'))
const WORKS = fixture('orcid-works.json')
const BULK = fixture('orcid-works-bulk.json')
const ID = '0000-0002-1825-0097'

test('mapOrcidWorks: one candidate per group, summaries merged, DOI / type / date / URL mapped, the untitled work skipped', () => {
  const list = mapOrcidWorks(WORKS)!
  assert.ok(list)
  assert.deepEqual(
    list.map((c) => c.title),
    ['Measuring Example Effects in Synthetic Journals', 'A conference paper about nothing in particular', 'Preliminary notes on synthetic preprints', 'Apparatus for generating example data', 'Synthetic methods for example research'],
  )
  const [journal, conf, preprint, patent, thesis] = list
  // The owner's summary has the highest display index (the version the researcher prefers), so it
  // leads; the Crossref one fills what it lacks.
  assert.equal(journal.putCode, 1002)
  assert.equal(journal.venue, 'Journal of Synthetic Examples')
  assert.equal(journal.date, '2025-03', 'the most complete date wins')
  assert.equal(journal.doi, '10.5555/EXAMPLE.2025.001', 'the preferred version’s DOI as written (DOIs compare case-insensitively)')
  assert.equal(journal.url, '', 'a URL that is just the DOI link again is dropped')
  assert.equal(journal.venueType, 'journal')
  assert.equal(journal.status, 'published')
  assert.equal(journal.paper, true)
  assert.deepEqual(journal.sources, ['Example Person', 'Crossref'])
  assert.deepEqual(journal.authors, [])
  assert.equal(journal.detailsLoaded, false)

  assert.equal(conf.subtitle, 'Extended abstract')
  assert.equal(conf.venueType, 'conference')
  assert.equal(conf.date, '2024')
  assert.equal(conf.url, 'https://proceedings.example.org/2024/17', 'http is upgraded')
  assert.equal(conf.doi, '10.5555/examplecon.2024.17', 'the group-level DOI')

  assert.equal(preprint.venueType, 'preprint')
  assert.equal(preprint.status, 'preprint')
  assert.equal(preprint.date, '2023-01', 'a one-digit month is padded')
  assert.equal(preprint.url, 'https://arxiv.org/abs/2301.00001', 'the arXiv id stands in for a missing URL')
  assert.equal(preprint.doi, '')

  assert.equal(patent.paper, false)
  assert.equal(patent.orcidType, 'patent')
  assert.equal(patent.venueType, 'other')
  assert.equal(orcidTypeLabel(patent.orcidType), 'patent')
  assert.equal(orcidTypeLabel('conference-paper'), 'conference paper')

  assert.equal(thesis.venueType, 'thesis')
  assert.equal(thesis.venue, 'Example University')
  assert.equal(thesis.date, '')
})

test('mapOrcidWorks: malformed input is null, no groups is []; the list is capped', () => {
  assert.equal(mapOrcidWorks(null), null)
  assert.equal(mapOrcidWorks('<html>'), null)
  assert.equal(mapOrcidWorks({ bulk: [] }), null)
  assert.deepEqual(mapOrcidWorks({ group: [] }), [])
  assert.deepEqual(mapOrcidWorks({ group: [null, 1, { 'work-summary': [] }, { 'work-summary': [{ 'put-code': 'x', title: { title: { value: 'No put code' } } }] }] }), [])
  const many = { group: Array.from({ length: MAX_WORKS + 20 }, (_, i) => ({ 'work-summary': [{ 'put-code': i, title: { title: { value: `Work ${i}` } }, type: 'journal-article' }] })) }
  assert.equal(mapOrcidWorks(many)!.length, MAX_WORKS)
})

test('applyWorkDetails: authors in order (first author first; CRediT roles count, editors / translators and duplicates out), the abstract, missing fields filled; errors skipped', () => {
  const { candidates, loaded } = applyWorkDetails(mapOrcidWorks(WORKS)!, BULK)
  assert.equal(loaded, 2)
  const journal = candidates[0]
  assert.deepEqual(journal.authors, ['Example Person', 'Jane Doe', 'Sam Example'])
  assert.equal(journal.abstract, 'We measure example effects.\n\nResults are illustrative.')
  assert.equal(journal.detailsLoaded, true)
  const preprint = candidates[2]
  assert.deepEqual(preprint.authors, [])
  assert.equal(preprint.detailsLoaded, true)
  assert.equal(preprint.url, 'https://arxiv.org/abs/2301.00001', 'a URL the summary already had is kept')
  assert.equal(candidates[1].detailsLoaded, false, 'not in the bulk answer')
  assert.deepEqual(applyWorkDetails(candidates, { nope: true }), { candidates, loaded: 0 })
})

test('markDuplicates: by DOI (any case or shape), else by normalised title; existingPapers reads every entry', () => {
  const papers = [
    { title: 'Older paper', doi: 'https://doi.org/10.5555/examplecon.2024.17' },
    { title: 'MEASURING example-effects in synthetic journals!', doi: '' },
    { title: 'Hidden one', doi: '10.5555/hidden', isVisible: false },
    'not an object',
  ]
  const existing = existingPapers(papers)
  assert.deepEqual(existing, [
    { index: 0, title: 'Older paper', doi: '10.5555/examplecon.2024.17' },
    { index: 1, title: 'MEASURING example-effects in synthetic journals!', doi: '' },
    { index: 2, title: 'Hidden one', doi: '10.5555/hidden' },
    { index: 3, title: '', doi: '' },
  ])
  const marked = markDuplicates(mapOrcidWorks(WORKS)!, existing)
  assert.equal(marked[0].existing?.index, 1, 'same title, different punctuation and case')
  assert.equal(marked[1].existing?.index, 0, 'same DOI through a doi.org link')
  assert.equal(marked[2].existing, null)
  assert.equal(marked[3].existing, null)
  assert.equal(titleKey(' Ｔitle:  A—B '), 'titleab')
  assert.deepEqual(markDuplicates([], []), [])
})

test('toPaperEntry builds a stored paper the validator accepts, shaped like a blank hand-entered one', () => {
  const { candidates } = applyWorkDetails(mapOrcidWorks(WORKS)!, BULK)
  const blank = CV_SECTIONS.find((s) => s.sessionName === 'publications')!.lists![0].blank()
  for (const c of candidates) {
    const entry = toPaperEntry(c)
    assert.deepEqual(Object.keys(entry).sort(), Object.keys(blank).sort(), c.title)
    const check = validateCvDoc({ en: [{ sessionName: 'publications', papers: [entry] }], zh: [] })
    assert.equal(check.ok, true, JSON.stringify(check))
  }
  const conf = toPaperEntry(candidates[1])
  assert.equal(conf.title, 'A conference paper about nothing in particular: Extended abstract')
  assert.equal(conf.status, 'published')
  assert.equal(conf.url, 'https://proceedings.example.org/2024/17')
  assert.deepEqual(conf.keywords, [])
})

// ── fetch (injected transport) ─────────────────────────────────────────────

const answer = (status: number, body: unknown, headers: Record<string, string> = {}): SafeFetchResult => ({
  status,
  headers: { 'content-type': 'application/json', ...headers },
  body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  url: 'https://pub.orcid.org/x',
})

function transport(script: (url: string) => SafeFetchResult | Error): { fetcher: Fetcher; calls: Array<{ url: string; accept: string; redirect: string }> } {
  const calls: Array<{ url: string; accept: string; redirect: string }> = []
  const fetcher: Fetcher = async (url, options) => {
    calls.push({ url, accept: options.headers?.accept || '', redirect: String(options.redirect) })
    const out = script(url)
    if (out instanceof Error) throw out
    return out
  }
  return { fetcher, calls }
}

test('fetchOrcidWorks: the works, then one bulk read of their details; JSON asked for, redirects never followed, only pub.orcid.org', async () => {
  const { fetcher, calls } = transport((url) => (url.endsWith('/works') ? answer(200, WORKS) : answer(200, BULK)))
  const r = await fetchOrcidWorks(`https://orcid.org/${ID}`, fetcher)
  assert.equal(r.kind, 'ok')
  if (r.kind !== 'ok') return
  assert.equal(r.candidates.length, 5)
  assert.deepEqual(r.candidates[0].authors, ['Example Person', 'Jane Doe', 'Sam Example'])
  assert.equal(r.detailsFailed, 3, 'five asked, two came back')
  assert.deepEqual(
    calls.map((c) => c.url),
    [`${ORCID_API_BASE}/${ID}/works`, `${ORCID_API_BASE}/${ID}/works/1002,1003,1004,1005,1006`],
  )
  for (const c of calls) {
    assert.equal(c.accept, 'application/json')
    assert.equal(c.redirect, 'manual')
    assert.equal(new URL(c.url).host, 'pub.orcid.org')
  }
})

test('fetchOrcidWorks: an invalid iD never reaches the network; an empty record is ok with no candidates; failed details keep the summaries', async () => {
  const bad = transport(() => answer(200, WORKS))
  assert.deepEqual(await fetchOrcidWorks('0000-0002-1825-0098', bad.fetcher), { kind: 'not-found' })
  assert.equal(bad.calls.length, 0)

  const empty = transport(() => answer(200, { group: [] }))
  assert.deepEqual(await fetchOrcidWorks(ID, empty.fetcher), { kind: 'ok', candidates: [], detailsFailed: 0 })
  assert.equal(empty.calls.length, 1, 'no details read for nothing')

  const partial = transport((url) => (url.endsWith('/works') ? answer(200, WORKS) : new SafeFetchError('TIMEOUT', 'slow')))
  const r = await fetchOrcidWorks(ID, partial.fetcher)
  assert.equal(r.kind, 'ok')
  if (r.kind === 'ok') {
    assert.equal(r.candidates.length, 5)
    assert.equal(r.detailsFailed, 5)
    assert.ok(r.candidates.every((c) => !c.detailsLoaded))
  }
})

test('fetchOrcidWorks: details are read 100 put-codes at a time; a failing batch stops the reads and is counted', async () => {
  const many = { group: Array.from({ length: 150 }, (_, i) => ({ 'work-summary': [{ 'put-code': 5000 + i, title: { title: { value: `Work ${i}` } }, type: 'journal-article' }] })) }
  const bulkOf = (url: string) => ({ bulk: url.split('/works/')[1].split(',').map((code) => ({ work: { 'put-code': Number(code), contributors: { contributor: [{ 'credit-name': { value: 'Example Person' } }] } } })) })
  const ok = transport((url) => (url.endsWith('/works') ? answer(200, many) : answer(200, bulkOf(url))))
  const r = await fetchOrcidWorks(ID, ok.fetcher)
  assert.equal(r.kind, 'ok')
  if (r.kind === 'ok') {
    assert.equal(r.detailsFailed, 0)
    assert.ok(r.candidates.every((c) => c.detailsLoaded && c.authors[0] === 'Example Person'))
  }
  assert.deepEqual(
    ok.calls.slice(1).map((c) => c.url.split('/works/')[1].split(',').length),
    [100, 50],
  )

  const second = transport((url) => (url.endsWith('/works') ? answer(200, many) : url.includes('/works/5100') ? answer(429, '') : answer(200, bulkOf(url))))
  const s = await fetchOrcidWorks(ID, second.fetcher)
  assert.equal(s.kind, 'ok')
  if (s.kind === 'ok') assert.equal(s.detailsFailed, 50, 'the first 100 keep their authors')
})

test('fetchOrcidJson: 404, 429 / 5xx with Retry-After, timeouts, blocked hosts, redirects, XML and broken JSON each have their outcome', async () => {
  const cases: Array<[SafeFetchResult | Error, unknown]> = [
    [answer(404, { 'response-code': 404 }), { kind: 'not-found' }],
    [answer(429, '', { 'retry-after': '30' }), { kind: 'busy', status: 429, retryAfterS: 30 }],
    [answer(503, 'down', { 'retry-after': 'soon' }), { kind: 'busy', status: 503, retryAfterS: null }],
    [new SafeFetchError('TIMEOUT', 'Request timed out'), { kind: 'timeout' }],
    [new SafeFetchError('BLOCKED_HOST', 'Host resolves to a non-public address'), { kind: 'unreachable', detail: 'Host resolves to a non-public address' }],
    [new SafeFetchError('TOO_LARGE', 'big'), { kind: 'malformed', detail: 'The answer was too large' }],
    [new Error('socket hang up'), { kind: 'unreachable', detail: 'socket hang up' }],
    [answer(302, '', { location: 'https://evil.example/' }), { kind: 'unreachable', detail: 'ORCID redirected (302)' }],
    [answer(200, '<work/>', { 'content-type': 'application/xml' }), { kind: 'malformed', detail: 'Not JSON (application/xml)' }],
    [answer(200, '{not json'), { kind: 'malformed', detail: 'The answer was not valid JSON' }],
    [answer(401, { error: 'x' }), { kind: 'malformed', detail: 'ORCID answered 401' }],
  ]
  for (const [reply, expected] of cases) {
    const { fetcher } = transport(() => reply)
    assert.deepEqual(await fetchOrcidJson(`/${ID}/works`, fetcher), expected, reply instanceof Error ? reply.message : String(reply.status))
  }
  // A works answer of the wrong shape is malformed too.
  const html = transport(() => answer(200, { html: true }))
  assert.deepEqual(await fetchOrcidWorks(ID, html.fetcher), { kind: 'malformed', detail: 'Not the shape of an ORCID works answer' })
})

// ── Studio: one undo step, mirrored when linked ────────────────────────────

test('appendEntries adds every paper at the end as one edit; linked and aligned → the other language gets copies; otherwise EN only', () => {
  const pubs = (papers: unknown[]) => ({ sessionName: 'publications', headerName: 'Publications', papers })
  const entries = applyWorkDetails(mapOrcidWorks(WORKS)!, BULK).candidates.slice(0, 2).map(toPaperEntry)
  const aligned: Doc = { en: [pubs([{ title: 'Old' }])], zh: [pubs([{ title: '旧' }])] }
  const r = appendEntries(aligned, 'en', [0, PAPERS_KEY], entries, true)
  assert.equal(r.reached, true)
  assert.deepEqual(
    r.doc.en[0].papers.map((p: any) => p.title),
    ['Old', 'Measuring Example Effects in Synthetic Journals', 'A conference paper about nothing in particular: Extended abstract'],
  )
  assert.deepEqual(
    r.doc.zh[0].papers.map((p: any) => p.title),
    ['旧', 'Measuring Example Effects in Synthetic Journals', 'A conference paper about nothing in particular: Extended abstract'],
  )
  assert.notEqual(r.doc.en[0].papers[1], r.doc.zh[0].papers[1], 'copies, not shared objects')
  assert.deepEqual(aligned.en[0].papers.length, 1, 'the input is not mutated')

  const misaligned: Doc = { en: [pubs([{ title: 'Old' }])], zh: [pubs([])] }
  const m = appendEntries(misaligned, 'en', [0, PAPERS_KEY], entries, true)
  assert.equal(m.reached, false)
  assert.equal(m.doc.en[0].papers.length, 3)
  assert.equal(m.doc.zh[0].papers.length, 0)

  const unlinked = appendEntries(aligned, 'zh', [0, PAPERS_KEY], entries, false)
  assert.equal(unlinked.reached, false)
  assert.equal(unlinked.doc.zh[0].papers.length, 3)
  assert.equal(unlinked.doc.en[0].papers.length, 1)
  assert.deepEqual(appendEntries(aligned, 'en', [0, PAPERS_KEY], [], true), { doc: aligned, reached: false })
})

// ── Studio dialog decisions (lib/orcid/importClient) ───────────────────────

test('the dialog ticks new papers only, and says what to do for every answer that is not the works', () => {
  const marked = markDuplicates(mapOrcidWorks(WORKS)!, existingPapers([{ title: 'measuring example effects in synthetic journals', doi: '' }]))
  // 1002 is on the CV already, 1005 is a patent: neither is ticked.
  assert.deepEqual([...defaultSelection(marked)].sort(), [1003, 1004, 1006])

  const cases: Array<[number, OrcidWorksBody | undefined, RegExp, boolean, boolean]> = [
    [401, { error: 'Unauthorized' }, /session has ended/i, false, true],
    [403, undefined, /session has ended/i, false, true],
    [400, { code: 'BAD_ORCID' }, /Personal Info is not valid/, false, false],
    [404, { code: 'NOT_FOUND' }, /no public record/i, false, false],
    [429, { code: 'RATE_LIMITED', retryAfter: 290 }, /Try again in 5 minutes/, true, false],
    [503, { code: 'UPSTREAM_BUSY', retryAfter: 30 }, /busy.*a minute/i, true, false],
    [503, { code: 'UPSTREAM_BUSY' }, /a minute/, true, false],
    [504, { code: 'TIMEOUT' }, /did not answer in time/i, true, false],
    [502, { code: 'MALFORMED' }, /could not be read/i, true, false],
    [502, { code: 'UNREACHABLE' }, /could not be reached/i, true, false],
    [500, { error: 'Internal server error' }, /^Internal server error$/, true, false],
    [500, undefined, /failed \(500\)/, true, false],
  ]
  for (const [status, body, re, retry, signIn] of cases) {
    const m = importErrorMessage(status, body)
    assert.match(m.message, re, `${status} ${body?.code || ''}`)
    assert.equal(m.retry, retry, `${status} ${body?.code || ''} retry`)
    assert.equal(m.signIn, signIn, `${status} ${body?.code || ''} sign in`)
  }
  assert.equal(ORCID_WORKS_URL, '/api/admin/orcid/works')
})
