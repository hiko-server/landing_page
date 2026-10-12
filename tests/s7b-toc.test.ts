import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugify, createSlugger, readingMinutes, detectContentLang, normalizeLang, labelLang, readableText } from '../lib/toc'

test('slugify keeps letters/digits of any script and drops punctuation', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world')
  assert.equal(slugify('这是什么 · What it is'), '这是什么-what-it-is')
  assert.equal(slugify('  C++ & Rust: 2024  '), 'c-rust-2024')
  assert.equal(slugify('Café déjà vu'), 'café-déjà-vu')
  assert.equal(slugify('🚀 Launch 🚀'), 'launch')
  assert.equal(slugify('!!!'), '')
})

test('slugger de-duplicates and avoids ids used by the page chrome', () => {
  const slug = createSlugger()
  assert.equal(slug('Intro'), 'intro')
  assert.equal(slug('Intro'), 'intro-1')
  assert.equal(slug('Intro'), 'intro-2')
  assert.equal(slug('Main'), 'main-1')
  assert.equal(slug('???'), 'section')
  assert.equal(slug(''), 'section-1')
})

test('readableText drops URLs, image syntax and markup', () => {
  const text = readableText('See [the docs](https://example.com/a/very/long/path) ![x](/a.png) <Foo bar="1" /> **bold**')
  assert.ok(!text.includes('http'))
  assert.ok(!text.includes('a.png'))
  assert.ok(!text.includes('Foo'))
  assert.match(text, /the docs/)
  assert.match(text, /bold/)
})

test('readingMinutes counts English words and CJK characters separately', () => {
  assert.equal(readingMinutes(''), 1)
  assert.equal(readingMinutes('word '.repeat(230 * 5)), 5)
  assert.equal(readingMinutes('字'.repeat(260 * 4)), 4)
  // A huge URL is not reading material.
  assert.equal(readingMinutes(`[link](https://x.com/${'a'.repeat(5000)})`), 1)
  // Images add dwell time: 12 + 11 + … for ten images ≈ 1.3 min.
  assert.equal(readingMinutes('![a](/a.png)\n'.repeat(10)), 1)
  assert.equal(readingMinutes(`${'word '.repeat(230)}\n${'![a](/a.png)\n'.repeat(10)}`), 2)
})

test('detectContentLang: explicit lang wins, CJK-dominant title/body → zh-Hans, bilingual stays en', () => {
  assert.equal(detectContentLang({ lang: 'zh', title: 'Hello' }), 'zh-Hans')
  assert.equal(detectContentLang({ lang: 'en-gb', title: '中文标题' }), 'en-GB')
  assert.equal(detectContentLang({ title: 'Car Boy 我自己做的一个爱车人社区', body: 'English body text only here.' }), 'zh-Hans')
  assert.equal(detectContentLang({ title: 'Carboy', body: '这是一个完全用中文写的段落，讲述了产品的故事和想法。'.repeat(5) }), 'zh-Hans')
  assert.equal(
    detectContentLang({
      title: 'Carboy',
      body: '这是什么，我想做一个完整的平台。\n\nWhat it is: I want to build a complete platform for people who love cars.',
    }),
    'en',
  )
  assert.equal(detectContentLang({ title: 'Edge AI', body: 'Plain English.' }), 'en')
  assert.equal(detectContentLang({ title: 'ひらがなとカタカナの日本語タイトル' }), 'ja')
  assert.equal(detectContentLang({ title: '한국어 제목입니다' }), 'ko')
  assert.equal(detectContentLang({}), 'en')
})

test('normalizeLang canonicalises case and rejects junk', () => {
  assert.equal(normalizeLang('ZH_hant_hk'), 'zh-Hant-HK')
  assert.equal(normalizeLang('zh-TW'), 'zh-Hant')
  assert.equal(normalizeLang('en'), 'en')
  assert.equal(normalizeLang('not a lang'), '')
  assert.equal(normalizeLang(42), '')
})

test('labelLang only tags non-English labels', () => {
  assert.equal(labelLang('Hello'), undefined)
  assert.equal(labelLang('爱车人社区'), 'zh-Hans')
})
