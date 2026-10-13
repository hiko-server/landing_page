/**
 * Static guards for round-5 review fixes that live in CSS, a component's
 * inline style and the deploy script (no runtime to exercise in node:test).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

test('hover-intent lists never dim rows on keyboard focus, and respect contrast preferences', () => {
  const css = read('styles/globals.css')
  assert.doesNotMatch(css, /\.hover-list:has\(:focus-visible\)/)
  const block = css.match(/@media \(hover: hover\)[^{]*\{\s*\.hover-list \.hover-item[\s\S]*?\n\}/)
  assert.ok(block, 'hover-list block present')
  assert.match(block[0], /prefers-contrast: no-preference/)
  assert.match(block[0], /forced-colors: none/)
})

test('reduced motion shows the hero name at once (no staggered delay)', () => {
  const css = read('styles/globals.css')
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.hero-word\s*\{\s*animation:\s*none/)
  const global = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,[\s\S]*?\}/)
  assert.ok(global)
  assert.match(global[0], /animation-delay:\s*0s !important/)
})

test('the lightbox keeps native pinch-zoom on the enlarged image', () => {
  const src = read('components/Common/Lightbox.tsx')
  assert.match(src, /touchAction: 'pinch-zoom'/)
  assert.doesNotMatch(src, /touchAction: 'none'/)
})

test('deploy.sh: tar tolerates a changing WAL, compose always recreates, a lost build aborts', () => {
  const sh = read('scripts/deploy.sh')
  assert.match(sh, /tar --warning=no-file-changed -czf "\$B\/data-uploads\.tgz"[^\n]*\|\| \[ \$\? -eq 1 \]/)
  assert.equal((sh.match(/docker compose up -d --no-build --force-recreate/g) || []).length, 2)
  assert.doesNotMatch(sh, /docker compose up -d --no-build\s*$/m)
  const lostBuild = sh.match(/if ! run build; then[\s\S]*?\nfi/)
  assert.ok(lostBuild)
  assert.match(lostBuild[0], /run abort/)
  assert.match(sh, /if \[ "\$\(cat "\$LOCK\/ts" 2>\/dev\/null \|\| true\)" != "\$TS" \]; then\s*trap - EXIT/)
})

test('the tracked CV seed carries nothing the owner hid (the repository is public)', async () => {
  const { publicCvDoc, REDACTED_KEY } = await import('../lib/cvVisibility')
  const seed = JSON.parse(read('data/cvdata.json'))
  const strip = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(strip)
    if (n && typeof n === 'object') {
      return Object.fromEntries(Object.entries(n).filter(([k]) => k !== REDACTED_KEY).map(([k, v]) => [k, strip(v)]))
    }
    return n
  }
  // Equal to its own public projection: no hidden entry, field, item or section.
  assert.deepEqual(strip(publicCvDoc(seed, 'any')), seed)
  const text = JSON.stringify(seed)
  assert.doesNotMatch(text, /"hiddenFields"|"hiddenItems"/)
})
