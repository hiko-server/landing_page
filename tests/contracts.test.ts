import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeHref } from '../lib/cvFormat'
import { isRedacted, publicSections } from '../lib/cvVisibility'

test('safeHref allows web, mail, tel and same-site links', () => {
  assert.equal(safeHref('https://a.com/x'), 'https://a.com/x')
  assert.equal(safeHref('HTTP://a.com'), 'HTTP://a.com')
  assert.equal(safeHref('lucian-dev.com/cv'), 'https://lucian-dev.com/cv')
  assert.equal(safeHref('mailto:hi@a.com'), 'mailto:hi@a.com')
  assert.equal(safeHref('tel:+85212345678'), 'tel:+85212345678')
  assert.equal(safeHref('/work/swcs'), '/work/swcs')
})

test('safeHref refuses script-capable and malformed links', () => {
  for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.com', 'not a url', '', 42, null]) {
    assert.equal(safeHref(bad), '', String(bad))
  }
})

test('pruning lists hidden field names in `redacted` and isRedacted reads it', () => {
  const [sec] = publicSections([
    { sessionName: 'workExperience', experiences: [{ companyName: 'A', endDate: '2023-05', hiddenFields: ['endDate'] }, { companyName: 'B', endDate: '' }] },
  ])
  const [a, b] = sec.experiences
  assert.equal(a.endDate, '')
  assert.deepEqual(a.redacted, ['endDate'])
  assert.equal(isRedacted(a, 'endDate'), true)
  assert.equal(isRedacted(b, 'endDate'), false)
  assert.equal('hiddenFields' in a, false)
  // Full editor documents answer from hiddenFields directly.
  assert.equal(isRedacted({ hiddenFields: ['gpa'] }, 'gpa'), true)
})

test('a smuggled `redacted` key in stored data is never passed through', () => {
  const [sec] = publicSections([{ sessionName: 'education', educationExperience: [{ schoolName: 'X', redacted: ['<script>'] }] }])
  assert.equal('redacted' in sec.educationExperience[0], false)
})

test('publicHome drops hidden photos and data of switched-off sections', async () => {
  const { publicHome } = await import('../lib/homeShape')
  const home: any = {
    hero: { brand: 'B', tagline: 't', welcome: '', avatarUrl: '' },
    socials: {},
    brands: [{ name: 'X', href: '', image: '' }],
    quickAccess: [],
    photos: [{ url: '/a.jpg' }, { url: '/b.jpg', visible: false }],
    sections: { brands: false },
    contact: { heading: 'Hi' },
  }
  const out = publicHome(home)!
  assert.deepEqual(out.photos, [{ url: '/a.jpg' }])
  assert.deepEqual(out.brands, [])
  assert.deepEqual(out.contact, { heading: 'Hi' })
  assert.equal(out.sections?.brands, false)
  assert.equal(publicHome(null), null)
})

test('collectionPaths covers index, item and capped siblings', async () => {
  const { collectionPaths, MAX_SIBLING_PATHS } = await import('../lib/revalidate')
  assert.deepEqual(collectionPaths('blog'), ['/blog'])
  assert.deepEqual(collectionPaths('work', 'a', ['a', 'b', '', 'c']), ['/work', '/work/a', '/work/b', '/work/c'])
  const many = Array.from({ length: MAX_SIBLING_PATHS + 20 }, (_, i) => `s${i}`)
  assert.equal(collectionPaths('blog', 'x', many).length, 2 + MAX_SIBLING_PATHS)
})

test('API routes never set a version ETag through res.json (Next would overwrite it)', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name)
      return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : []
    })
  const offenders = walk(path.join(process.cwd(), 'pages', 'api')).filter((f) =>
    /setHeader\(\s*['"]ETag['"]/i.test(fs.readFileSync(f, 'utf8')),
  )
  assert.deepEqual(offenders, [], 'use sendVersionedJson() from lib/http.ts instead')
})

test('sendVersionedJson keeps the given ETag and writes JSON', async () => {
  const { sendVersionedJson } = await import('../lib/http')
  const headers: Record<string, unknown> = {}
  let ended: string | undefined
  const res: any = { statusCode: 0, setHeader: (k: string, v: unknown) => (headers[k.toLowerCase()] = v), end: (b: string) => (ended = b) }
  sendVersionedJson(res, 409, { error: 'conflict', etag: '"5"' }, '"5"')
  assert.equal(res.statusCode, 409)
  assert.equal(headers.etag, '"5"')
  assert.equal(headers['content-type'], 'application/json; charset=utf-8')
  assert.deepEqual(JSON.parse(ended!), { error: 'conflict', etag: '"5"' })
})

test('the image optimizer stays disabled (GHSA-2xp9-vwfh-vxw4)', async () => {
  const { createRequire } = await import('node:module')
  const req = createRequire(import.meta.url)
  const cfg = req('../next.config.js')
  assert.equal(cfg.images?.unoptimized, true)
})

test('deployment files: loopback-only override example, untracked server override, pinned image', async () => {
  const fs = await import('node:fs')
  const read = (f: string) => fs.readFileSync(f, 'utf8')
  // Comments may mention what not to do; only the YAML itself counts.
  const example = read('docker-compose.override.example.yml').replace(/#.*$/gm, '')
  assert.match(example, /ports: !override\s+- "127\.0\.0\.1:3002:3000"/)
  assert.doesNotMatch(example, /0\.0\.0\.0/)
  assert.match(example, /driver: local/)
  assert.ok(read('.gitignore').split('\n').includes('docker-compose.override.yml'), 'the server override must stay untracked')
  for (const line of read('docker-compose.yml').split('\n').filter((l) => /^\s+- "[^"]*:\d+:\d+"$/.test(l))) {
    assert.match(line, /"127\.0\.0\.1:/, `compose publishes beyond loopback: ${line.trim()}`)
  }
  const dockerfile = read('Dockerfile')
  const froms = dockerfile.split('\n').filter((l) => l.startsWith('FROM '))
  assert.equal(froms.length, 2)
  for (const from of froms) assert.match(from, /^FROM node:22-alpine@sha256:[0-9a-f]{64} AS /)
  assert.match(dockerfile, /ARG NEXT_PUBLIC_BUILD_SHA/)
  assert.doesNotMatch(dockerfile, /^RUN .*apk upgrade/m)
})
