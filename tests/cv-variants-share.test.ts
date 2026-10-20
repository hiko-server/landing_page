/**
 * E4 — CV variants and their private share links, end to end over a
 * throw-away content store and auth.db (tests/editorialHarness):
 *
 *   tokens     signed (a tampered or unsigned token never reaches the
 *              store), stored as a hash only, nothing without JWT_SECRET;
 *   variants   the admin API (validation, If-Match, a deleted variant
 *              revokes its links, the page-count measurement) and the pure
 *              selection (order, chosen entries, hidden always wins);
 *   links      create (recent sign-in), list, revoke, extend, note, remove;
 *              the open counter (+1 and a UTC day, nothing about the
 *              visitor; DNT / GPC, bots and a signed-in owner not counted);
 *   the page   getServerSideProps: the variant for the 'private' surface,
 *              every way to fail is the same 404, private / no-store /
 *              noindex / no-referrer headers; the PDF route.
 * Synthetic data only (Example Person, example.com).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { editorialHarness } from './editorialHarness'

const h = editorialHarness('cv-variants-share')

const PRIVATE_PHONE = '+00 1234 ZZ-PRIVATE-PHONE'
const DOWNLOAD_ADDRESS = 'ZZ-DOWNLOAD-ONLY Example Road'
const HIDDEN = 'ZZ-HIDDEN-GPA'

function cv() {
  const en = [
    {
      sessionName: 'personalInformation',
      firstName: 'Example',
      lastName: 'Person',
      email: 'person@example.com',
      phoneNumber: PRIVATE_PHONE,
      address: DOWNLOAD_ADDRESS,
      introduction: 'A synthetic summary for the tests.',
      fieldsOnlyIn: { phoneNumber: ['private'], address: ['download'] },
    },
    {
      sessionName: 'education',
      educationExperience: [{ uid: 'edu-1', schoolName: 'Example University', degree: 'BSc Example', gpa: HIDDEN, hiddenFields: ['gpa'], startDate: '2019-09', endDate: '2023-06' }],
    },
    {
      sessionName: 'workExperience',
      experiences: [
        { uid: 'job-ml', jobTitle: 'ML Engineer', companyName: 'Example AI', startDate: '2024-01', endDate: 'present', features: [{ description: 'Trained ZZ-ML-MODELS' }] },
        { uid: 'job-web', jobTitle: 'Web Developer', companyName: 'Example Web', startDate: '2023-01', endDate: '2023-12', features: [{ description: 'Built ZZ-WEB-APPS' }] },
        { uid: 'job-gone', jobTitle: 'ZZ-HIDDEN-JOB', companyName: 'Hidden Co', isVisible: false },
      ],
    },
    { sessionName: 'skill', languages: [{ uid: 'sk-1', language: 'Python', level: 'Advanced' }] },
  ]
  const zh = [
    { sessionName: 'personalInformation', firstName: '例', lastName: '人', phoneNumber: PRIVATE_PHONE, fieldsOnlyIn: { phoneNumber: ['private'] } },
    {
      sessionName: 'workExperience',
      experiences: [
        { uid: 'job-ml', jobTitle: '机器学习工程师', companyName: '示例 AI', startDate: '2024-01', endDate: 'present' },
        { uid: 'job-web', jobTitle: '网页开发', companyName: '示例网页', startDate: '2023-01', endDate: '2023-12' },
      ],
    },
  ]
  return { en, zh }
}

const variant = (over: Record<string, unknown> = {}) => ({
  id: 'vmachinelearn',
  name: 'Machine learning',
  pageTarget: 1,
  sections: [{ name: 'personalInformation' }, { name: 'workExperience', entries: { experiences: ['job-ml', 'job-gone'] } }, { name: 'education' }],
  ...over,
})

let routes: {
  variants: (req: any, res: any) => unknown
  links: (req: any, res: any) => unknown
  share: (req: any, res: any) => unknown
}

before(async () => {
  // The PDF renderer reads its fonts from assets/ under the working directory.
  fs.symlinkSync(path.join(process.cwd(), 'assets'), path.join(h.tmp, 'assets'))
  await h.setup()
  const { writeCvData } = await import('../lib/cvdata')
  assert.equal((await writeCvData(cv())).ok, true)
  routes = {
    variants: (await import('../pages/api/admin/cv-variants')).default,
    links: (await import('../pages/api/admin/cv-share-links')).default,
    share: (await import('../pages/api/cv/share')).default,
  }
})
after(() => h.teardown())

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

// ── Tokens ─────────────────────────────────────────────────────────────────

test('tokens: 43 url-safe characters, signed, stored as a hash; a changed character or another key fails', async () => {
  const { mintShareToken, verifyShareToken, shareKey, shareTokenHash, SHARE_TOKEN_RE } = await import('../lib/cvShare/token')
  const key = shareKey()
  assert.ok(key)
  const { token, hash } = mintShareToken(key!)
  assert.match(token, SHARE_TOKEN_RE)
  assert.equal(hash, shareTokenHash(token))
  assert.equal(hash.length, 64)
  assert.ok(!hash.includes(token))
  assert.equal(verifyShareToken(token, key), true)
  const flipped = token.slice(0, 5) + (token[5] === 'A' ? 'B' : 'A') + token.slice(6)
  assert.equal(verifyShareToken(flipped, key), false)
  assert.equal(verifyShareToken(token, shareKey('another-secret')), false)
  assert.equal(verifyShareToken(token, null), false)
  assert.equal(shareKey(''), null)
  assert.equal(verifyShareToken('short', key), false)
})

// ── Variants ───────────────────────────────────────────────────────────────

test('variants: validation names what is wrong; the selection keeps its order and never brings back what is hidden', async () => {
  const { validateVariantDoc, applyVariant, variantFromCv, readVariantDoc } = await import('../lib/cvVariants')
  assert.equal(validateVariantDoc({ variants: [variant()] }).ok, true)
  const bad = validateVariantDoc({
    variants: [variant({ id: 'BAD' }), variant({ id: 'vsecondone', name: ' machine  LEARNING ', pageTarget: 9, sections: [{ name: 'skill' }, { name: 'skill' }, { name: 'education', entries: { educationExperience: ['ok', 'ok'] } }] })],
  })
  assert.equal(bad.ok, false)
  const msgs = bad.ok ? '' : bad.errors.map((e) => e.message).join('\n')
  assert.match(msgs, /malformed id/)
  assert.match(msgs, /Two variants are called/)
  assert.match(msgs, /1 to 4 pages/)
  assert.match(msgs, /lists skill twice/)
  assert.match(msgs, /distinct entry ids/)
  assert.deepEqual(readVariantDoc('garbage'), { variants: [] })

  const doc = cv()
  const picked = applyVariant(doc.en, variant())
  assert.deepEqual(picked.map((s) => s.sessionName), ['personalInformation', 'workExperience', 'education'])
  assert.deepEqual((picked[1] as any).experiences.map((e: any) => e.uid), ['job-ml', 'job-gone'], 'chosen entries in the variant’s order')
  const { publicSections } = await import('../lib/cvVisibility')
  const out = JSON.stringify(publicSections(picked, 'cv', 'private'))
  assert.ok(out.includes('ZZ-ML-MODELS') && out.includes(PRIVATE_PHONE))
  assert.ok(!out.includes('ZZ-WEB-APPS'), 'an entry the variant leaves out')
  assert.ok(!out.includes('ZZ-HIDDEN-JOB') && !out.includes(HIDDEN), 'hidden always wins')
  assert.ok(!out.includes('ZZ-DOWNLOAD-ONLY'), 'a field kept to downloads')

  const fresh = variantFromCv([...doc.en, { sessionName: 'patents', isVisible: false }], 'Full-stack')
  assert.deepEqual(fresh.sections.map((s) => s.name), ['personalInformation', 'education', 'workExperience', 'skill'], 'what the A4 CV prints today')
})

test('variants API: save with If-Match, a conflict answers 409, invalid answers 422', async () => {
  const get = await h.call(routes.variants)
  assert.equal(get.statusCode, 200)
  assert.deepEqual(get.body.variants, [])
  assert.equal(get.body.keyConfigured, true)
  assert.equal(get.headers.etag, '"0"')

  const saved = await h.call(routes.variants, { method: 'PUT', body: { variants: [variant()] }, headers: { 'if-match': '"0"' } })
  assert.equal(saved.statusCode, 200, JSON.stringify(saved.body))
  assert.ok(saved.headers.etag && saved.headers.etag !== '"0"')
  const stale = await h.call(routes.variants, { method: 'PUT', body: { variants: [] }, headers: { 'if-match': '"0"' } })
  assert.equal(stale.statusCode, 409)
  const invalid = await h.call(routes.variants, { method: 'PUT', body: { variants: [variant({ name: '' })] }, headers: { 'if-match': saved.headers.etag } })
  assert.equal(invalid.statusCode, 422)
  assert.equal(invalid.body.code, 'INVALID_VARIANTS')
  assert.equal((await h.call(routes.variants, { auth: false })).statusCode, 401)
})

test('variants API: measuring renders the variant’s real PDF in both languages and stores nothing', async () => {
  const before = (await h.call(routes.variants)).headers.etag
  const r = await h.call(routes.variants, { method: 'POST', body: { action: 'measure', variant: variant() } })
  assert.equal(r.statusCode, 200, JSON.stringify(r.body))
  assert.equal(r.body.en.pages, 1)
  assert.ok(r.body.en.lastPageFill > 0 && r.body.en.lastPageFill <= 1)
  assert.equal(r.body.zh.pages, 1)
  assert.equal((await h.call(routes.variants)).headers.etag, before)
})

// ── Links ──────────────────────────────────────────────────────────────────

async function createLink(body: Record<string, unknown> = {}) {
  const r = await h.call(routes.links, { method: 'POST', body: { variantId: 'vmachinelearn', lang: 'en', days: 30, note: '  Example Corp —\n ML role  ', ...body } })
  assert.equal(r.statusCode, 201, JSON.stringify(r.body))
  return r.body as { link: any; token: string; path: string }
}

test('links: created once with the token, listed without it; the note is the owner’s single line', async () => {
  const made = await createLink()
  assert.match(made.path, /^\/cv\/r\/[A-Za-z0-9_-]{43}$/)
  assert.equal(made.link.state, 'active')
  assert.equal(made.link.note, 'Example Corp — ML role')
  assert.equal(made.link.openCount, 0)
  const listed = await h.call(routes.links, { query: { variant: 'vmachinelearn' } })
  const text = JSON.stringify(listed.body)
  assert.ok(!text.includes(made.token), 'the token is never listed')
  assert.ok(!/token_hash|tokenHash/.test(text))
  assert.equal(listed.body.links[0].id, made.link.id)

  const { getAuthDb } = await import('../lib/adminAuth/db')
  const row = getAuthDb().prepare('SELECT * FROM cv_share_links WHERE id = ?').get(made.link.id) as Record<string, unknown>
  assert.ok(!JSON.stringify(row).includes(made.token), 'only the hash is stored')

  assert.equal((await h.call(routes.links, { method: 'POST', body: { variantId: 'vnosuchone' } })).statusCode, 404)
  assert.equal((await h.call(routes.links, { method: 'POST', body: { variantId: 'vmachinelearn', days: 400 } })).statusCode, 400)
})

test('the page: the variant for private links — chosen entries, private fields — never what is hidden or kept elsewhere', async () => {
  const made = await createLink()
  const { shareServerSideProps } = await import('../lib/cvShare/gssp')
  const headers: Record<string, string> = {}
  const res: any = { statusCode: 200, setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = v) }
  const out: any = await shareServerSideProps({ params: { token: made.token }, res } as any, null)
  assert.equal(res.statusCode, 200)
  assert.equal(out.props.state, 'ok')
  assert.equal(out.props.cvLang, 'en')
  assert.equal(out.props.otherLang, 'zh')
  assert.match(out.props.fileBase, /^Person-Example-CV-\d{4}-\d{2}$/)
  const props = JSON.stringify(out.props)
  assert.ok(props.includes(PRIVATE_PHONE) && props.includes('ZZ-ML-MODELS'))
  for (const never of ['ZZ-WEB-APPS', 'ZZ-HIDDEN-JOB', HIDDEN, 'ZZ-DOWNLOAD-ONLY', 'fieldsOnlyIn', 'job-ml', 'Machine learning', 'vmachinelearn', 'Example Corp']) {
    assert.ok(!props.includes(never), `page props (= __NEXT_DATA__) must not carry ${never}`)
  }
  assert.equal(headers['cache-control'], 'private, no-store, max-age=0')
  assert.match(headers['x-robots-tag'], /noindex/)
  assert.equal(headers['referrer-policy'], 'no-referrer')

  const zh: any = await shareServerSideProps({ params: { token: made.token }, res } as any, 'zh')
  assert.equal(zh.props.cvLang, 'zh')
  assert.equal(zh.props.lang, 'zh-Hans')
  assert.ok(JSON.stringify(zh.props).includes('机器学习工程师'))
  assert.ok(!JSON.stringify(zh.props).includes('网页开发'))
})

test('the page: every way a link fails is the same 404 “not available”', async () => {
  const { shareServerSideProps } = await import('../lib/cvShare/gssp')
  const run = async (token: unknown) => {
    const res: any = { statusCode: 200, setHeader: () => undefined }
    const out: any = await shareServerSideProps({ params: { token }, res } as any, null)
    return { status: res.statusCode, props: out.props }
  }
  const { mintShareToken, shareKey } = await import('../lib/cvShare/token')
  const unknown = mintShareToken(shareKey()!).token
  const made = await createLink()
  const tampered = made.token.slice(0, -1) + (made.token.endsWith('A') ? 'B' : 'A')
  for (const t of ['nope', '', unknown, tampered, undefined]) {
    const r = await run(t)
    assert.equal(r.status, 404, String(t))
    assert.deepEqual(Object.keys(r.props).sort(), ['clockMonth', 'cvLang', 'lang', 'state'])
    assert.equal(r.props.state, 'unavailable')
  }
  // Revoked: gone at once.
  assert.equal((await run(made.token)).status, 200)
  const revoked = await h.call(routes.links, { method: 'PATCH', body: { id: made.link.id, action: 'revoke' } })
  assert.equal(revoked.body.link.state, 'revoked')
  assert.equal((await run(made.token)).status, 404)
  // A revoked link stays revoked.
  assert.equal((await h.call(routes.links, { method: 'PATCH', body: { id: made.link.id, action: 'extend', days: 7 } })).statusCode, 409)
  // Expired: gone; extending brings it back for that long.
  const later = await createLink()
  const { getAuthDb } = await import('../lib/adminAuth/db')
  getAuthDb().prepare('UPDATE cv_share_links SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, later.link.id)
  assert.equal((await run(later.token)).status, 404)
  const extended = await h.call(routes.links, { method: 'PATCH', body: { id: later.link.id, action: 'extend', days: 7 } })
  assert.equal(extended.statusCode, 200)
  assert.equal(extended.body.link.state, 'active')
  assert.equal((await run(later.token)).status, 200)
  // Removing: only an ended link.
  assert.equal((await h.call(routes.links, { method: 'DELETE', body: { id: later.link.id } })).statusCode, 409)
  assert.equal((await h.call(routes.links, { method: 'DELETE', body: { id: made.link.id } })).statusCode, 200)
  assert.equal((await h.call(routes.links, { method: 'PATCH', body: { id: made.link.id, action: 'revoke' } })).statusCode, 404)
})

test('opens: +1 and the UTC day for a rendered page; never for DNT / GPC, bots, the signed-in owner or a dead link', async () => {
  const made = await createLink()
  const open = (headers: Record<string, string>, auth = false, token = made.token) =>
    h.call(routes.share, { method: 'POST', auth, body: JSON.stringify({ t: token }), headers: { 'user-agent': UA, host: 'cv.example.com', ...headers } })
  const count = async () => (await h.call(routes.links, { query: { variant: 'vmachinelearn' } })).body.links.find((l: any) => l.id === made.link.id)
  assert.equal((await open({})).statusCode, 204)
  assert.equal((await count()).openCount, 1)
  assert.equal((await count()).lastOpenedDay, new Date().toISOString().slice(0, 10))
  await open({ dnt: '1' })
  await open({ 'sec-gpc': '1' })
  await open({ 'user-agent': 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' })
  await open({}, true)
  await open({ 'sec-fetch-site': 'cross-site' })
  assert.equal((await count()).openCount, 1, 'none of those counted')
  await h.call(routes.links, { method: 'PATCH', body: { id: made.link.id, action: 'revoke' } })
  await open({})
  assert.equal((await count()).openCount, 1, 'a revoked link counts nothing')
  const { getAuthDb } = await import('../lib/adminAuth/db')
  const cols = (getAuthDb().prepare('PRAGMA table_info(cv_share_links)').all() as Array<{ name: string }>).map((c) => c.name)
  assert.deepEqual(cols.filter((c) => /ip|agent|ua|device|country|visitor/i.test(c)), [], 'nothing about a visitor can be stored')
})

test('the PDF: the variant, privately; 404 for anything else', async () => {
  const made = await createLink()
  let body: Buffer | null = null
  const headers: Record<string, string> = {}
  const res: any = {
    statusCode: 200,
    setHeader: (k: string, v: unknown) => (headers[k.toLowerCase()] = String(v)),
    status(c: number) {
      res.statusCode = c
      return res
    },
    json: () => res,
    end: (b?: Buffer) => ((body = b ?? null), res),
  }
  await routes.share({ method: 'GET', url: '/api/cv/share', query: { token: made.token, lang: 'en' }, headers: { 'user-agent': UA }, cookies: {}, socket: { remoteAddress: '127.0.0.90' } }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(headers['content-type'], 'application/pdf')
  assert.equal(headers['cache-control'], 'private, no-store, max-age=0')
  assert.match(headers['x-robots-tag'], /noindex/)
  assert.match(headers['content-disposition'], /Person-Example-CV-\d{4}-\d{2}\.pdf/)
  assert.ok(body && (body as Buffer).subarray(0, 5).toString() === '%PDF-')
  const miss = await h.call(routes.share, { auth: false, query: { token: 'nope', lang: 'en' }, headers: { 'user-agent': UA } })
  assert.equal(miss.statusCode, 404)
})

test('deleting a variant revokes its links at once', async () => {
  const made = await createLink()
  const etag = (await h.call(routes.variants)).headers.etag
  const r = await h.call(routes.variants, { method: 'PUT', body: { variants: [] }, headers: { 'if-match': etag } })
  assert.equal(r.statusCode, 200)
  assert.ok(r.body.revoked >= 1)
  const { resolveShareToken } = await import('../lib/cvShare/store')
  assert.equal(resolveShareToken(made.token), null)
})

test('the error monitor never keeps a share token', async () => {
  const { normalizeErrorPath, scrubText } = await import('../lib/errors/scrub')
  const token = 'Abc123_-'.repeat(5) + 'xyz'
  assert.equal(normalizeErrorPath(`https://cv.example.com/cv/r/${token}/zh?x=1`), '/cv/r/[token]/zh')
  assert.ok(!scrubText(`Failed to load https://cv.example.com/cv/r/${token}/en.pdf`).includes(token))
  const { normalizeTrackedPath } = await import('../lib/analytics/shared')
  assert.equal(normalizeTrackedPath(`/cv/r/${token}`), null, 'analytics never records the page')
})

test('every response under /cv/r/ is private, unindexed and sends no Referer (the proxy, before any route)', async () => {
  const { applySecurityHeaders } = await import('../lib/security/responseHeaders')
  const res = applySecurityHeaders({ headers: new Headers() }, { pathname: '/cv/r/anything/en.pdf', adminContext: false })
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
  assert.match(String(res.headers.get('x-robots-tag')), /noindex/)
  assert.match(String(res.headers.get('cache-control')), /no-store/)
  const cv = applySecurityHeaders({ headers: new Headers() }, { pathname: '/cv', adminContext: false })
  assert.equal(cv.headers.get('x-robots-tag'), null)
})
