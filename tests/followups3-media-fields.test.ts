/**
 * followups-3: the media library's picker in the home editor (field-note
 * photos, affiliation logos, the portrait) and CV Studio (the PDF photo).
 *
 *   - what a pick changes in a card (components/Admin/home/libraryPick);
 *   - the picker's field helpers (lib/media/view uploadNameIn, fitsFormats);
 *   - "where it is used" stays right: against a throw-away store, a home or
 *     CV save that now names an upload shows in its usage at once (the
 *     usage index is rebuilt whenever the stored content changed), with the
 *     editor's labels, the PDF photo as private, and whether the home photos
 *     and logos have an alt text (lib/media/usage homeFieldAlt);
 *   - the wiring: every image field of those editors offers the library.
 *
 * Synthetic images and texts only.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import { logoFromLibrary, newLogoFromLibrary, newPhotoFromLibrary, photoFromLibrary, type Picked } from '../components/Admin/home/libraryPick'
import { fitsFormats, uploadNameIn } from '../lib/media/view'
import { homeFieldAlt, scanUsage } from '../lib/media/usage'

const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ── Pure parts ────────────────────────────────────────────────────────────

const picked = (over: Partial<Picked> = {}): Picked => ({
  name: 'harbour.jpg',
  url: '/uploads/harbour.jpg',
  alt: 'Boats in the harbour at dusk',
  meta: { alt: 'Boats in the harbour at dusk', altZh: '黄昏时港口里的船', caption: '', captionZh: '' },
  ...over,
})

test('the field’s value names its upload: absolute, cache-busted, percent-encoded or a responsive variant', () => {
  assert.equal(uploadNameIn('/uploads/harbour.jpg'), 'harbour.jpg')
  assert.equal(uploadNameIn('https://example.com/uploads/harbour.jpg'), 'harbour.jpg')
  assert.equal(uploadNameIn('/uploads/harbour.jpg?__ts=1712345678901'), 'harbour.jpg')
  assert.equal(uploadNameIn('/uploads/harbour.jpg.w640.webp'), 'harbour.jpg')
  assert.equal(uploadNameIn('/uploads/harbour.png.w16.webp'), 'harbour.png')
  assert.equal(uploadNameIn('/uploads/a%20b.jpg'), 'a b.jpg')
  assert.equal(uploadNameIn('/uploads/%E0%A4%A.jpg'), null, 'malformed escapes')
  assert.equal(uploadNameIn('/images/brand/logo.svg'), null, 'not an upload')
  assert.equal(uploadNameIn(''), null)
  assert.equal(uploadNameIn(undefined), null)
})

test('formats: the PDF photo takes still JPEG, PNG and WebP; other fields take any image', () => {
  const pdf = ['jpeg', 'png', 'webp'] as const
  assert.equal(fitsFormats({ format: 'jpeg', animated: false }, pdf), true)
  assert.equal(fitsFormats({ format: 'webp', animated: false }, pdf), true)
  assert.equal(fitsFormats({ format: 'webp', animated: true }, pdf), false, 'an animated WebP')
  assert.equal(fitsFormats({ format: 'gif', animated: false }, pdf), false)
  assert.equal(fitsFormats({ format: 'svg', animated: false }, pdf), false)
  assert.equal(fitsFormats({ format: null, animated: false }, pdf), false)
  assert.equal(fitsFormats({ format: 'gif', animated: true }, undefined), true)
  assert.equal(fitsFormats({ format: 'svg', animated: false }, []), true)
})

test('a photo card: a different image brings its own texts — English as edited in the picker, Chinese its default', () => {
  const card = { url: '/uploads/old-trip.jpg?__ts=5', describe: 'Hiking in the hills', describe_zh: '在山上远足' }
  assert.deepEqual(photoFromLibrary(card, picked()), { url: '/uploads/harbour.jpg', describe: 'Boats in the harbour at dusk', describe_zh: '黄昏时港口里的船' })
  // An image without texts: the old ones described another picture, so they go (the card then shows "alt missing").
  assert.deepEqual(photoFromLibrary(card, picked({ alt: '', meta: null })), { url: '/uploads/harbour.jpg', describe: '', describe_zh: '' })
})

test('a photo card: the same image keeps its texts, fills only what is empty or was edited in the picker', () => {
  const card = { url: '/uploads/harbour.jpg.w640.webp', describe: 'My own words', describe_zh: '我自己的话' }
  // Picked again with the alt shown (and possibly edited) in the picker: the English follows it; the Chinese stays.
  assert.deepEqual(photoFromLibrary(card, picked({ alt: 'Edited in the picker' })), { url: '/uploads/harbour.jpg', describe: 'Edited in the picker' })
  // Picked with the alt cleared: nothing is erased.
  assert.deepEqual(photoFromLibrary(card, picked({ alt: '' })), { url: '/uploads/harbour.jpg' })
  // No Chinese caption yet: the image's Chinese default fills it.
  assert.deepEqual(photoFromLibrary({ ...card, describe_zh: '' }, picked({ alt: '' })), { url: '/uploads/harbour.jpg', describe_zh: '黄昏时港口里的船' })
})

test('new cards from the library', () => {
  assert.deepEqual(newPhotoFromLibrary(picked()), { url: '/uploads/harbour.jpg', describe: 'Boats in the harbour at dusk', describe_zh: '黄昏时港口里的船', redirectTo: '', visible: true })
  assert.deepEqual(newPhotoFromLibrary(picked({ alt: '', meta: null })), { url: '/uploads/harbour.jpg', describe: '', redirectTo: '', visible: true })
  assert.deepEqual(newLogoFromLibrary(picked({ url: '/uploads/example-org.svg', alt: 'Example Org' })), { name: 'Example Org', href: '', image: '/uploads/example-org.svg', scale: 1 })
})

test('a logo card keeps its organisation name; the alt text names only a card without one', () => {
  const img = picked({ url: '/uploads/example-org.png', alt: 'Example Org logo' })
  assert.deepEqual(logoFromLibrary({ name: 'Example Org', image: '/uploads/old.png' }, img), { image: '/uploads/example-org.png' })
  assert.deepEqual(logoFromLibrary({ name: '  ', image: '' }, img), { image: '/uploads/example-org.png', name: 'Example Org logo' })
  assert.deepEqual(logoFromLibrary({ name: '', image: '' }, picked({ alt: '' })), { image: '/uploads/harbour.jpg' })
})

test('home usage: photos and logos say whether they have an alt text; the portrait and other fields do not count', () => {
  const home = {
    hero: { avatarUrl: '/uploads/portrait.jpg' },
    photos: [
      { url: '/uploads/a.jpg', describe: 'Boats in the harbour' },
      { url: '/uploads/b.jpg', describe: '' },
      { url: '/uploads/c.jpg', describe: 'IMG_2041.jpg' },
      { url: '/uploads/d.jpg', redirectTo: '/uploads/d-large.jpg' },
    ],
    brands: [
      { name: 'Example Org', image: '/uploads/org.png', href: 'https://example.com', metrics: { aspect: 3, density: 0.4, crop: { x: 0, y: 0, w: 1, h: 1 }, source: '/uploads/org.png' } },
      { name: '', image: '/uploads/nameless.png' },
    ],
  }
  assert.equal(homeFieldAlt(home, ['photos', 0, 'url']), 'ok')
  assert.equal(homeFieldAlt(home, ['photos', 1, 'url']), 'missing')
  assert.equal(homeFieldAlt(home, ['photos', 2, 'url']), 'meaningless')
  assert.equal(homeFieldAlt(home, ['photos', 3, 'redirectTo']), null, 'a link, not an image tag')
  assert.equal(homeFieldAlt(home, ['brands', 0, 'image']), 'ok')
  assert.equal(homeFieldAlt(home, ['brands', 1, 'image']), 'missing')
  assert.equal(homeFieldAlt(home, ['hero', 'avatarUrl']), null)
  const usage = scanUsage({ items: [], pending: [], pages: [], home, cv: null, other: [] })
  const alt = (name: string) => usage.find((u) => u.name === name)?.alt
  assert.equal(alt('a.jpg'), 'ok')
  assert.equal(alt('b.jpg'), 'missing')
  assert.equal(alt('nameless.png'), 'missing')
  assert.equal(alt('portrait.jpg'), null)
  // The logo's stored measurement names the file too: not a second place.
  assert.deepEqual(usage.filter((u) => u.name === 'org.png').map((u) => u.label), ['Brand strip › Example Org › Logo'])
})

test('wiring: every image field of the home editor and CV Studio offers the library (loaded on demand)', () => {
  const lib = read('components/Admin/media/LibraryPicker.tsx')
  assert.match(lib, /dynamic\(loadPicker, \{ ssr: false \}\)/, 'the picker is its own chunk')
  assert.match(lib, /mode="field"/)
  const photos = read('components/Admin/home/PhotosSection.tsx')
  assert.match(photos, /onLibrary=\{\(\) => library\.open\(pickFor\(p, index\)\)\}/)
  assert.match(photos, /altLang: 'en'/)
  assert.match(photos, /newPhotoFromLibrary\(img\)/)
  const brands = read('components/Admin/home/BrandsSection.tsx')
  assert.match(brands, /onLibrary=\{\(\) => library\.open\(pickFor\(b, index\)\)\}/)
  assert.match(brands, /newLogoFromLibrary\(img\)/)
  const cards = read('components/Admin/home/ImageCards.tsx')
  assert.match(cards, /Replace from library…/)
  const hero = read('components/Admin/HomeEditor.tsx')
  assert.match(hero, /avatarUrl: img\.url/)
  assert.match(hero, /current: hero\.avatarUrl/)
  const cvPhoto = read('components/Admin/cvStudio/PhotoField.tsx')
  assert.match(cvPhoto, /formats: PDF_PHOTO_FORMATS/)
  assert.match(cvPhoto, /const PDF_PHOTO_FORMATS: readonly MediaFormat\[\] = \['jpeg', 'png', 'webp'\]/)
  // The picker module stays out of the editors' own bundles (no static import).
  for (const src of [photos, brands, hero, cvPhoto]) assert.doesNotMatch(src, /from '\.\.?\/(media\/)?MediaPicker'|from '\.\/media\/MediaPicker'/)
})

// ── Against a store ───────────────────────────────────────────────────────

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CF_API_TOKEN', 'CF_ZONE_ID', 'INDEXNOW_KEY']) delete process.env[k]
process.env.JWT_SECRET = process.env.JWT_SECRET || 'followups3-media-fields-secret-0123456789abcdef'
process.env.LOG_LEVEL = 'error'

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'followups3-media-'))

let lib: typeof import('../lib/media/library')
let images: typeof import('../lib/imageVariants')
let home: typeof import('../lib/home')
let cvdata: typeof import('../lib/cvdata')
let closeDb: () => void

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true })
  lib = await import('../lib/media/library')
  images = await import('../lib/imageVariants')
  home = await import('../lib/home')
  cvdata = await import('../lib/cvdata')
  closeDb = (await import('../lib/db')).closeDb
})

after(() => {
  closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

async function upload(name: string) {
  const buf = await sharp({ create: { width: 640, height: 400, channels: 3, background: { r: 30, g: 110, b: 170 } } }).jpeg({ quality: 80 }).toBuffer()
  return images.storeUpload(buf, 'image/jpeg', name, { mirror: async () => null })
}

test('a home or CV save that picks an upload shows in the library’s usage at once — labels, alt states, the private PDF photo', async () => {
  const photo = await upload('field-note.jpg')
  const logo = await upload('example-org.jpg')
  const portrait = await upload('portrait.jpg')
  const pdfPhoto = await upload('pdf-photo.jpg')
  for (const u of [photo, logo, portrait, pdfPhoto]) assert.deepEqual(lib.usageOf(u.name), [], `${u.name} starts unused`)

  // What the home editor saves after picking: the library's URLs (a preview cache-buster is stripped on save).
  const saved = await home.writeHome({
    hero: { avatarUrl: portrait.url },
    photos: [
      { url: photo.url, describe: '', redirectTo: '', visible: true },
      { url: photo.url, describe: 'Boats in the harbour', redirectTo: '', visible: false },
    ],
    brands: [{ name: 'Example Org', href: 'https://example.com', image: logo.url, scale: 1 }],
  } as never)
  assert.equal(saved.ok, true)
  const photoUses = lib.usageOf(photo.name)
  assert.deepEqual(
    photoUses.map((u) => [u.doc, u.field, u.label, u.alt]),
    [
      ['home', 'photos.0.url', 'Field notes › Photo 1', 'missing'],
      ['home', 'photos.1.url', 'Field notes › Boats in the harbour (hidden)', 'ok'],
    ],
  )
  assert.equal(photoUses[0].editHref, '/admin/dashboard?tab=home')
  assert.deepEqual(lib.usageOf(logo.name).map((u) => [u.label, u.alt]), [['Brand strip › Example Org › Logo', 'ok']])
  assert.deepEqual(lib.usageOf(portrait.name).map((u) => [u.label, u.alt]), [['Introduction › Portrait', null]])

  // CV Studio's PDF photo (the English CV), saved through the CV's own write.
  const cv = await cvdata.writeCvData({ en: [{ sessionName: 'personalInformation', name: 'Example Person', photo: pdfPhoto.url, photoOnPdf: true }], zh: [] } as never)
  assert.equal(cv.ok, true)
  const pdfUses = lib.usageOf(pdfPhoto.name)
  assert.equal(pdfUses.length, 1)
  assert.equal(pdfUses[0].label, 'Photo (PDF only) · EN')
  assert.equal(pdfUses[0].docState, 'private')
  assert.equal(pdfUses[0].publicHref, null)

  // Picking another image (and describing the photo) moves the usage with the next save.
  const next = await home.writeHome({
    hero: { avatarUrl: photo.url },
    photos: [{ url: photo.url, describe: 'Boats in the harbour', redirectTo: '', visible: true }],
    brands: [],
  } as never)
  assert.equal(next.ok, true)
  assert.deepEqual(lib.usageOf(portrait.name), [], 'the old portrait is unused now')
  assert.deepEqual(lib.usageOf(logo.name), [])
  assert.deepEqual(
    lib.usageOf(photo.name).map((u) => [u.field, u.alt]),
    [
      ['hero.avatarUrl', null],
      ['photos.0.url', 'ok'],
    ],
  )
  assert.equal(lib.rebuildUsage(), false, 'unchanged content keeps the index')
})
