/**
 * editor-parity (H2): a cover's focal point reaches the social card. Posts
 * now store `coverFocus` too (picked in the cover field), and the signed
 * /api/og card crops the cover around it — case studies' cards as well.
 * Cards signed before the focal point existed still verify.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalOgString, ogSigningKey, signOgParams, signedOgImageUrl, verifyOgSignature } from '../lib/og/sign'
import { resolveCard } from '../lib/og/resolve'
import { parseOgFocus, parseOgParams } from '../lib/security/ogParams'
import { ogImageUrl } from '../lib/schema'
import { blogFromServer, blogToServer, BLOG_EMPTY } from '../components/Admin/shell/itemFrontmatter'

const KEY = ogSigningKey('test-secret-for-og-signatures-0123456789') as Buffer
const searchOf = (url: string) => new URL(url).searchParams

test('the focal point is whole percents, never the centre, and only with a cover', () => {
  assert.equal(parseOgFocus('30% 70%'), '30% 70%')
  assert.equal(parseOgFocus(' 12.6% 0% '), '13% 0%')
  assert.equal(parseOgFocus('50% 50%'), '', 'the centre is the default')
  assert.equal(parseOgFocus('101% 0%'), '')
  assert.equal(parseOgFocus('left top'), '')
  assert.equal(parseOgFocus(undefined), '')
  assert.equal(parseOgParams(new URLSearchParams({ focus: '20% 30%' })).focus, '', 'no cover, no focus')
  assert.equal(parseOgParams(new URLSearchParams({ cover: '/uploads/a.jpg', focus: '20% 30%' })).focus, '20% 30%')
})

test('ogImageUrl sends the focal point with a cover; signed cards verify and render it', () => {
  const card = { kind: 'blog' as const, title: 'Post', cover: '/uploads/cover.jpg', coverFocus: '25% 75%' }
  assert.equal(searchOf(ogImageUrl(card)).get('focus'), '25% 75%')
  assert.equal(searchOf(ogImageUrl({ ...card, coverFocus: '50% 50%' })).get('focus'), null)
  assert.equal(searchOf(ogImageUrl({ ...card, cover: undefined })).get('focus'), null)
  const signed = searchOf(signedOgImageUrl(card, KEY))
  assert.ok(verifyOgSignature(signed, KEY))
  const resolved = resolveCard(signed, KEY)
  assert.equal(resolved.source, 'signed')
  assert.equal(resolved.params.focus, '25% 75%')
  // Moving the focal point needs a new signature.
  signed.set('focus', '0% 0%')
  assert.equal(verifyOgSignature(signed, KEY), false)
  // An added focus on an unsigned URL is free text: refused.
  assert.equal(resolveCard(new URLSearchParams({ focus: '0% 0%' }), KEY).source, 'refused')
})

test('cards signed before the focal point existed still verify (the canonical form only grows when it is set)', () => {
  const p = parseOgParams(searchOf(ogImageUrl({ kind: 'work', title: 'Case', cover: '/uploads/c.png' })))
  assert.equal(p.focus, '')
  assert.equal(canonicalOgString(p), JSON.stringify(['v1', p.kind, p.title, p.subtitle, p.date, p.mins, p.tags, p.cover, p.lang, p.size, p.v]))
  const legacy = searchOf(ogImageUrl({ kind: 'work', title: 'Case', cover: '/uploads/c.png' }))
  legacy.set('sig', signOgParams(parseOgParams(legacy), KEY))
  assert.ok(verifyOgSignature(legacy, KEY))
})

test('a post keeps its cover focal point (and drops it without a cover)', () => {
  const form = blogFromServer({ title: 'T', date: '2026-10-01', cover: '/uploads/a.jpg', coverFocus: '10% 20%' })
  assert.equal(form.coverFocus, '10% 20%')
  assert.equal(blogToServer(form, []).coverFocus, '10% 20%')
  assert.equal(blogToServer({ ...form, cover: '' }, []).coverFocus, undefined)
  assert.equal(blogFromServer({ coverFocus: 'nonsense' }).coverFocus, '')
  assert.equal(BLOG_EMPTY.coverFocus, '')
})
