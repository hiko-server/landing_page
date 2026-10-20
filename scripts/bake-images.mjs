#!/usr/bin/env node
/**
 * Bake the responsive variants of the site's own photos (G4, C8).
 *
 * Uploads get their variants when they are uploaded (lib/imageVariants.ts)
 * or from the media-optimize backfill. Photos that live in the repository
 * under public/images — the home page's field notes — are baked once with
 * the same encoder and naming and committed next to the file:
 *
 *   public/images/imageScroller/fyp.png.w320.webp   …w480, w640, and the
 *   public/images/imageScroller/fyp.png.w320.avif   photo's own width
 *   public/images/imageScroller/fyp.png.w16.webp    the blur placeholder
 *
 * lib/uploadVariants.ts (imageSources) finds them for any /images/… URL.
 * Re-run after adding or replacing a photo (existing variants are kept;
 * delete them first to re-encode):
 *
 *   node --import ./tests/register.mjs scripts/bake-images.mjs [file or dir …]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { MAX_INPUT_PIXELS, makeVariants } from '../lib/imageVariants.ts'
import { isVariantName } from '../lib/uploadVariants.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

/** The photos baked by default: the home page's field notes. */
export const DEFAULT_TARGETS = ['public/images/imageScroller']

const PHOTO_RE = /\.(png|jpe?g|webp)$/i

function photosIn(target) {
  const abs = path.resolve(repoRoot, target)
  if (!fs.existsSync(abs)) return []
  if (fs.statSync(abs).isFile()) return [abs]
  return fs
    .readdirSync(abs)
    .filter((n) => PHOTO_RE.test(n) && !isVariantName(n))
    .sort()
    .map((n) => path.join(abs, n))
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

async function bake(file) {
  const dir = path.dirname(file)
  const name = path.basename(file)
  const buf = fs.readFileSync(file)
  const meta = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
  const width = meta.autoOrient?.width ?? meta.width ?? 0
  const upright = meta.orientation && meta.orientation !== 1 ? await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().toBuffer() : buf
  const variants = await makeVariants(upright, name, width, (v) => fs.existsSync(path.join(dir, v)))
  for (const v of variants) fs.writeFileSync(path.join(dir, v.name), v.buf, { flag: 'wx' })
  const made = variants.map((v) => `${v.name.slice(name.length + 1)} ${kb(v.buf.length)}`)
  console.log(`[bake-images] ${path.relative(repoRoot, file)} (${width} px, ${kb(buf.length)}): ${made.length ? made.join(', ') : 'up to date'}`)
}

async function main(argv = process.argv.slice(2)) {
  const targets = argv.length ? argv : DEFAULT_TARGETS
  for (const file of targets.flatMap(photosIn)) await bake(file)
}

main().catch((err) => {
  console.error('[bake-images] failed:', err)
  process.exit(1)
})
