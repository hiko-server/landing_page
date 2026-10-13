/**
 * cv-docs: the build wiring the downloadable CVs need in production —
 * stable rewrites for the six file URLs, the PDF stack kept as plain Node
 * requires, the fonts traced into the standalone image (and shipped with
 * their OFL licences), a bounded ISR stale window, and the edge purge list.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ALL_EXPORT_PATHS } from '../lib/cvExport/files'
import { PDF_FONT_FILES } from '../lib/cvExport/pdf'
import { CV_DOCUMENT_PATHS, CV_PAGE_PATHS, HOME_PAGE_PATHS, STATIC_CONTENT_PATHS, derivedPurgePaths } from '../lib/revalidate'

const require = createRequire(import.meta.url)
const cfg = require('../next.config.js')

test('every file URL is rewritten to /api/cv/export with its language and format', async () => {
  const { beforeFiles } = await cfg.rewrites()
  for (const p of ALL_EXPORT_PATHS) {
    const rule = beforeFiles.find((r: { source: string }) => r.source === p)
    assert.ok(rule, `${p} rewritten`)
    const [, format] = p.match(/\.(pdf|txt|json)$/)!
    assert.equal(rule.destination, `/api/cv/export?lang=${p.startsWith('/cv/zh') ? 'zh' : 'en'}&format=${format}`)
  }
})

test('the PDF stack stays external and its fonts are traced into the standalone build', () => {
  for (const pkg of ['pdfkit', 'fontkit', 'linebreak']) assert.ok(cfg.serverExternalPackages.includes(pkg), pkg)
  const traced: string[] = cfg.outputFileTracingIncludes['/api/cv/export']
  for (const file of Object.values(PDF_FONT_FILES)) {
    assert.ok(fs.existsSync(path.join(process.cwd(), file)), `${file} exists`)
    assert.ok(traced.some((g) => g === `./${file}` || (g.endsWith('/**/*') && `./${file}`.startsWith(g.slice(0, -4)))), `${file} traced`)
  }
  // OFL: each embedded face ships with its licence.
  assert.ok(fs.readFileSync(path.join(process.cwd(), 'assets/pdf/OFL-NotoSansSC.txt'), 'utf8').includes('SIL OPEN FONT LICENSE Version 1.1'))
  assert.ok(fs.existsSync(path.join(process.cwd(), 'assets/og/OFL-Geist.txt')))
  // The CJK subset stays a reasonable size for the image (≈ 8 MB, full font 13 MB).
  assert.ok(fs.statSync(path.join(process.cwd(), PDF_FONT_FILES.cjk)).size < 9 * 1024 * 1024)
})

test('ISR: bounded stale window; CV pages are regenerated on store restores and purge their files', () => {
  assert.equal(cfg.expireTime, 86400)
  assert.deepEqual([...CV_DOCUMENT_PATHS], ['/cv', '/cv/zh'])
  for (const p of CV_DOCUMENT_PATHS) {
    assert.ok((STATIC_CONTENT_PATHS as readonly string[]).includes(p))
    // CV and home writes regenerate the CV pages (the home socials, portrait and availability feed the header).
    assert.ok(CV_PAGE_PATHS.includes(p), `CV writes regenerate ${p}`)
    assert.ok(HOME_PAGE_PATHS.includes(p), `home writes regenerate ${p}`)
  }
  assert.deepEqual(derivedPurgePaths([...CV_DOCUMENT_PATHS]).sort(), [...ALL_EXPORT_PATHS].sort())
})
