/**
 * Cross-stream integration of wave 2A (the merged streams working together):
 * each block names the streams it joins. Source-level and pure checks; the
 * behaviour is covered end to end in e2e/wave2a-integration.spec.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { EXPORT_PATHS, cvPdfPath } from '../lib/cvExport/paths'
import { EXPORT_PATHS as FILE_EXPORT_PATHS } from '../lib/cvExport/files'

const ROOT = process.cwd()
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8')

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`
    if (statSync(path.join(ROOT, rel)).isDirectory()) sources(rel, out)
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(rel)
  }
  return out
}

// ── (c) home-about-isr + chrome-identity + cv-docs: CV download links ───────

test('(c) every CV download link points at the server-rendered PDFs, never the print dialog', () => {
  assert.equal(cvPdfPath('en'), '/cv.pdf')
  assert.equal(cvPdfPath('zh'), '/cv/zh.pdf')
  assert.equal(FILE_EXPORT_PATHS, EXPORT_PATHS, 'one table of export paths')
  const offenders = [...sources('components'), ...sources('pages'), ...sources('layout')].filter((f) =>
    /href=(\{`|["'{])\/cv(\?lang=\$\{[^}]+\})?[?&]print=1/.test(read(f)),
  )
  assert.deepEqual(offenders, [], 'links to /cv?print=1')
  assert.match(read('components/About/IdentityRail.tsx'), /href=\{cvPdfPath\(cvLang\)\}/)
  assert.match(read('pages/about/index.tsx'), /cvLang=\{active\}/)
  assert.match(read('components/Admin/cvStudio/Preview.tsx'), /href=\{cvPdfPath\(lang\)\}/)
  // The palette downloads both languages.
  const palette = read('components/General-UI/CommandPalette.tsx')
  assert.match(palette, /downloadFile\('\/cv\.pdf'\)/)
  assert.match(palette, /downloadFile\('\/cv\/zh\.pdf'\)/)
})
