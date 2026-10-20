/**
 * CRIT-og-signing + NEXT16-og-node: social cards render free text only
 * behind an HMAC signature computed in the page loaders; fixed pages use
 * fixed cards by id; the route runs on the Node runtime.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  canonicalOgString,
  ogSigningKey,
  signOgParams,
  signedOgImageUrl,
  verifyOgSignature,
} from '../lib/og/sign'
import {
  OG_PRESETS,
  defaultOgImageUrl,
  isOgPresetId,
  ogPresetUrl,
  presetCard,
} from '../lib/og/presets'
import { defaultCardParams, resolveCard } from '../lib/og/resolve'
import { parseOgParams } from '../lib/security/ogParams'
import { SITE_URL, ogImageUrl } from '../lib/schema'

const ROOT = path.resolve(import.meta.dirname, '..')
const KEY = ogSigningKey('test-secret-for-og-signatures-0123456789') as Buffer

const searchOf = (url: string) => new URL(url).searchParams

test('the signing key is derived (HKDF) from JWT_SECRET, never the secret itself, and absent without one', () => {
  assert.equal(KEY.length, 32)
  assert.notDeepEqual(KEY, Buffer.from('test-secret-for-og-signatures-0123456789').subarray(0, 32))
  assert.deepEqual(ogSigningKey('test-secret-for-og-signatures-0123456789'), KEY, 'stable')
  assert.notDeepEqual(ogSigningKey('another-secret-for-og-signatures-012345'), KEY)
  assert.equal(ogSigningKey(''), null)
  assert.equal(ogSigningKey('change-me'), null)
  // `undefined` falls back to process.env.JWT_SECRET: assert the no-secret case with it unset,
  // so the test holds in a shell that exported the app's real environment.
  const saved = process.env.JWT_SECRET
  delete process.env.JWT_SECRET
  try {
    assert.equal(ogSigningKey(undefined), null)
  } finally {
    if (saved !== undefined) process.env.JWT_SECRET = saved
  }
})

test('a signed content card verifies; any change to what it shows breaks the signature', () => {
  const url = signedOgImageUrl(
    {
      kind: 'blog',
      title: 'Real title',
      date: '2026-05-30',
      mins: 6,
      tags: ['Edge AI', 'YOLO'],
      lang: 'zh',
      v: 1780000000000,
    },
    KEY
  )
  const s = searchOf(url)
  assert.match(s.get('sig') || '', /^[A-Za-z0-9_-]{22}$/)
  assert.equal(verifyOgSignature(s, KEY), true)
  for (const [k, v] of [
    ['title', 'Forged title'],
    ['subtitle', 'added'],
    ['kind', 'work'],
    ['date', '2026-05-31'],
    ['mins', '7'],
    ['tags', 'Edge AI'],
    ['lang', 'en'],
    ['size', 'square'],
    ['v', '1'],
    ['cover', '/uploads/x.png'],
  ]) {
    const t = new URLSearchParams(s)
    t.set(k, v)
    assert.equal(verifyOgSignature(t, KEY), false, `changing ${k}`)
  }
  assert.equal(
    verifyOgSignature(s, ogSigningKey('another-secret-for-og-signatures-012345')),
    false,
    'other key'
  )
  assert.equal(verifyOgSignature(s, null), false, 'no key')
})

test('signatures cover the parsed values, so harmless re-encodings still verify', () => {
  const url = signedOgImageUrl({ kind: 'blog', title: 'A & B', tags: ['x'] }, KEY)
  const s = searchOf(url)
  const reencoded = new URLSearchParams()
  reencoded.set('title', '  A   &   B ') // collapsed by parseOgParams
  reencoded.set('kind', 'BLOG') // lower-cased
  reencoded.set('tags', 'x,')
  reencoded.set('sig', s.get('sig') as string)
  assert.equal(verifyOgSignature(reencoded, KEY), true)
  assert.equal(canonicalOgString(parseOgParams(reencoded)), canonicalOgString(parseOgParams(s)))
})

test('malformed signatures are refused without throwing', () => {
  const s = searchOf(ogImageUrl({ kind: 'blog', title: 'T' }))
  for (const sig of ['', 'short', 'A'.repeat(23), '!!!!!!!!!!!!!!!!!!!!!!', 'A'.repeat(22)]) {
    s.set('sig', sig)
    assert.equal(verifyOgSignature(s, KEY), false, sig)
  }
})

test('without a key, signedOgImageUrl leaves the URL unsigned (it then renders the default card)', () => {
  const url = signedOgImageUrl({ kind: 'work', title: 'W' }, null)
  assert.equal(searchOf(url).has('sig'), false)
  assert.equal(resolveCard(searchOf(url), KEY).source, 'refused')
})

test('resolveCard: fixed cards by id, signed cards, and the default card for everything else', () => {
  const preset = resolveCard(searchOf(ogPresetUrl('about')), null)
  assert.equal(preset.source, 'preset')
  assert.equal(preset.params.title, 'About')
  assert.equal(preset.params.subtitle, 'Background, skills & projects')
  const zh = resolveCard(searchOf(ogPresetUrl('cv', { lang: 'zh', size: 'square' })), null)
  assert.deepEqual(
    [zh.source, zh.params.title, zh.params.lang, zh.params.size],
    ['preset', '简历', 'zh', 'square']
  )
  // A preset ignores free text that rides along.
  const smuggled = new URLSearchParams({ card: 'home', title: 'Owned' })
  assert.equal(resolveCard(smuggled, null).params.title, OG_PRESETS.home.en.title)

  const signed = resolveCard(searchOf(signedOgImageUrl({ kind: 'blog', title: 'Post' }, KEY)), KEY)
  assert.deepEqual([signed.source, signed.params.title], ['signed', 'Post'])

  for (const q of [
    'card=nope',
    'kind=blog&title=Unsigned',
    'title=x&sig=AAAAAAAAAAAAAAAAAAAAAA',
    'subtitle=only',
    'cover=%2Fuploads%2Fa.png',
  ]) {
    const r = resolveCard(new URLSearchParams(q), KEY)
    assert.equal(r.source, 'refused', q)
    assert.deepEqual(r.params, defaultCardParams(new URLSearchParams()), q)
  }
  assert.equal(resolveCard(new URLSearchParams(''), KEY).source, 'default')
  assert.equal(resolveCard(new URLSearchParams('size=square'), KEY).params.size, 'square')
  assert.equal(
    resolveCard(new URLSearchParams('lang=zh'), KEY).params.lang,
    'en',
    'the default card is always English'
  )
})

test('presets: ids, languages, URLs', () => {
  assert.equal(isOgPresetId('home'), true)
  assert.equal(isOgPresetId('toString'), false)
  assert.equal(isOgPresetId('__proto__'), false)
  assert.equal(ogPresetUrl('now'), `${SITE_URL}/api/og?card=now`)
  assert.equal(
    ogPresetUrl('home', { lang: 'zh' }),
    `${SITE_URL}/api/og?card=home`,
    'no Chinese text: no lang'
  )
  assert.equal(ogPresetUrl('cv', { lang: 'zh' }), `${SITE_URL}/api/og?card=cv&lang=zh`)
  assert.equal(presetCard('home', 'zh').lang, 'en')
  assert.equal(defaultOgImageUrl(), `${SITE_URL}/api/og`)
  for (const id of Object.keys(OG_PRESETS)) {
    const card = presetCard(id as keyof typeof OG_PRESETS)
    assert.ok(card.title.length <= 100, `${id} title fits the card`)
  }
})

test('signOgParams is deterministic and 128-bit', () => {
  const p = parseOgParams(new URLSearchParams('kind=blog&title=T'))
  assert.equal(signOgParams(p, KEY), signOgParams(p, KEY))
  assert.equal(Buffer.from(signOgParams(p, KEY), 'base64url').length, 16)
})

test('the route runs on the Node runtime, never the deprecated Edge runtime', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/api/og.tsx'), 'utf8')
  assert.doesNotMatch(src, /runtime:\s*['"]edge['"]/)
  assert.match(src, /withApi\('og'/)
  assert.match(src, /resolveCard\(search, ogSigningKey\(\)\)/)
  const config = fs.readFileSync(path.join(ROOT, 'next.config.js'), 'utf8')
  // One tracing map for every runtime asset (the PDF CV adds its own entry).
  assert.match(
    config,
    /outputFileTracingIncludes: \{[^}]*'\/api\/og': \['\.\/assets\/og\/\*\.ttf'\]/
  )
  for (const f of ['Geist-Regular.ttf', 'Geist-SemiBold.ttf', 'GeistMono-Regular.ttf'])
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/og', f)), f)
})

test('pages never build free-text card URLs on the client: fixed cards by id, article cards signed in the loader', () => {
  const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')
  for (const f of [
    'pages/index.tsx',
    'pages/about/index.tsx',
    'pages/colophon.tsx',
    'pages/now.tsx',
    'pages/uses.tsx',
    'pages/contact/index.tsx',
    'pages/blog/index.tsx',
    'pages/work/index.tsx',
    'components/CVViewerPage/CvPageView.tsx',
    'components/General-UI/CustomHead.tsx',
  ]) {
    assert.doesNotMatch(read(f), /ogImageUrl\(/, f)
  }
  for (const f of ['pages/blog/[slug].tsx', 'pages/work/[slug].tsx']) {
    const src = read(f)
    const loader = src.slice(src.indexOf('export const getStaticProps'))
    assert.match(loader, /signedOgImageUrl\(card\)/, `${f} signs in getStaticProps`)
    assert.match(loader, /signedOgImageUrl\(\{ \.\.\.card, size: 'square' \}\)/, f)
    assert.doesNotMatch(
      src.slice(0, src.indexOf('export const getStaticProps')),
      /signedOgImageUrl\(/,
      `${f}: never in the component`
    )
  }
})
