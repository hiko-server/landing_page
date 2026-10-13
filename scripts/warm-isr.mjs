#!/usr/bin/env node
/**
 * Boot-time ISR warm-up.
 *
 * The Docker build deliberately runs without data/content.db (runtime state
 * never belongs in an image), so the statically generated pages baked into
 * the image — /, /about, /blog, /work, /now, /uses — are rendered from an
 * EMPTY store.
 * Left alone, the first visitor after every deploy would be served that empty
 * copy while Next regenerates in the background.
 *
 * Once the server answers its health check, this script asks Next to
 * regenerate every prerendered route synchronously, using the same internal
 * revalidate header `res.revalidate()` sends. The header value is the
 * per-build preview id from .next/prerender-manifest.json, which never leaves
 * the container. Best effort: it logs and always exits 0, so it can never
 * take the site down.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(here, '..')
const port = process.env.PORT || '3000'
const base = `http://127.0.0.1:${port}`
const HEALTH_TIMEOUT_MS = Number(process.env.WARM_HEALTH_TIMEOUT_MS || 90_000)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log('[warm-isr]', ...a)

function readManifest() {
  const file = path.join(appRoot, '.next', 'prerender-manifest.json')
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    log(`no prerender manifest at ${file} (${err.code || err.message}) — nothing to warm`)
    return null
  }
}

async function waitForHealth() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) return true
    } catch {
      /* server not listening yet */
    }
    await sleep(1000)
  }
  return false
}

async function main() {
  const manifest = readManifest()
  const id = manifest?.preview?.previewModeId
  const routes = Object.keys(manifest?.routes || {}).filter((r) => manifest.routes[r]?.initialRevalidateSeconds !== false)
  if (!id || routes.length === 0) return

  if (!(await waitForHealth())) {
    log(`server not healthy after ${HEALTH_TIMEOUT_MS} ms — skipping warm-up`)
    return
  }

  const results = await Promise.all(
    routes.map(async (route) => {
      try {
        const res = await fetch(`${base}${route}`, {
          method: 'HEAD',
          headers: { 'x-prerender-revalidate': id },
          signal: AbortSignal.timeout(30_000),
        })
        const cache = res.headers.get('x-nextjs-cache') || '-'
        return `${route} ${res.status} ${cache}`
      } catch (err) {
        return `${route} failed (${err.name === 'TimeoutError' ? 'timeout' : err.message})`
      }
    }),
  )
  log(`regenerated ${routes.length} route(s): ${results.join(', ')}`)
}

main()
  .catch((err) => log('unexpected error:', err?.message || err))
  .finally(() => process.exit(0))
