import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  INDEXNOW_ENDPOINT,
  PURGE_BATCH_SIZE,
  STATIC_CONTENT_PATHS,
  chunk,
  derivedPurgePaths,
  indexNowKeyLocation,
  notifyEdge,
  revalidatePaths,
} from '../lib/revalidate'

const ENV_KEYS = ['CF_ZONE_ID', 'CF_API_TOKEN', 'INDEXNOW_KEY', 'SITE_URL', 'NEXT_PUBLIC_SITE_HOST', 'LOG_LEVEL'] as const
let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
  process.env.SITE_URL = 'https://lucian-dev.com'
  process.env.LOG_LEVEL = 'error' // keep the expected warnings out of the test output
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

type Call = { url: string; init: RequestInit; body: any }

function stubFetch(respond: (url: string, body: any) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, init, body })
    return respond(url, body)
  }) as typeof fetch
  return { fn, calls }
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('nothing is sent without CF or IndexNow configuration', async () => {
  const { fn, calls } = stubFetch(() => json(200, { success: true }))
  assert.deepEqual(await notifyEdge(['/blog', '/now'], fn), { purged: 0, indexed: 0 })
  assert.equal(calls.length, 0)
})

test('purge batches absolute URLs (≤30 per call) incl. feeds, and skips IndexNow without a key', async () => {
  process.env.CF_ZONE_ID = 'zone123'
  process.env.CF_API_TOKEN = 'tok'
  const { fn, calls } = stubFetch(() => json(200, { success: true }))
  const paths = ['/blog', ...Array.from({ length: 40 }, (_, i) => `/blog/post-${i}`)]
  const result = await notifyEdge(paths, fn)

  const expected = paths.length + derivedPurgePaths(paths).length
  assert.equal(result.purged, expected)
  assert.equal(result.indexed, 0)
  assert.equal(calls.length, Math.ceil(expected / PURGE_BATCH_SIZE))
  for (const c of calls) {
    assert.equal(c.url, 'https://api.cloudflare.com/client/v4/zones/zone123/purge_cache')
    assert.equal(c.init.method, 'POST')
    assert.equal((c.init.headers as Record<string, string>).Authorization, 'Bearer tok')
    assert.ok(c.body.files.length <= PURGE_BATCH_SIZE)
    assert.ok(c.init.signal instanceof AbortSignal, 'every call has a timeout')
  }
  const files = calls.flatMap((c) => c.body.files)
  assert.equal(new Set(files).size, files.length, 'no URL purged twice')
  assert.ok(files.includes('https://lucian-dev.com/blog/post-39'))
  assert.ok(files.includes('https://lucian-dev.com/feed.xml'))
  assert.ok(files.every((f: string) => f.startsWith('https://lucian-dev.com/')))
})

test('IndexNow gets host, key, keyLocation and the page URLs only', async () => {
  process.env.INDEXNOW_KEY = 'abcdef0123456789'
  const { fn, calls } = stubFetch(() => new Response(null, { status: 202 }))
  const result = await notifyEdge(['/work', '/work/a', '/work/a'], fn)
  assert.deepEqual(result, { purged: 0, indexed: 2 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, INDEXNOW_ENDPOINT)
  assert.deepEqual(calls[0].body, {
    host: 'lucian-dev.com',
    key: 'abcdef0123456789',
    // At the site root: a key file only authorises URLs in its own directory
    // and below, so /api/… would have covered nothing but /api/*.
    keyLocation: 'https://lucian-dev.com/abcdef0123456789.txt',
    urlList: ['https://lucian-dev.com/work', 'https://lucian-dev.com/work/a'],
  })
  assert.equal(indexNowKeyLocation('lucian-dev.com', 'k3y-0123'), 'https://lucian-dev.com/k3y-0123.txt')
  for (const url of calls[0].body.urlList as string[]) {
    const dir = new URL(calls[0].body.keyLocation).pathname.replace(/[^/]*$/, '')
    assert.ok(new URL(url).pathname.startsWith(dir), `${url} is under the key file's directory`)
  }
})

test('robots.txt keeps the root key file and security.txt fetchable', () => {
  const robots = fs.readFileSync(path.join(process.cwd(), 'public/robots.txt'), 'utf8')
  const disallowed = robots
    .split('\n')
    .filter((l) => /^Disallow:/i.test(l))
    .map((l) => l.replace(/^Disallow:\s*/i, '').trim())
  for (const p of ['/abcdef0123456789.txt', '/.well-known/security.txt']) {
    assert.ok(!disallowed.some((d) => d && p.startsWith(d)), `${p} must not be disallowed`)
  }
})

test('a malformed IndexNow key or a loopback-only site disables the edge calls', async () => {
  process.env.INDEXNOW_KEY = 'short'
  const { fn, calls } = stubFetch(() => new Response(null, { status: 200 }))
  assert.deepEqual(await notifyEdge(['/now'], fn), { purged: 0, indexed: 0 })

  process.env.INDEXNOW_KEY = 'abcdef0123456789'
  process.env.SITE_URL = 'http://127.0.0.1:3000'
  assert.deepEqual(await notifyEdge(['/now'], fn), { purged: 0, indexed: 0 })
  assert.equal(calls.length, 0)
})

test('failures, rejections and timeouts are swallowed', async () => {
  process.env.CF_ZONE_ID = 'zone'
  process.env.CF_API_TOKEN = 'tok'
  process.env.INDEXNOW_KEY = 'abcdef0123456789'

  const rejected = stubFetch(() => Promise.reject(new TypeError('network down')))
  assert.deepEqual(await notifyEdge(['/blog'], rejected.fn), { purged: 0, indexed: 0 })

  const apiError = stubFetch((url) =>
    url.startsWith('https://api.cloudflare.com') ? json(403, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] }) : new Response('', { status: 429 }),
  )
  assert.deepEqual(await notifyEdge(['/blog'], apiError.fn), { purged: 0, indexed: 0 })

  const notJson = stubFetch(() => new Response('<html>', { status: 200 }))
  assert.equal((await notifyEdge(['/now'], notJson.fn)).purged, 0)

  const timeout = stubFetch(() => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')))
  assert.deepEqual(await notifyEdge(['/uses'], timeout.fn), { purged: 0, indexed: 0 })
})

test('revalidatePaths reports failures, never throws, and only notifies refreshed paths', async () => {
  process.env.CF_ZONE_ID = 'zone'
  process.env.CF_API_TOKEN = 'tok'
  const purged: string[] = []
  const originalFetch = globalThis.fetch
  let resolveCalled: () => void = () => {}
  const called = new Promise<void>((r) => (resolveCalled = r))
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    purged.push(...JSON.parse(String(init?.body)).files)
    resolveCalled()
    return json(200, { success: true })
  }) as typeof fetch
  try {
    const seen: string[] = []
    const res = {
      revalidate: async (p: string) => {
        seen.push(p)
        if (p === '/uses') throw new Error('boom')
      },
    } as any
    const failed = await revalidatePaths(res, ['/now', '/uses', '/now', 'relative', '/colophon'])
    assert.deepEqual(failed, ['/uses'])
    assert.deepEqual(seen.sort(), ['/colophon', '/now', '/uses'])
    await called
    assert.ok(purged.includes('https://lucian-dev.com/now'))
    assert.ok(purged.includes('https://lucian-dev.com/colophon'))
    assert.ok(!purged.includes('https://lucian-dev.com/uses'), 'a path that failed to revalidate is not purged')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('confirm paths are regenerated a second time, after the first pass has finished', async () => {
  const order: string[] = []
  let running = 0
  const res = {
    revalidate: async (p: string) => {
      running++
      order.push(`start ${p} (${running} running)`)
      await new Promise((r) => setTimeout(r, 5))
      running--
    },
  } as any
  const failed = await revalidatePaths(res, ['/cv', '/blog'], { confirm: ['/cv'] })
  assert.deepEqual(failed, [])
  assert.deepEqual(order, ['start /cv (1 running)', 'start /blog (2 running)', 'start /cv (1 running)'])
  const flaky = { calls: 0, revalidate: async () => { flaky.calls++; if (flaky.calls === 2) throw new Error('second pass failed') } } as any
  assert.deepEqual(await revalidatePaths(flaky, ['/cv'], { confirm: ['/cv'] }), ['/cv'], 'a failed confirmation is reported')
})

test('derived purge paths and helpers', () => {
  assert.deepEqual(derivedPurgePaths(['/now']), ['/api/search-index'])
  assert.deepEqual(derivedPurgePaths(['/colophon']), [])
  assert.ok(derivedPurgePaths(['/work/x']).includes('/work/feed.xml'))
  assert.ok(derivedPurgePaths(['/blog']).includes('/sitemap.xml'))
  assert.deepEqual(derivedPurgePaths(['/blogroll']), [])
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(chunk([], 30), [])
  // The /about bio is part of the search index (G1 / A4).
  assert.deepEqual(derivedPurgePaths(['/about']), ['/api/search-index'])
  // ISR pages only (/ and /about since home-about G1, /cv and /cv/zh since cv-docs G1, /contact since cv-studio-contact G1, /publications since publications).
  assert.deepEqual([...STATIC_CONTENT_PATHS], ['/', '/about', '/blog', '/work', '/now', '/uses', '/colophon', '/contact', '/cv', '/cv/zh', '/publications'])
  // A CV page change purges its downloadable files with it.
  assert.deepEqual(derivedPurgePaths(['/cv']), ['/cv.pdf', '/cv.txt', '/cv.json'])
  assert.deepEqual(derivedPurgePaths(['/cv/zh']), ['/cv/zh.pdf', '/cv/zh.txt', '/cv/zh.json'])
  // The sitemap lists /publications only while it has public papers.
  assert.deepEqual(derivedPurgePaths(['/publications']), ['/sitemap.xml'])
})

function fakeRes() {
  const headers: Record<string, unknown> = {}
  const res: any = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    body: undefined as string | undefined,
    setHeader(k: string, v: unknown) {
      headers[k.toLowerCase()] = v
      return res
    },
    status(code: number) {
      res.statusCode = code
      return res
    },
    end(body?: string) {
      res.body = body
      res.writableEnded = true
      return res
    },
    json(body: unknown) {
      return res.end(JSON.stringify(body))
    },
  }
  return { res, headers }
}

test('/api/indexnow-key serves the key as text/plain, 404 when unset', async () => {
  const { default: handler } = await import('../pages/api/indexnow-key')
  const call = async (method: string) => {
    const { res, headers } = fakeRes()
    await handler({ method, headers: {} } as any, res)
    return { status: res.statusCode, body: res.body, headers }
  }

  const unset = await call('GET')
  assert.equal(unset.status, 404)
  assert.equal(unset.headers['content-type'], 'text/plain; charset=utf-8')

  process.env.INDEXNOW_KEY = 'abcdef0123456789'
  const ok = await call('GET')
  assert.equal(ok.status, 200)
  assert.equal(ok.body, 'abcdef0123456789')
  assert.equal(ok.headers['content-type'], 'text/plain; charset=utf-8')

  const head = await call('HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.body, undefined)

  assert.equal((await call('POST')).status, 405)
})
