import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BUDGETS, check, fontPreloads, measure } from '../scripts/perf-budget.mjs'

function fakeBuild(opts: { fontBytes: number; fonts: number; appBytes: number }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-budget-'))
  const next = path.join(root, '.next')
  const write = (rel: string, data: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(next, rel)), { recursive: true })
    fs.writeFileSync(path.join(next, rel), data)
  }
  // Random bytes do not compress, so gzip size ≈ raw size.
  const blob = (n: number) => Buffer.from(Array.from({ length: n }, () => Math.floor(Math.random() * 256)))
  write('static/chunks/framework.js', blob(1000))
  write('static/chunks/pages/_app.js', blob(opts.appBytes))
  write('static/chunks/pages/index.js', blob(2000))
  write('static/chunks/pages/admin.js', blob(900_000))
  write('static/css/app.css', 'body{margin:0}')
  write(
    'build-manifest.json',
    JSON.stringify({
      pages: {
        '/_app': ['static/chunks/framework.js', 'static/css/app.css', 'static/chunks/pages/_app.js'],
        '/': ['static/chunks/framework.js', 'static/chunks/pages/index.js'],
        '/admin/dashboard': ['static/chunks/pages/admin.js'],
        '/_error': ['static/chunks/framework.js'],
      },
    }),
  )
  const links = Array.from({ length: opts.fonts }, (_, i) => {
    write(`static/media/f${i}.woff2`, blob(opts.fontBytes))
    return `<link rel="preload" href="/_next/static/media/f${i}.woff2" as="font" type="font/woff2" crossorigin="anonymous"/>`
  }).join('')
  write('server/pages/blog.html', `<html><head>${links}<link rel="preload" href="/x.css" as="style"/></head></html>`)
  write('server/pages/index.html', `<html><head>${links}</head></html>`)
  return { root, next }
}

test('fontPreloads finds font preloads regardless of attribute order', () => {
  const html =
    '<link as="font" href="/a.woff2" rel="preload" crossorigin>' +
    "<link rel='preload' href='/b.woff2' as='font'>" +
    '<link rel="preload" href="/c.css" as="style">' +
    '<link rel="stylesheet" href="/d.woff2">'
  assert.deepEqual(fontPreloads(html), ['/a.woff2', '/b.woff2'])
})

test('measure + check: within budget', () => {
  const { root, next } = fakeBuild({ fontBytes: 60 * 1024, fonts: 1, appBytes: 50 * 1024 })
  try {
    const m = measure(next, path.join(root, 'public'))
    assert.deepEqual(Object.keys(m.pages), ['/'], 'admin and internal pages are excluded')
    assert.ok(m.sharedJs.total > 50 * 1024)
    assert.equal(m.fonts['/'].length, 1)
    assert.equal(m.fonts['/blog'][0].bytes, 60 * 1024)
    assert.deepEqual(check(m), [])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('measure + check: over budget is reported once per problem', () => {
  const { root, next } = fakeBuild({ fontBytes: 300 * 1024, fonts: 3, appBytes: (BUDGETS.sharedJsKb + 5) * 1024 })
  try {
    const failures = check(measure(next, path.join(root, 'public')))
    assert.ok(failures.some((f: string) => f.startsWith('shared first-load JS')))
    assert.equal(failures.filter((f: string) => f.includes('font preloads >')).length, 1)
    assert.equal(failures.filter((f: string) => f.startsWith('preloaded fonts')).length, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a missing build is an error, not a pass', () => {
  assert.throws(() => measure(path.join(os.tmpdir(), 'definitely-not-a-next-dir')), /build-manifest/)
})
