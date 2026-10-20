/**
 * reading-work D3: a YouTube / Vimeo link alone in its paragraph becomes the
 * click-to-load player; its poster is a copy imported once into /uploads
 * (never a third-party thumbnail on page load); feeds keep plain links.
 */
import { register } from 'node:module'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseStartTime, parseVideoUrl, videoPlayerUrl, videoWatchUrl, youtubeId, videoRefFromProps } from '../lib/videoUrl'
import { compileMdx } from '../lib/mdx'
import { isElement, walk, type HastNode } from '../lib/rehype/hast'
import { renderFeedHtml } from '../lib/feedHtml'
import {
  ensurePosters,
  findPoster,
  importPoster,
  posterStem,
  posterState,
  resetPosterState,
  thumbnailCandidates,
  videosIn,
  POSTER_RETRY_MS,
} from '../lib/videoPoster'
import { videoLinkUrl, videoLine } from '../components/Admin/editor/slashItems'

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      import { readFileSync } from 'node:fs'
      import { fileURLToPath } from 'node:url'
      import { createRequire } from 'node:module'
      const require = createRequire(${JSON.stringify(new URL('../package.json', import.meta.url).href)})
      const ts = require('typescript')
      export async function resolve(specifier, context, next) {
        if (specifier === 'next/link' || specifier === 'next/router' || specifier === 'next/head') return next(specifier + '.js', context)
        return next(specifier, context)
      }
      export async function load(url, context, next) {
        if (url.startsWith('file:') && url.endsWith('.tsx') && !url.includes('/node_modules/')) {
          const source = readFileSync(fileURLToPath(url), 'utf8')
          const out = ts.transpileModule(source, {
            fileName: fileURLToPath(url),
            compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
          })
          return { format: 'module', source: out.outputText, shortCircuit: true }
        }
        return next(url, context)
      }
    `),
  import.meta.url,
)

const ID = 'jkAqK3vqILI'
const noImages = { resolveSize: () => null, srcSetFor: () => null }
const html = (el: unknown) => renderToStaticMarkup(el as Parameters<typeof renderToStaticMarkup>[0]).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

function find(tree: unknown, tag: string | string[]): Array<HastNode & { properties: Record<string, unknown> }> {
  const out: Array<HastNode & { properties: Record<string, unknown> }> = []
  walk(tree as HastNode, (n) => {
    if (isElement(n, tag)) out.push(n as HastNode & { properties: Record<string, unknown> })
  })
  return out
}

/** A PNG header (enough for the size reader): `w`×`h`. */
function pngHeader(w: number, h: number): Buffer {
  const b = Buffer.alloc(64)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  return b
}

const tmpDirs: string[] = []
function uploadsTmp(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-video-'))
  tmpDirs.push(root)
  const dir = path.join(root, 'public', 'uploads')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
after(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true })
})

test('D3 parseVideoUrl: YouTube and Vimeo forms, start times, refusals', () => {
  const yt = (url: string) => parseVideoUrl(url)
  for (const url of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&feature=share`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
  ]) {
    assert.deepEqual(yt(url), { provider: 'youtube', id: ID }, url)
  }
  assert.deepEqual(yt(`https://youtu.be/${ID}?t=90`), { provider: 'youtube', id: ID, start: 90 })
  assert.deepEqual(yt(`https://www.youtube.com/watch?v=${ID}&t=1m30s`), { provider: 'youtube', id: ID, start: 90 })
  assert.deepEqual(yt('https://vimeo.com/76979871'), { provider: 'vimeo', id: '76979871' })
  assert.deepEqual(yt('https://vimeo.com/76979871/abc123def0'), { provider: 'vimeo', id: '76979871', hash: 'abc123def0' })
  assert.deepEqual(yt('https://vimeo.com/channels/staffpicks/76979871'), { provider: 'vimeo', id: '76979871' })
  assert.deepEqual(yt('https://vimeo.com/groups/motion/videos/76979871'), { provider: 'vimeo', id: '76979871' })
  assert.deepEqual(yt('https://player.vimeo.com/video/76979871?h=abc123def0'), { provider: 'vimeo', id: '76979871', hash: 'abc123def0' })
  assert.deepEqual(yt('https://vimeo.com/76979871#t=1m2s'), { provider: 'vimeo', id: '76979871', start: 62 })
  for (const bad of [
    'https://youtube.com.evil.example/watch?v=' + ID,
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/redirect?q=x',
    'https://vimeo.com/about',
    'https://vimeo.com/76979871/not-a-hash!',
    'https://user:pw@youtu.be/' + ID,
    'javascript:alert(1)',
    'ftp://youtu.be/' + ID,
    '',
    42,
  ]) {
    assert.equal(parseVideoUrl(bad), null, String(bad))
  }
  assert.equal(parseStartTime('1h2m3s'), 3723)
  assert.equal(parseStartTime('0'), undefined)
  assert.equal(parseStartTime('abc'), undefined)
  assert.equal(parseStartTime('999999'), undefined, 'more than a day is not a timestamp')
  // Moved from the slash menu: bare ids and scheme-less URLs still work.
  assert.equal(youtubeId(ID), ID)
  assert.equal(youtubeId(`youtube.com/shorts/${ID}`), ID)
  assert.equal(youtubeId('https://vimeo.com/123'), null)
})

test('D3 player and watch URLs carry only the id, hash, start and fixed privacy options', () => {
  assert.equal(videoPlayerUrl({ provider: 'youtube', id: ID, start: 30 }, { autoplay: true }), `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&start=30`)
  assert.equal(videoPlayerUrl({ provider: 'vimeo', id: '1', hash: 'abcdef12' }, { autoplay: true }), 'https://player.vimeo.com/video/1?h=abcdef12&autoplay=1&dnt=1')
  assert.equal(videoWatchUrl({ provider: 'youtube', id: ID, start: 5 }), `https://www.youtube.com/watch?v=${ID}&t=5s`)
  assert.equal(videoWatchUrl({ provider: 'vimeo', id: '1', start: 5 }), 'https://vimeo.com/1#t=5s')
  assert.deepEqual(videoRefFromProps({ 'data-vimeo-id': '12', 'data-vimeo-hash': 'abcdef12', 'data-start': '7' }), { provider: 'vimeo', id: '12', hash: 'abcdef12', start: 7 })
  assert.equal(videoRefFromProps({ dataYoutubeId: 'bad' }), null)
})

test('D3 compile: a lone video link becomes the facade; links in prose, lists and quotes stay links', async () => {
  const body = [
    `[SWCS demo](https://www.youtube.com/watch?v=${ID})`,
    '',
    `https://youtu.be/${ID}?t=12`,
    '',
    'https://vimeo.com/76979871/abcdef1234',
    '',
    `Watch [the demo](https://youtu.be/${ID}) first.`,
    '',
    `- [In a list](https://youtu.be/${ID})`,
    '',
    `> [In a quote](https://youtu.be/${ID})`,
  ].join('\n')
  const posters: string[] = []
  const { tree } = await compileMdx(body, {
    lang: 'en',
    ...noImages,
    posterFor: (v) => {
      posters.push(`${v.provider}:${v.id}`)
      return v.provider === 'youtube' ? { src: `/uploads/video-youtube-${v.id}.jpg`, srcSet: '/uploads/a.w640.webp 640w', width: 1280, height: 720 } : null
    },
  })
  const yt = find(tree, 'youtube-embed')
  const vimeo = find(tree, 'vimeo-embed')
  assert.equal(yt.length, 2)
  assert.equal(vimeo.length, 1)
  assert.equal(yt[0].properties.title, 'SWCS demo')
  assert.equal(yt[0].properties.dataPoster, `/uploads/video-youtube-${ID}.jpg`)
  assert.equal(yt[0].properties.dataPosterSrcset, '/uploads/a.w640.webp 640w')
  assert.equal(yt[0].properties.dataPosterWidth, 1280)
  assert.equal(yt[1].properties.title, undefined, 'a bare URL has no title')
  assert.equal(yt[1].properties.dataStart, 12)
  assert.equal(vimeo[0].properties.dataVimeoHash, 'abcdef1234')
  assert.equal(vimeo[0].properties.dataPoster, undefined)
  assert.equal(vimeo[0].properties.dataUiLang, 'en')
  // Three links stayed links (prose, list, quote).
  assert.equal(find(tree, 'a').filter((a) => String(a.properties.href).includes('youtu')).length, 3)
  assert.deepEqual(posters.sort(), [`youtube:${ID}`, `youtube:${ID}`, 'vimeo:76979871'].sort())
})

test('D3 compile: <YouTube> gets the stored poster; a poster that is not a same-site path is ignored; zh notes', async () => {
  const { tree } = await compileMdx(`<YouTube id="${ID}" title="Talk" />`, {
    lang: 'zh-Hans',
    ...noImages,
    posterFor: () => ({ src: 'https://i.ytimg.com/vi/x/hqdefault.jpg', width: 480, height: 360 }),
  })
  const [el] = find(tree, 'youtube-embed')
  assert.equal(el.properties.dataPoster, undefined)
  assert.equal(el.properties.dataUiLang, 'zh')
  const { tree: t2 } = await compileMdx(`<YouTube id="${ID}" />`, { lang: 'en', ...noImages, posterFor: () => ({ src: `/uploads/video-youtube-${ID}.jpg`, width: 480, height: 360 }) })
  const [el2] = find(t2, 'youtube-embed')
  assert.equal(el2.properties.dataPoster, `/uploads/video-youtube-${ID}.jpg`)
  assert.equal(el2.properties.title, undefined, 'no invented title')
})

test('D3 the facade requests nothing from YouTube before play; caption names the host and links out', async () => {
  const { default: MDXContent } = await import('../components/MDX/MDXContent')
  const { tree } = await compileMdx(`[SWCS demo](https://www.youtube.com/watch?v=${ID})\n\nhttps://vimeo.com/76979871`, {
    lang: 'en',
    ...noImages,
    posterFor: (v) => (v.provider === 'youtube' ? { src: `/uploads/video-youtube-${ID}.jpg`, width: 1280, height: 720 } : null),
  })
  const out = html(createElement(MDXContent, { tree, as: 'div' }))
  assert.ok(!/ytimg\.com|vimeocdn\.com/.test(out), 'no third-party thumbnail')
  assert.ok(!/<iframe/.test(out), 'no player frame before play')
  assert.match(out, /<button[^>]*aria-label="Play video: SWCS demo"/)
  assert.match(out, /<button[^>]*aria-label="Play video: Vimeo video"/)
  assert.match(out, new RegExp(`<img[^>]*src="/uploads/video-youtube-${ID}\\.jpg"`))
  assert.match(out, /Loads from youtube-nocookie\.com \(YouTube\) only when you press play\./)
  assert.match(out, /Loads from player\.vimeo\.com \(Vimeo\) only when you press play\./)
  assert.match(out, new RegExp(`href="https://www\\.youtube\\.com/watch\\?v=${ID}"`))
  assert.match(out, /href="https:\/\/vimeo\.com\/76979871"/)
})

test('D3 feeds keep plain links for auto-embedded and Vimeo players', async () => {
  const { tree } = await compileMdx(`[Demo](https://youtu.be/${ID}?t=3)\n\nhttps://vimeo.com/76979871`, { lang: 'en', ...noImages, posterFor: () => null })
  const out = renderFeedHtml(tree, 'https://lucian-dev.com')
  assert.match(out, new RegExp(`<a href="https://www\\.youtube\\.com/watch\\?v=${ID}&#x26;t=3s">Watch on YouTube: Demo</a>`))
  assert.match(out, /<a href="https:\/\/vimeo\.com\/76979871">Watch on Vimeo: the video<\/a>/)
  assert.ok(!out.includes('embed'), 'no facade elements in the feed')
})

test('D3 videosIn: lone links and <YouTube> tags only, outside code, deduplicated', () => {
  const body = [
    `https://youtu.be/${ID}`,
    '',
    `[Demo](<https://www.youtube.com/watch?v=${ID}>)`,
    '',
    'https://vimeo.com/76979871',
    '',
    'text https://vimeo.com/111 in a sentence',
    '',
    '- https://vimeo.com/222',
    '',
    '```',
    'https://vimeo.com/333',
    '```',
    '',
    '<YouTube id="aaaaaaaaaaa" title="x" />',
    'https://vimeo.com/444',
    'joined to the line above',
  ].join('\n')
  assert.deepEqual(
    videosIn(body).map(posterStem),
    [`video-youtube-${ID}`, 'video-vimeo-76979871', 'video-youtube-aaaaaaaaaaa'],
  )
  assert.deepEqual(videosIn(''), [])
})

test('D3 importPoster: maxres → hqdefault fallback, stored once under the fixed name, shared in-flight, failures retried after an hour', async () => {
  resetPosterState()
  const dir = uploadsTmp()
  const fetched: string[] = []
  let stores = 0
  let now = 1_000
  const deps = {
    dir,
    now: () => now,
    fetchJson: async () => ({}),
    fetchImage: async (url: string) => {
      fetched.push(url)
      if (url.includes('maxresdefault')) throw new Error('HTTP 404')
      return { buf: pngHeader(480, 360), mime: 'image/png' as const, name: 'hq.png', url }
    },
    store: async (buf: Buffer, _mime: string, name: string) => {
      stores++
      fs.writeFileSync(path.join(dir, `${name}.png`), buf)
      return { url: `/uploads/${name}.png`, name: `${name}.png`, width: 480, height: 360, variants: [] }
    },
  }
  const v = { provider: 'youtube' as const, id: ID }
  const [a, b] = await Promise.all([importPoster(v, deps), importPoster(v, deps)])
  assert.deepEqual(a, { src: `/uploads/video-youtube-${ID}.png`, width: 480, height: 360 })
  assert.deepEqual(b, a)
  assert.equal(stores, 1, 'one download for concurrent calls')
  assert.deepEqual(fetched, [`https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`])
  // Stored now: no new download.
  assert.deepEqual(await importPoster(v, deps), a)
  assert.equal(fetched.length, 2)
  assert.deepEqual(findPoster(v, dir), a)

  // A video whose thumbnails all fail is not retried within the hour.
  const w = { provider: 'youtube' as const, id: 'bbbbbbbbbbb' }
  const failing = { ...deps, fetchImage: async (url: string) => (fetched.push(url), Promise.reject(new Error('down'))) }
  assert.equal(await importPoster(w, failing), null)
  const afterFail = fetched.length
  assert.equal(await importPoster(w, failing), null)
  assert.equal(fetched.length, afterFail, 'no retry within the hour')
  now += POSTER_RETRY_MS + 1
  assert.equal(await importPoster(w, failing), null)
  assert.ok(fetched.length > afterFail, 'retried after the hour')
})

test('D3 Vimeo thumbnails come from oEmbed and only from i.vimeocdn.com', async () => {
  const urls: string[] = []
  const json = (thumb: unknown) => async (url: string) => (urls.push(url), { thumbnail_url: thumb })
  assert.deepEqual(await thumbnailCandidates({ provider: 'vimeo', id: '5', hash: 'abcdef12' }, json('https://i.vimeocdn.com/video/1-d_1280x720')), ['https://i.vimeocdn.com/video/1-d_1280x720'])
  assert.equal(urls[0], 'https://vimeo.com/api/oembed.json?width=1280&url=https%3A%2F%2Fvimeo.com%2F5%2Fabcdef12')
  assert.deepEqual(await thumbnailCandidates({ provider: 'vimeo', id: '5' }, json('https://evil.example/x.jpg')), [])
  assert.deepEqual(await thumbnailCandidates({ provider: 'vimeo', id: '5' }, json('http://i.vimeocdn.com/x.jpg')), [])
  assert.deepEqual(await thumbnailCandidates({ provider: 'vimeo', id: '5' }, json(42)), [])
})

test('D3 posterState (part of the compile cache key) changes once a poster is stored', () => {
  const dir = uploadsTmp()
  const body = `https://youtu.be/${ID}\n\nText.`
  assert.equal(posterState(body, dir), `video-youtube-${ID}:0`)
  fs.writeFileSync(path.join(dir, `video-youtube-${ID}.jpg`), Buffer.from([0xff, 0xd8, 0xff]))
  // Stored; its AVIF variants (G4) and placeholder (C8) not yet backfilled.
  assert.equal(posterState(body, dir), `video-youtube-${ID}:1:00`)
  fs.writeFileSync(path.join(dir, `video-youtube-${ID}.jpg.w320.avif`), Buffer.from([0]))
  assert.equal(posterState(body, dir), `video-youtube-${ID}:1:10`)
  assert.equal(posterState('no video', dir), '')
})

test('D3 ensurePosters waits at most its budget and never throws', async () => {
  resetPosterState()
  const dir = uploadsTmp()
  const started = Date.now()
  await ensurePosters(`https://youtu.be/${ID}`, {
    budgetMs: 50,
    deps: { dir, fetchJson: async () => ({}), fetchImage: () => new Promise(() => undefined) },
  })
  assert.ok(Date.now() - started < 1000)
  await ensurePosters('no videos here', { deps: { dir } })
})

test('D3 slash menu: video links (YouTube or Vimeo) and the raw line it inserts', () => {
  assert.equal(videoLinkUrl(`youtu.be/${ID}`), `https://www.youtube.com/watch?v=${ID}`)
  assert.equal(videoLinkUrl(ID), `https://www.youtube.com/watch?v=${ID}`)
  assert.equal(videoLinkUrl('https://vimeo.com/76979871'), 'https://vimeo.com/76979871')
  assert.equal(videoLinkUrl('https://example.com/video'), null)
  assert.equal(videoLine('https://vimeo.com/1', 'Talk [live]'), '[Talk \\[live\\]](https://vimeo.com/1)')
  assert.equal(videoLine('https://vimeo.com/1', ' '), 'https://vimeo.com/1')
})
