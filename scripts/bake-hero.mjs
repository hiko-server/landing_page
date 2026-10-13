#!/usr/bin/env node
/**
 * Bake the home hero backdrop into fixed responsive sizes.
 *
 * The Next.js image optimizer is disabled (images.unoptimized), so the hero's
 * srcset is produced once from the 2880×1920 master and committed:
 *
 *   public/images/hero/hero-mountains-{640,1080,1600,2400}.webp  (q62, effort 6)
 *   public/images/hero/hero-mountains-{640,1080,1600,2400}.avif  (q50)
 *
 * components/Background/HeroAmbient.tsx and the preload in pages/index.tsx
 * reference exactly these files (HERO_WIDTHS). Re-run after replacing the
 * master: `node scripts/bake-hero.mjs`.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(here, '..', 'public', 'images', 'hero')
const master = path.join(dir, 'hero-mountains.jpg')

const WIDTHS = [640, 1080, 1600, 2400]
const FORMATS = [
  { ext: 'webp', encode: (img) => img.webp({ quality: 62, effort: 6 }) },
  { ext: 'avif', encode: (img) => img.avif({ quality: 50 }) },
]

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

async function main() {
  const meta = await sharp(master).metadata()
  console.log(`[bake-hero] master ${path.basename(master)} ${meta.width}×${meta.height}`)
  for (const width of WIDTHS) {
    for (const { ext, encode } of FORMATS) {
      const out = path.join(dir, `hero-mountains-${width}.${ext}`)
      const info = await encode(sharp(master).rotate().resize({ width, withoutEnlargement: true })).toFile(out)
      console.log(`[bake-hero] ${path.basename(out).padEnd(28)} ${info.width}×${info.height}  ${kb(info.size)}`)
    }
  }
}

main().catch((err) => {
  console.error('[bake-hero] failed:', err)
  process.exit(1)
})
