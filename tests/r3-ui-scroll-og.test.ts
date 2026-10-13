import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { NEXT_SCROLL_KEY_PREFIX, readSavedScroll, restoreTargetFor } from '../components/Common/scrollRestore'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const store = (entries: Record<string, string>) => ({ getItem: (k: string) => (k in entries ? entries[k] : null) })

// ── Back / Forward scroll restoration ───────────────────────────────────────

test('saved positions are read from Next’s own sessionStorage entries', () => {
  const s = store({ [`${NEXT_SCROLL_KEY_PREFIX}abc`]: '{"x":0,"y":900}', [`${NEXT_SCROLL_KEY_PREFIX}bad`]: '{oops', [`${NEXT_SCROLL_KEY_PREFIX}neg`]: '{"x":-5,"y":-1}' })
  assert.deepEqual(readSavedScroll(s, 'abc'), { x: 0, y: 900 })
  assert.equal(readSavedScroll(s, 'bad'), null)
  assert.deepEqual(readSavedScroll(s, 'neg'), { x: 0, y: 0 })
  assert.equal(readSavedScroll(s, 'missing'), null)
  assert.equal(readSavedScroll(s, undefined), null)
  assert.equal(readSavedScroll(null, 'abc'), null)
  const throwing = { getItem: () => { throw new Error('denied') } }
  assert.equal(readSavedScroll(throwing, 'abc'), null)
})

test('a popstate to another page yields that page’s saved position; same page or foreign state yields none', () => {
  const s = store({ [`${NEXT_SCROLL_KEY_PREFIX}k1`]: '{"x":0,"y":900}' })
  assert.deepEqual(restoreTargetFor({ __N: true, as: '/about?tab=cv#x', key: 'k1' }, '/uses', s), { pageKey: '/about', position: { x: 0, y: 900 } })
  // Same page (hash / query change): nothing remounts, Next handles it.
  assert.equal(restoreTargetFor({ __N: true, as: '/about#top', key: 'k1' }, '/about', s), null)
  assert.equal(restoreTargetFor({ as: '/about', key: 'k1' }, '/uses', s), null)
  assert.equal(restoreTargetFor(null, '/uses', s), null)
  assert.equal(restoreTargetFor({ __N: true, as: '/about', key: 'nope' }, '/uses', s), null)
})

test('the Next internals this relies on are still there (guard for a Next upgrade)', () => {
  const router = readFileSync(path.join(ROOT, 'node_modules/next/dist/shared/lib/router/router.js'), 'utf8')
  // Quote style differs between Next releases (14: double, 15: single).
  assert.ok(
    router.includes(`"${NEXT_SCROLL_KEY_PREFIX}" + `) || router.includes(`'${NEXT_SCROLL_KEY_PREFIX}' + `),
    'router stores positions under the same key prefix',
  )
  assert.match(router, /window\.history\.scrollRestoration = ["']manual["']/)
})

test('the framer-motion fallback re-applies the position after the page swap', () => {
  const app = readFileSync(path.join(ROOT, 'pages/_app.tsx'), 'utf8')
  assert.match(app, /useDeferredScrollRestore\(!viewTransitions, pageKey\)/)
  assert.match(app, /<RestoreScrollOnMount pageKey=\{pageKey\} \/>/)
})

// ── /api/og Cache-Control ───────────────────────────────────────────────────

test('/api/og (Node runtime) sets exactly one Cache-Control on the response it writes', () => {
  // Since NEXT16-og-node the route copies the PNG bytes into the Node
  // response itself, so the library's own headers never reach the client:
  // the route's single res.setHeader('Cache-Control', …) is the only one.
  const src = readFileSync(path.join(ROOT, 'pages/api/og.tsx'), 'utf8')
  const code = src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
  assert.doesNotMatch(code, /runtime:\s*['"]edge['"]/)
  assert.equal((code.match(/setHeader\('Cache-Control'/g) || []).length, 2, 'one in send(), one for the 429')
  assert.match(code, /res\.setHeader\('Cache-Control', cacheControl\)/)
  assert.doesNotMatch(code, /['"]cache-control['"]\s*:/i, 'no header map passed to ImageResponse')
})
