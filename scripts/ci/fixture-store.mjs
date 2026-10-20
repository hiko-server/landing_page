#!/usr/bin/env node
/**
 * Install the synthetic CI fixture store (G7) into a checkout, so a build of
 * it serves realistic content — posts with figures, a gallery, code and a
 * table, case studies with covers, the home page with photos and logos, an
 * EN / ZH CV — for the performance, layout and visual gates
 * (e2e/gates.spec.ts, e2e/visual.spec.ts).
 *
 * Everything in e2e/fixtures/store is test data: "Example Person",
 * example.com addresses, generated images (scripts/ci/fixture-images.mjs).
 * Nothing is derived from the live store, and none of it can reach
 * production: e2e/ is outside the Docker build context (.dockerignore) and
 * this script refuses to touch a checkout that already has a content store.
 *
 *   node --import ./tests/register.mjs scripts/ci/fixture-store.mjs [--target <checkout>]
 *
 * It copies data/home.json + data/cvdata.json (replacing the git seeds of
 * that checkout), content/ (posts, case studies, pages) and the uploads with
 * their WebP / AVIF variants and blur placeholders (made with the same
 * pipeline as a real upload), and pins the files' dates so every run renders
 * the same page. Build and start the checkout afterwards.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { makeVariants } from '../../lib/imageVariants.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
export const FIXTURE_DIR = path.join(repoRoot, 'e2e', 'fixtures', 'store')
/** Every fixture file is dated this (content dates drive "updated" stamps). */
export const FIXTURE_TIME = new Date('2026-03-15T00:00:00Z')

function argValue(argv, name) {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (entry.isDirectory()) copyTree(src, dest)
    else {
      fs.copyFileSync(src, dest)
      fs.utimesSync(dest, FIXTURE_TIME, FIXTURE_TIME)
    }
  }
}

export async function install(target) {
  if (process.env.NODE_ENV === 'production') throw new Error('refusing to install test fixtures with NODE_ENV=production')
  const pkg = path.join(target, 'package.json')
  if (!fs.existsSync(pkg) || JSON.parse(fs.readFileSync(pkg, 'utf8')).name !== 'portfolio-studio') {
    throw new Error(`${target} is not a checkout of this site`)
  }
  for (const live of ['data/content.db', 'data/admin.json', 'data/auth.db']) {
    if (fs.existsSync(path.join(target, live))) throw new Error(`${live} exists in ${target}: refusing to mix test fixtures into a real store`)
  }

  fs.mkdirSync(path.join(target, 'data'), { recursive: true })
  for (const name of ['home.json', 'cvdata.json']) {
    const dest = path.join(target, 'data', name)
    fs.copyFileSync(path.join(FIXTURE_DIR, 'data', name), dest)
    fs.utimesSync(dest, FIXTURE_TIME, FIXTURE_TIME)
  }
  copyTree(path.join(FIXTURE_DIR, 'content'), path.join(target, 'content'))

  const uploads = path.join(target, 'public', 'uploads')
  fs.mkdirSync(uploads, { recursive: true })
  let variants = 0
  for (const name of fs.readdirSync(path.join(FIXTURE_DIR, 'uploads')).sort()) {
    const src = path.join(FIXTURE_DIR, 'uploads', name)
    const dest = path.join(uploads, name)
    fs.copyFileSync(src, dest)
    fs.utimesSync(dest, FIXTURE_TIME, FIXTURE_TIME)
    const buf = fs.readFileSync(src)
    const width = (await sharp(buf).metadata()).width ?? 0
    for (const v of await makeVariants(buf, name, width, (n) => fs.existsSync(path.join(uploads, n)))) {
      fs.writeFileSync(path.join(uploads, v.name), v.buf)
      fs.utimesSync(path.join(uploads, v.name), FIXTURE_TIME, FIXTURE_TIME)
      variants++
    }
  }
  return { uploads: fs.readdirSync(path.join(FIXTURE_DIR, 'uploads')).length, variants }
}

async function main(argv = process.argv.slice(2)) {
  const target = path.resolve(argValue(argv, '--target') || repoRoot)
  const { uploads, variants } = await install(target)
  console.log(`[fixture-store] installed into ${target}: data/home.json, data/cvdata.json, content/, ${uploads} uploads + ${variants} variants`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error('[fixture-store] failed:', err.message || err)
    process.exit(1)
  })
}
