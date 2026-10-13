#!/usr/bin/env node
/**
 * Performance budget over a finished `next build` (CI runs it right after the
 * build; locally: `node scripts/perf-budget.mjs` after `yarn build`).
 *
 * Reads only build output:
 *   - .next/build-manifest.json → the JS every page loads first: the shared
 *     `/_app` chunks (framework, main, webpack runtime, _app) plus each
 *     public page's own chunks, measured gzip -9 like Next's build summary;
 *   - the shared CSS of `/_app`, gzip;
 *   - `<link rel="preload" as="font">` tags in every prerendered page
 *     (.next/server/pages/**.html) and the size of each preloaded file.
 *
 * Admin pages (/admin/*) are excluded from the page budget: they are behind
 * the login and lazy-load their editors. Exits 1 when any budget is exceeded
 * and prints a table either way; --json prints the raw measurement.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

/**
 * Thresholds in KiB (gzip for JS/CSS, raw bytes for fonts — woff2 is already
 * compressed). Set from a production build of this release (2026-10-13:
 * shared JS 195.8, heaviest public page `/` 242.8, shared CSS 3.5, two
 * preloaded Geist faces 137.7) with ~8% headroom; raise them only with a
 * reason in the commit message.
 */
export const BUDGETS = {
  sharedJsKb: 212,
  pageFirstLoadJsKb: 262,
  sharedCssKb: 8,
  fontPreloadCount: 2,
  fontPreloadKb: 150,
}

const SKIP_PAGES = new Set(['/_app', '/_error', '/_document'])
const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10

function gzipSize(file, cache) {
  if (!cache.has(file)) cache.set(file, fs.existsSync(file) ? zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length : 0)
  return cache.get(file)
}

function walkHtml(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walkHtml(p) : e.name.endsWith('.html') ? [p] : []
  })
}

/** Font preload hrefs in an HTML document (attribute order independent). */
export function fontPreloads(html) {
  const out = []
  for (const tag of String(html).match(/<link\b[^>]*>/gi) || []) {
    const attr = (name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1]
    if ((attr('rel') || '').toLowerCase().split(/\s+/).includes('preload') && (attr('as') || '').toLowerCase() === 'font') {
      const href = attr('href')
      if (href) out.push(href)
    }
  }
  return out
}

/** Local file behind a same-origin asset URL, or null. */
function assetFile(href, nextDir, publicDir) {
  const p = href.split(/[?#]/)[0]
  if (p.startsWith('/_next/')) return path.join(nextDir, p.slice('/_next/'.length))
  if (p.startsWith('/') && !p.startsWith('//')) return path.join(publicDir, p.slice(1))
  return null
}

export function measure(nextDir = path.join(repoRoot, '.next'), publicDir = path.join(repoRoot, 'public')) {
  const manifestFile = path.join(nextDir, 'build-manifest.json')
  if (!fs.existsSync(manifestFile)) throw new Error(`${manifestFile} not found — run \`next build\` first`)
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  const cache = new Map()
  const size = (rel) => gzipSize(path.join(nextDir, rel), cache)
  const appFiles = manifest.pages?.['/_app'] || []
  const sharedJs = appFiles.filter((f) => f.endsWith('.js'))
  const sharedCss = appFiles.filter((f) => f.endsWith('.css'))

  /** @type {Record<string, number>} gzip bytes of first-load JS per public page */
  const pages = {}
  for (const [page, files] of Object.entries(manifest.pages || {})) {
    if (SKIP_PAGES.has(page) || page === '/admin' || page.startsWith('/admin/')) continue
    const js = Array.from(new Set([...sharedJs, ...files.filter((f) => f.endsWith('.js'))]))
    pages[page] = js.reduce((sum, f) => sum + size(f), 0)
  }

  /** @type {Record<string, {href: string, bytes: number}[]>} font preloads per prerendered route */
  const fonts = {}
  const serverPages = path.join(nextDir, 'server', 'pages')
  for (const file of walkHtml(serverPages)) {
    const route = '/' + path.relative(serverPages, file).replace(/\\/g, '/').replace(/\.html$/, '').replace(/(^|\/)index$/, '')
    const hrefs = fontPreloads(fs.readFileSync(file, 'utf8'))
    fonts[route.replace(/\/$/, '') || '/'] = hrefs.map((href) => {
      const local = assetFile(href, nextDir, publicDir)
      return { href, bytes: local && fs.existsSync(local) ? fs.statSync(local).size : 0 }
    })
  }

  return {
    sharedJs: { files: sharedJs.map((f) => ({ file: f, gzip: size(f) })), total: sharedJs.reduce((s, f) => s + size(f), 0) },
    sharedCss: { files: sharedCss.map((f) => ({ file: f, gzip: size(f) })), total: sharedCss.reduce((s, f) => s + size(f), 0) },
    pages,
    fonts,
  }
}

/** Budget violations for a measurement (empty when everything fits). */
export function check(m, budgets = BUDGETS) {
  const failures = []
  if (kb(m.sharedJs.total) > budgets.sharedJsKb) {
    failures.push(`shared first-load JS ${kb(m.sharedJs.total)} KiB > ${budgets.sharedJsKb} KiB`)
  }
  if (kb(m.sharedCss.total) > budgets.sharedCssKb) {
    failures.push(`shared CSS ${kb(m.sharedCss.total)} KiB > ${budgets.sharedCssKb} KiB`)
  }
  for (const [page, bytes] of Object.entries(m.pages)) {
    if (kb(bytes) > budgets.pageFirstLoadJsKb) failures.push(`${page}: first-load JS ${kb(bytes)} KiB > ${budgets.pageFirstLoadJsKb} KiB`)
  }
  // Every page shares _document's preloads: report each distinct problem once.
  const tooMany = new Map()
  const tooHeavy = new Map()
  for (const [route, list] of Object.entries(m.fonts)) {
    const total = kb(list.reduce((s, f) => s + f.bytes, 0))
    if (list.length > budgets.fontPreloadCount) tooMany.set(list.length, [...(tooMany.get(list.length) || []), route])
    if (total > budgets.fontPreloadKb) tooHeavy.set(total, [...(tooHeavy.get(total) || []), route])
  }
  const where = (routes) => `${routes.slice(0, 3).join(', ')}${routes.length > 3 ? ` and ${routes.length - 3} more` : ''}`
  for (const [count, routes] of tooMany) failures.push(`${count} font preloads > ${budgets.fontPreloadCount} on ${where(routes)}`)
  for (const [total, routes] of tooHeavy) failures.push(`preloaded fonts ${total} KiB > ${budgets.fontPreloadKb} KiB on ${where(routes)}`)
  return failures
}

export function main(argv = process.argv.slice(2)) {
  const dirIdx = argv.indexOf('--dir')
  const nextDir = path.resolve(dirIdx >= 0 ? argv[dirIdx + 1] : path.join(repoRoot, '.next'))
  let m
  try {
    m = measure(nextDir, path.join(path.dirname(nextDir), 'public'))
  } catch (err) {
    console.error(`[perf-budget] ${err.message}`)
    return 1
  }
  if (argv.includes('--json')) console.log(JSON.stringify(m, null, 2))

  const heaviest = Object.entries(m.pages).sort((a, b) => b[1] - a[1])
  const fontWorst = Object.entries(m.fonts).sort((a, b) => b[1].length - a[1].length)[0]
  const fontTotal = fontWorst ? fontWorst[1].reduce((s, f) => s + f.bytes, 0) : 0
  const rows = [
    ['shared first-load JS (gzip)', kb(m.sharedJs.total), BUDGETS.sharedJsKb],
    ['heaviest public page JS (gzip)', heaviest.length ? kb(heaviest[0][1]) : 0, BUDGETS.pageFirstLoadJsKb, heaviest[0]?.[0]],
    ['shared CSS (gzip)', kb(m.sharedCss.total), BUDGETS.sharedCssKb],
    ['font preloads (count)', fontWorst ? fontWorst[1].length : 0, BUDGETS.fontPreloadCount, fontWorst?.[0]],
    ['font preloads (KiB)', kb(fontTotal), BUDGETS.fontPreloadKb, fontWorst?.[0]],
  ]
  for (const [label, value, limit, where] of rows) {
    console.log(`${value <= limit ? 'ok  ' : 'OVER'} ${label.padEnd(32)} ${String(value).padStart(7)} / ${limit}${where ? `  (${where})` : ''}`)
  }
  for (const [page, bytes] of heaviest.slice(0, 6)) console.log(`     ${page.padEnd(32)} ${String(kb(bytes)).padStart(7)} KiB`)

  const failures = check(m)
  for (const f of failures) console.error(`[perf-budget] OVER BUDGET: ${f}`)
  console.log(failures.length ? '[perf-budget] FAILED' : '[perf-budget] within budget')
  return failures.length ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main()
}
