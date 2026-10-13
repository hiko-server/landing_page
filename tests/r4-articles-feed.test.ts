/**
 * Full-content feeds (C5): RSS 2.0 with content:encoded / dc:creator /
 * per-item xml:lang, JSON Feed 1.1, reader-safe HTML, and drafts never
 * appearing. Runs against a throw-away content store in a temp directory.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k]

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-articles-feed-'))
const SITE = 'https://lucian-dev.com'
let feed: typeof import('../lib/feedHtml')
let feeds: typeof import('../lib/feeds')
let db: typeof import('../lib/db')

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'public', 'uploads', 'cover.jpg'), Buffer.alloc(1234, 1))
  db = await import('../lib/db')
  const store = await import('../lib/contentStore')
  feed = await import('../lib/feedHtml')
  feeds = await import('../lib/feeds')
  await store.putItem('blog', 'hello', { title: 'Hello ]]> world', description: 'A post about <things>.', date: '2026-05-30', tags: ['Edge AI'], cover: '/uploads/cover.jpg' }, [
    '## Section',
    '',
    'Body with a [relative link](/work/x), an [anchor](#section) and `code` ]]> inside.',
    '',
    '![Chart](/uploads/chart.png)',
    '',
    '<YouTube id="jkAqK3vqILI" title="Demo" />',
  ].join('\n'))
  await store.putItem('blog', 'zh-post', { title: '中文文章标题一二三四五六', date: '2026-05-29' }, '这是一篇完全用中文写的文章，讲述产品的故事。'.repeat(3))
  await store.putItem('blog', 'secret', { title: 'Unpublished draft', date: '2026-06-01', draft: true }, 'Draft body')
  await store.putItem('work', 'case', { title: 'A case', description: 'Case study.' }, 'Work body.')
  await store.putItem('work', 'hidden-case', { title: 'Hidden case', draft: true }, 'Hidden.')
})

after(() => {
  db.closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('cdata() splits "]]>" so the section can never be closed early', () => {
  assert.equal(feeds.cdata('a]]>b'), '<![CDATA[a]]]]><![CDATA[>b]]>')
  assert.equal(feeds.xmlEscape('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
  assert.equal(feeds.xmlEscape('ok\u0001bad'), 'okbad')
})

test('blog RSS: full content, dc:creator, per-item language, enclosure, no drafts', async () => {
  const xml = await feed.buildBlogRss(SITE, `${SITE}/feed.xml`)
  assert.match(xml, /xmlns:content="http:\/\/purl\.org\/rss\/1\.0\/modules\/content\/"/)
  assert.match(xml, /xmlns:dc="http:\/\/purl\.org\/dc\/elements\/1\.1\/"/)
  assert.match(xml, /<title>Li Yanpei — Writing<\/title>/)
  assert.ok(!xml.includes('<language>'), 'no channel-wide language')
  assert.equal((xml.match(/<dc:creator>Li Yanpei<\/dc:creator>/g) || []).length, 2)
  assert.ok(!xml.includes('Unpublished draft'), 'drafts never appear')
  assert.match(xml, /<item xml:lang="en">/)
  assert.match(xml, /<item xml:lang="zh-Hans">/)
  assert.match(xml, /<title>Hello \]\]&gt; world<\/title>/)
  assert.match(xml, /<description>A post about &lt;things&gt;\.<\/description>/)
  assert.match(xml, /<enclosure url="https:\/\/lucian-dev\.com\/uploads\/cover\.jpg" type="image\/jpeg" length="1234" \/>/)
  // content:encoded: escaped CDATA, absolute URLs, video link instead of an embed.
  const encoded = /<content:encoded>([\s\S]*?)<\/content:encoded>/.exec(xml)![1]
  assert.ok(encoded.startsWith('<![CDATA['))
  assert.ok(encoded.includes(']]]]><![CDATA[>'))
  assert.match(encoded, /href="https:\/\/lucian-dev\.com\/work\/x"/)
  assert.match(encoded, /href="https:\/\/lucian-dev\.com\/blog\/hello#section"/)
  assert.match(encoded, /src="https:\/\/lucian-dev\.com\/uploads\/chart\.png"/)
  assert.match(encoded, /https:\/\/www\.youtube\.com\/watch\?v=jkAqK3vqILI/)
  assert.ok(!encoded.includes('<iframe'))
  assert.ok(!encoded.includes('heading-anchor'), 'heading self-links unwrapped')
  assert.ok(!/ (style|data-[a-z-]+|loading)=/.test(encoded), 'presentation-only attributes dropped')
})

test('work RSS lists published case studies only', async () => {
  const xml = await feed.buildWorkRss(SITE, `${SITE}/work/feed.xml`)
  assert.match(xml, /<title>Li Yanpei — Case studies<\/title>/)
  assert.match(xml, /<title>A case<\/title>/)
  assert.ok(!xml.includes('Hidden case'))
})

test('JSON Feed 1.1: authors, ISO dates with offset, per-item language, no drafts', async () => {
  const json = feed.buildJsonFeed(SITE, await feed.blogFeedItems(SITE))
  assert.equal(json.version, 'https://jsonfeed.org/version/1.1')
  assert.equal(json.feed_url, `${SITE}/feed.json`)
  assert.deepEqual(json.authors, [{ name: 'Li Yanpei (Lucian)', url: `${SITE}/about` }])
  assert.equal(json.items.length, 2)
  const hello = json.items.find((i) => i.url === `${SITE}/blog/hello`)!
  assert.equal(hello.date_published, '2026-05-30T00:00:00+08:00')
  assert.equal(hello.language, 'en')
  assert.equal(hello.image, `${SITE}/uploads/cover.jpg`)
  assert.deepEqual(hello.tags, ['Edge AI'])
  assert.ok(hello.content_html.includes('<h2'))
  assert.equal(json.items.find((i) => i.url.endsWith('/zh-post'))!.language, 'zh-Hans')
  assert.ok(!JSON.stringify(json).includes('Unpublished'))
})

test('videoPageUrl maps player URLs to watch pages', () => {
  assert.equal(feed.videoPageUrl('https://www.youtube-nocookie.com/embed/jkAqK3vqILI?autoplay=1'), 'https://www.youtube.com/watch?v=jkAqK3vqILI')
  assert.equal(feed.videoPageUrl('https://player.vimeo.com/video/123'), 'https://vimeo.com/123')
  assert.equal(feed.videoPageUrl('https://example.com/x'), 'https://example.com/x')
})
