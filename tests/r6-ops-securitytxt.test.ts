/**
 * FIX-25: RFC 9116 /.well-known/security.txt from the public CV contact, and
 * no documentation pointing reporters at GitHub private advisories (disabled
 * on the repository).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  SECURITY_TXT_PATH,
  buildSecurityTxt,
  publicEmailOf,
  repositoryWebUrl,
  securityContactFrom,
  securityPolicyUrl,
  securityTxtExpires,
} from '../lib/securityTxt'

const repoRoot = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), 'utf8')
const NOW = Date.UTC(2026, 9, 13, 8, 30, 15, 123)

test('only well-formed, mailto-safe addresses are used', () => {
  assert.equal(publicEmailOf('  owner.name+sec@example.co.uk '), 'owner.name+sec@example.co.uk')
  for (const bad of ['', 'not-an-email', 'a@b', 'a b@example.com', 'a@example.com\nContact: x', 'a%40@example.com', 'a@-x.com', 'a?x@example.com', 42, null]) {
    assert.equal(publicEmailOf(bad), null, String(bad))
  }
  // A hidden e-mail is blanked by pruning (''), so the next section is tried.
  assert.equal(securityContactFrom([{ email: '', redacted: ['email'] }, { email: 'zh@example.com' }]), 'zh@example.com')
  assert.equal(securityContactFrom([{ email: '' }, null, {}]), null)
})

test('the policy URL is SECURITY.md of the package.json repository', () => {
  assert.equal(repositoryWebUrl({ type: 'git', url: 'git+https://github.com/hiko-server/portfolio-studio.git' }), 'https://github.com/hiko-server/portfolio-studio')
  assert.equal(repositoryWebUrl('git@github.com:o/r.git'), 'https://github.com/o/r')
  assert.equal(repositoryWebUrl('github:o/r'), 'https://github.com/o/r')
  assert.equal(repositoryWebUrl('https://gitlab.com/o/r.git'), null)
  assert.equal(repositoryWebUrl(undefined), null)
  const pkg = JSON.parse(read('package.json'))
  assert.equal(securityPolicyUrl(pkg.repository), 'https://github.com/hiko-server/portfolio-studio/blob/main/SECURITY.md')
})

test('the file has every RFC 9116 field, LF lines, and an Expires 180 days ahead', () => {
  assert.equal(securityTxtExpires(NOW), '2027-04-11T08:30:15Z')
  const body = buildSecurityTxt({ email: 'me@example.com', siteUrl: 'https://lucian-dev.com/', policyUrl: 'https://github.com/o/r/blob/main/SECURITY.md', now: NOW })
  const fields = Object.fromEntries(
    body
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]),
  )
  assert.deepEqual(fields, {
    Contact: 'mailto:me@example.com',
    Expires: '2027-04-11T08:30:15Z',
    'Preferred-Languages': 'en, zh',
    Canonical: 'https://lucian-dev.com/.well-known/security.txt',
    Policy: 'https://github.com/o/r/blob/main/SECURITY.md',
  })
  assert.ok(body.endsWith('\n') && !body.includes('\r'))
  const days = (Date.parse(fields.Expires) - NOW) / 86_400_000
  assert.ok(days > 179 && days <= 180, 'always valid, well under the one-year limit')
  assert.doesNotMatch(buildSecurityTxt({ email: 'me@example.com', siteUrl: 'https://x.dev', policyUrl: null, now: NOW }), /^Policy:/m)
})

test('next.config rewrites the well-known path to the generator', () => {
  const config = read('next.config.js')
  assert.ok(config.includes(`{ source: '${SECURITY_TXT_PATH}', destination: '/api/security-txt' }`))
})

test('docs point reporters to security.txt / e-mail, never to the disabled private-advisory flow', () => {
  for (const file of ['SECURITY.md', 'README.md', 'README.zh.md', 'CONTRIBUTING.md', '.github/ISSUE_TEMPLATE/config.yml']) {
    const text = read(file)
    assert.doesNotMatch(text, /security\/advisories\/new/, file)
    assert.doesNotMatch(text, /private (security )?advisory/i, file)
  }
  assert.match(read('SECURITY.md'), /\/\.well-known\/security\.txt/)
  assert.match(read('README.md'), /\/\.well-known\/security\.txt/)
  assert.match(read('README.zh.md'), /\/\.well-known\/security\.txt/)
})

// ── The route, through the real content store ────────────────────────────

type Handler = (req: any, res: any) => unknown
let handler: Handler
let putKv: typeof import('../lib/contentStore').putKv
let closeDb: () => void
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r6-securitytxt-'))

async function call(method = 'GET') {
  const out = { status: 200, headers: {} as Record<string, string>, body: undefined as string | undefined }
  const res: any = {
    status(c: number) {
      out.status = c
      return res
    },
    setHeader(n: string, v: unknown) {
      out.headers[n.toLowerCase()] = String(v)
      return res
    },
    getHeader: (n: string) => out.headers[n.toLowerCase()],
    end(payload?: string) {
      out.body = payload
      return res
    },
    json(b: unknown) {
      out.body = JSON.stringify(b)
      return res
    },
  }
  await handler({ method, headers: {}, query: {} }, res)
  return out
}

before(async () => {
  for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k]
  process.env.LOG_LEVEL = 'error'
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  fs.copyFileSync(path.join(repoRoot, 'package.json'), path.join(tmp, 'package.json'))
  process.chdir(tmp)
  handler = (await import('../pages/api/security-txt')).default as Handler
  putKv = (await import('../lib/contentStore')).putKv
  closeDb = (await import('../lib/db')).closeDb
})

after(() => {
  closeDb()
  process.chdir(repoRoot)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('GET serves the public CV e-mail as text/plain; a hidden e-mail (or section) means 404', async () => {
  const personal = (over: Record<string, unknown> = {}) => ({ sessionName: 'personalInformation', firstName: 'A', email: 'owner@example.com', ...over })
  await putKv('cvdata', { en: [personal()], zh: [] })
  const ok = await call()
  assert.equal(ok.status, 200)
  assert.equal(ok.headers['content-type'], 'text/plain; charset=utf-8')
  assert.match(ok.body || '', /^Contact: mailto:owner@example\.com$/m)
  assert.match(ok.body || '', /^Policy: https:\/\/github\.com\/hiko-server\/portfolio-studio\/blob\/main\/SECURITY\.md$/m)
  assert.match(ok.body || '', /^Canonical: https:\/\/[^/\s]+\/\.well-known\/security\.txt$/m)
  const expires = Date.parse(/^Expires: (.+)$/m.exec(ok.body || '')?.[1] || '')
  assert.ok(expires - Date.now() > 179 * 86_400_000)

  const head = await call('HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.body, undefined)
  assert.equal((await call('POST')).status, 405)

  await putKv('cvdata', { en: [personal({ hiddenFields: ['email'] })], zh: [] })
  const hidden = await call()
  assert.equal(hidden.status, 404)
  assert.doesNotMatch(hidden.body || '', /owner@example\.com/)

  await putKv('cvdata', { en: [personal({ showOnWebsite: false })], zh: [] })
  assert.equal((await call()).status, 404, 'a section hidden from the website is not a public contact')
})
