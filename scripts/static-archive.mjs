#!/usr/bin/env node
/**
 * Keep earlier builds' browser assets (/_next/static) available for a week
 * after a deploy (docker-entrypoint.sh runs this before the server starts).
 *
 * Every build has new chunk names and a new build id, and the image only
 * carries its own .next/static. A page loaded before the deploy — an open
 * tab that lazily loads a chunk, or HTML of the previous build still in an
 * edge cache (see lib/edgeHtmlTtl.ts and scripts/edge-purge.mjs) — would ask
 * for files the new server answers with 404 and never finish hydrating.
 *
 * The archive is a volume (docker-compose.yml: /app/next-static-archive):
 *   1. every file of this build's .next/static is copied in (or touched),
 *   2. files no running build has used for STATIC_ARCHIVE_DAYS (default 7)
 *      are deleted,
 *   3. the remaining files of earlier builds are copied into .next/static
 *      without ever replacing one of this build's files.
 * Next lists .next/static once at start-up, so this must run before it.
 * All names under .next/static are content hashes or the build id, so a
 * file name never means two different contents. Best effort: it logs and
 * always exits 0, so it can never keep the site from starting.
 *
 *   node scripts/static-archive.mjs [--static <dir>] [--archive <dir>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DAY_MS = 86_400_000
export const DEFAULT_KEEP_DAYS = 7

/** STATIC_ARCHIVE_DAYS as whole days 1–90, else the default. */
export function keepDays(raw = process.env.STATIC_ARCHIVE_DAYS) {
  const n = Number(raw)
  return raw !== undefined && String(raw).trim() !== '' && Number.isInteger(n)
    ? Math.min(90, Math.max(1, n))
    : DEFAULT_KEEP_DAYS
}

/** Relative paths of every regular file under `dir` (empty when it does not exist). */
function filesUnder(dir) {
  const out = []
  const walk = (rel) => {
    let entries
    try {
      entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const r = rel ? path.join(rel, e.name) : e.name
      if (e.isDirectory()) walk(r)
      else if (e.isFile()) out.push(r)
    }
  }
  walk('')
  return out
}

/** Remove empty directories under `dir` (not `dir` itself). */
function pruneEmptyDirs(dir) {
  const walk = (abs) => {
    let entries
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true })
    } catch {
      return false
    }
    let empty = true
    for (const e of entries) {
      if (e.isDirectory() && walk(path.join(abs, e.name))) fs.rmdirSync(path.join(abs, e.name))
      else empty = false
    }
    return empty
  }
  walk(dir)
}

/**
 * Archive this build's assets, expire old ones, restore the rest.
 * @returns {{ archived: number, pruned: number, restored: number, restoredBytes: number }}
 */
export function syncStaticArchive({ staticDir, archiveDir, now = Date.now(), days = keepDays() }) {
  const result = { archived: 0, pruned: 0, restored: 0, restoredBytes: 0 }
  if (!fs.existsSync(staticDir)) return result
  fs.mkdirSync(archiveDir, { recursive: true })
  const current = filesUnder(staticDir)
  const currentSet = new Set(current)
  const at = new Date(now)

  // 1. This build's files: copied in, or marked as in use today.
  for (const rel of current) {
    const dst = path.join(archiveDir, rel)
    if (!fs.existsSync(dst)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.copyFileSync(path.join(staticDir, rel), dst)
      result.archived++
    }
    fs.utimesSync(dst, at, at)
  }

  // 2. Files no build has used for `days`.
  const cutoff = now - days * DAY_MS
  for (const rel of filesUnder(archiveDir)) {
    if (currentSet.has(rel)) continue
    const file = path.join(archiveDir, rel)
    if (fs.statSync(file).mtimeMs < cutoff) {
      fs.rmSync(file, { force: true })
      result.pruned++
    }
  }
  pruneEmptyDirs(archiveDir)

  // 3. Earlier builds' files into .next/static, never over one of this build's.
  for (const rel of filesUnder(archiveDir)) {
    if (currentSet.has(rel)) continue
    const dst = path.join(staticDir, rel)
    if (fs.existsSync(dst)) continue
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(path.join(archiveDir, rel), dst, fs.constants.COPYFILE_EXCL)
    result.restored++
    result.restoredBytes += fs.statSync(dst).size
  }
  return result
}

export function main(argv = process.argv.slice(2)) {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const appRoot = path.resolve(here, '..')
  const arg = (name, fallback) => {
    const i = argv.indexOf(name)
    return i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : fallback
  }
  const staticDir = arg('--static', path.join(appRoot, '.next', 'static'))
  const archiveDir = arg(
    '--archive',
    process.env.STATIC_ARCHIVE_DIR || path.join(appRoot, 'next-static-archive')
  )
  const log = (msg) => console.log(`[static-archive] ${msg}`)
  try {
    const r = syncStaticArchive({ staticDir, archiveDir })
    log(
      `kept ${r.restored} asset(s) of earlier builds (${Math.round(r.restoredBytes / 1024)} KB); ` +
        `archived ${r.archived} new, expired ${r.pruned} (older than ${keepDays()} days)`
    )
  } catch (err) {
    log(`skipped: ${err?.code || err?.message || err} — earlier builds' assets are not served`)
  }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main()
}
