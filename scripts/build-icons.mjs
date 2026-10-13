#!/usr/bin/env node
/**
 * Render the site's icons from the one brand mark (lib/brandMark.ts).
 *
 *   public/icon.svg                     adaptive SVG favicon (prefers-color-scheme)
 *   public/favicon.ico                  16 / 32 / 48 px PNGs in an ICO container
 *   public/icons/icon-192.png           manifest "any"
 *   public/icons/icon-512.png           manifest "any"
 *   public/icons/icon-maskable-512.png  manifest "maskable" (letters in the safe zone)
 *   public/icons/apple-touch-icon.png   180 px, full bleed (iOS rounds it)
 *
 * The output is committed; re-run after changing the mark:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/build-icons.mjs
 * (Node ≥ 22.18 loads the TypeScript module directly; the flag only silences
 * the notice that the repository is not "type": "module".)
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { ICON_FILES, ICO_SIZES, icoFromPngs, markSvg } from '../lib/brandMark.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const pub = path.resolve(here, '..', 'public')

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

/**
 * Rasterise an SVG string to a square PNG. The 512-unit SVG renders at
 * 512 px and is downsampled (Lanczos), which keeps the 16 px strokes crisp.
 */
function png(svg, size) {
  return sharp(Buffer.from(svg))
    .resize(size, size, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}

async function write(rel, data) {
  const file = path.join(pub, rel)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, data)
  console.log(`[build-icons] ${rel.padEnd(30)} ${kb(data.length)}`)
}

async function main() {
  await write('icon.svg', `${markSvg('adaptive')}\n`)
  for (const { file, variant, size, scale } of ICON_FILES) {
    await write(file, await png(markSvg(variant, scale), size))
  }
  const ico = []
  for (const size of ICO_SIZES) ico.push({ size, png: await png(markSvg('tile'), size) })
  await write('favicon.ico', Buffer.from(icoFromPngs(ico)))
}

main().catch((err) => {
  console.error('[build-icons] failed:', err)
  process.exit(1)
})
