/**
 * Static guards for round-5 review fixes that live in CSS, a component's
 * inline style and the deploy script (no runtime to exercise in node:test).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

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

test('the enlarged image can always be pinch-zoomed', () => {
  // Round 4 gave the image native pinch-zoom (it zoomed the page). Since C3
  // the viewer's stage takes every touch (touch-action: none) and zooms the
  // picture itself — pinch, double tap, the zoom button, + / − — so the page
  // is never left zoomed; tests/lightbox-gestures.test.ts guards the details.
  const src = read('components/Common/Lightbox.tsx')
  const engine = read('components/Common/lightboxEngine.ts')
  assert.equal((src.match(/touchAction: 'none'/g) || []).length, 1)
  assert.match(engine, /pinchView\(g\.start, a, b, this\.base, this\.viewBox\)/)
  assert.match(src, /aria-label=\{zoomed \? t\.zoomOut : t\.zoomIn\}/)
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

test('deploy.sh finalize keeps the 10 newest backup directories and never touches anything else (FIX-27)', () => {
  const sh = read('scripts/deploy.sh')
  const remote = sh.match(/^ {2}cat <<'REMOTE'\n([\s\S]*?)\nREMOTE$/m)?.[1]
  assert.ok(remote, 'remote heredoc present')
  assert.match(remote, /^KEEP_BACKUPS=10$/m)
  assert.match(remote, /chmod 700 "\$BACKUP_ROOT" "\$B"/)
  const backupDirs = remote.match(/^backup_dirs\(\) \{\n[\s\S]*?\n\}$/m)?.[0]
  assert.ok(backupDirs, 'backup_dirs() present')
  const finalize = remote.match(/^ {2}finalize\)\n([\s\S]*?)\n {4};;$/m)?.[1]
  assert.ok(finalize, 'finalize mode present')
  const start = finalize.indexOf('    pruned=0')
  const end = finalize.indexOf('    rm -f "$BUNDLE"')
  assert.ok(start > 0 && end > start, 'finalize prunes the backups before removing the bundle')

  // Run the real prune code against a scratch backup root.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r5-backups-'))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'r5-outside-'))
  try {
    const stamps = Array.from({ length: 13 }, (_, i) => `202610${String(i + 1).padStart(2, '0')}T120000Z`)
    for (const ts of stamps) {
      fs.mkdirSync(path.join(root, ts, 'preserve'), { recursive: true })
      fs.writeFileSync(path.join(root, ts, '.env'), 'JWT_SECRET=x')
    }
    fs.mkdirSync(path.join(root, 'manual-before-migration'))
    fs.writeFileSync(path.join(root, '20200101T000000Z'), 'a file, not a deploy backup')
    fs.writeFileSync(path.join(root, 'README'), 'notes')
    fs.symlinkSync(outside, path.join(root, '20190101T000000Z'))
    fs.writeFileSync(path.join(outside, 'keep.txt'), 'outside the backup root')

    const script = [
      'set -euo pipefail',
      'BACKUP_ROOT="$1"',
      'KEEP_BACKUPS=10',
      "say() { printf '%s\\n' \"$*\"; }",
      backupDirs,
      finalize.slice(start, end),
    ].join('\n')
    const out = execFileSync('bash', ['-c', script, 'bash', root], { encoding: 'utf8' })
    const left = fs.readdirSync(root).sort()
    assert.deepEqual(left, [...stamps.slice(3), '20190101T000000Z', '20200101T000000Z', 'README', 'manual-before-migration'].sort())
    for (const ts of stamps.slice(0, 3)) assert.match(out, new RegExp(`pruned old backup ${root}/${ts}/`))
    assert.match(out, /backups: 10 kept in .* \(newest 10\), 3 pruned/)
    assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'outside the backup root')

    // A second run has nothing left to prune.
    assert.match(execFileSync('bash', ['-c', script, 'bash', root], { encoding: 'utf8' }), /10 kept .*, 0 pruned/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  }
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
