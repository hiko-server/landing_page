/**
 * Server GitHub loaders (lib/githubData) and the shared cache (lib/github)
 * against a stubbed GitHub: one shared repos request, featured ordering,
 * slim events, the GraphQL calendar, stats assembly, stale-while-revalidate,
 * the summary's time budget and the no-profile case. Runs in a throw-away
 * working directory so the content store is an empty temp database.
 */
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'GITHUB_TOKEN']) delete process.env[k]
process.env.LOG_LEVEL = 'error'

const originalCwd = process.cwd()
const originalFetch = globalThis.fetch
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-opensource-'))
let gh: typeof import('../lib/github')
let data: typeof import('../lib/githubData')
let db: typeof import('../lib/db')

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>
let routes: Record<string, Route> = {}
let calls: string[] = []

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function stubFetch() {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    calls.push(url.pathname)
    const route = routes[url.pathname]
    if (!route) return json({ message: 'Not Found' }, 404)
    return route(url, init)
  }) as typeof fetch
}

const repo = (name: string, stars: number, extra: Record<string, unknown> = {}) => ({
  id: stars * 10 + name.length,
  name,
  full_name: `me/${name}`,
  html_url: `https://github.com/me/${name}`,
  description: `${name} description`,
  stargazers_count: stars,
  forks_count: 1,
  language: 'TypeScript',
  updated_at: '2026-10-01T00:00:00Z',
  pushed_at: '2026-10-01T00:00:00Z',
  fork: false,
  owner: { login: 'me' },
  ...extra,
})

const REPOS = [
  repo('site', 5),
  repo('tool', 9, { pushed_at: '2026-10-10T00:00:00Z' }),
  repo('forked', 50, { fork: true }),
  repo('tiny', 0, { description: null, language: null }),
]

function githubFor(user: string) {
  return {
    [`/users/${user}/repos`]: () => json(REPOS),
    [`/users/${user}`]: () => json({ login: user, public_repos: 4, followers: 7 }),
    [`/users/${user}/events/public`]: () =>
      json([
        {
          id: '101',
          type: 'PushEvent',
          created_at: '2026-10-12T10:00:00Z',
          actor: { login: user, avatar_url: 'https://example.com/a.png' },
          repo: { name: `${user}/site`, url: 'https://api.github.com/repos/x' },
          payload: { commits: [{ sha: 'a' }, { sha: 'b' }], ref: 'refs/heads/main' },
        },
        {
          id: '100',
          type: 'PullRequestEvent',
          created_at: '2026-10-12T09:00:00Z',
          repo: { name: `${user}/site` },
          payload: { action: 'opened', pull_request: { number: 14, body: 'long text' } },
        },
      ]),
    [`/repos/me/site/languages`]: () => json({ TypeScript: 900, CSS: 100 }),
    [`/repos/me/tool/languages`]: () => json({ TypeScript: 500, Shell: 20 }),
    [`/repos/me/tiny/languages`]: () => json({}),
  } as Record<string, Route>
}

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  db = await import('../lib/db')
  gh = await import('../lib/github')
  data = await import('../lib/githubData')
  stubFetch()
})

after(() => {
  globalThis.fetch = originalFetch
  db.closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

beforeEach(() => {
  gh.clearGhCache()
  calls = []
  routes = {}
  delete process.env.GITHUB_TOKEN
})

test('login validation and extraction', () => {
  assert.equal(gh.isGithubLogin('HikoPLi'), true)
  assert.equal(gh.isGithubLogin('a-b'), true)
  assert.equal(gh.isGithubLogin('-ab'), false)
  assert.equal(gh.isGithubLogin('a--b'), false)
  assert.equal(gh.isGithubLogin('a'.repeat(40)), false)
  assert.equal(gh.extractGithubUser('https://github.com/HikoPLi'), 'HikoPLi')
  assert.equal(gh.extractGithubUser('https://github.com/HikoPLi/landing_page'), 'HikoPLi')
  assert.equal(gh.extractGithubUser('https://github.com/..%2Fadmin'), null)
  assert.equal(gh.extractGithubUser('not a url'), null)
})

test('stats, top repos, languages and the events fallback share ONE repos request', async () => {
  routes = { ...githubFor('me'), '/users/me/events/public': () => json([]) }
  const home = null
  const [stats, top, langs, events] = await Promise.all([
    data.loadStats('me', home),
    data.loadTopRepos('me', home),
    data.loadLanguages('me'),
    data.loadEvents('me'),
  ])
  assert.equal(calls.filter((p) => p === '/users/me/repos').length, 1)
  assert.equal(stats.available, true)
  assert.equal(top.available, true)
  assert.equal(langs.available, true)
  // Empty 90-day feed: the most recently pushed own repositories stand in.
  assert.deepEqual(
    events.events.map((e) => [e.type, e.repo?.name]),
    [
      ['RepoUpdateEvent', 'me/tool'],
      ['RepoUpdateEvent', 'me/site'],
      ['RepoUpdateEvent', 'me/tiny'],
    ],
  )
  // A second round within the TTL is served from memory.
  calls = []
  await Promise.all([data.loadStats('me', home), data.loadTopRepos('me', home), data.loadLanguages('me')])
  assert.deepEqual(calls, [])
})

test('top repos: featured first with blurbs, forks excluded from the fill, no internal fields', async () => {
  routes = githubFor('me')
  const home = { openSource: { featured: [{ name: 'tiny', blurb: 'Small but mine.' }, { name: 'nope' }] } } as never
  const top = await data.loadTopRepos('me', home)
  assert.deepEqual(
    top.repos.map((r) => r.name),
    ['tiny', 'tool', 'site'],
  )
  assert.equal(top.repos[0].featured, true)
  assert.equal(top.repos[0].blurb, 'Small but mine.')
  assert.ok(typeof top.asOf === 'number')
  assert.equal('fork' in top.repos[0], false)
  assert.equal('owner' in top.repos[0], false)

  const choices = await data.loadRepoChoices('me')
  assert.deepEqual(
    choices.repos.map((r) => r.name),
    ['tool', 'site', 'tiny'],
  )
  assert.deepEqual(Object.keys(choices.repos[0]).sort(), ['description', 'language', 'name', 'pushed_at', 'stargazers_count'])
})

test('events are slimmed to what the feed renders', async () => {
  routes = githubFor('me')
  const events = await data.loadEvents('me')
  assert.equal(events.available, true)
  assert.deepEqual(events.events[0], {
    id: '101',
    type: 'PushEvent',
    created_at: '2026-10-12T10:00:00Z',
    repo: { name: 'me/site' },
    payload: { size: 2 },
  })
  assert.deepEqual(events.events[1].payload, { action: 'opened', number: 14 })
  // JSON-serialisable for getServerSideProps: no undefined anywhere.
  assert.equal(JSON.stringify(events).includes('undefined'), false)
})

test('GitHub down: unavailable payloads, never a throw', async () => {
  routes = {
    '/users/me/repos': () => json({ message: 'rate limited' }, 403),
    '/users/me': () => json({ message: 'rate limited' }, 403),
    '/users/me/events/public': () => json({ message: 'rate limited' }, 403),
  }
  const [stats, top, langs, events] = await Promise.all([
    data.loadStats('me', null),
    data.loadTopRepos('me', null),
    data.loadLanguages('me'),
    data.loadEvents('me'),
  ])
  assert.equal(stats.available, false)
  assert.equal(top.available, false)
  assert.equal(langs.available, false)
  assert.equal(events.available, false)
})

test('contribution calendar via GraphQL when a token is set', async () => {
  process.env.GITHUB_TOKEN = 'test-token'
  let auth = ''
  routes = {
    '/graphql': (_url, init) => {
      auth = String((init?.headers as Record<string, string>)?.Authorization || '')
      const body = JSON.parse(String(init?.body))
      assert.equal(body.variables.login, 'me')
      return json({
        data: {
          user: {
            contributionsCollection: {
              contributionCalendar: {
                totalContributions: 9,
                weeks: [
                  {
                    contributionDays: [
                      { date: '2026-10-11', contributionCount: 0 },
                      { date: '2026-10-12', contributionCount: 3 },
                      { date: '2026-10-13', contributionCount: 6 },
                    ],
                  },
                ],
              },
            },
          },
        },
      })
    },
  }
  const cal = await data.loadContributions('me')
  assert.equal(auth, 'Bearer test-token')
  assert.equal(cal.available, true)
  assert.equal(cal.total, 9)
  assert.deepEqual(
    cal.weeks?.[0].days.map((d) => [d.date, d.count, d.level]),
    [
      ['2026-10-11', 0, 0],
      ['2026-10-12', 3, 1],
      ['2026-10-13', 6, 4],
    ],
  )
})

test('stats combine the cached core with languages, contributions and the vanity opt-in', async () => {
  process.env.GITHUB_TOKEN = 'test-token'
  routes = {
    ...githubFor('me'),
    '/graphql': () =>
      json({
        data: {
          user: {
            contributionsCollection: {
              contributionCalendar: { totalContributions: 1622, weeks: [{ contributionDays: [{ date: '2026-10-13', contributionCount: 4 }] }] },
            },
          },
        },
      }),
  }
  const plain = await data.loadStats('me', null)
  assert.deepEqual(plain, {
    user: 'me',
    public_repos: 4,
    followers: 7,
    total_stars: 64,
    available: true,
    languages: 3,
    contributions: 1622,
    showVanity: false,
  })
  const vain = await data.loadStats('me', { openSource: { showVanityStats: true } } as never)
  assert.equal(vain.showVanity, true)
})

test('cachedGh: stale-while-revalidate, shared in-flight loads, last real value on failure', async () => {
  const realNow = Date.now
  let clock = realNow()
  Date.now = () => clock
  try {
    let n = 0
    const loader = async () => {
      n++
      return `v${n}`
    }
    assert.equal(await gh.cachedGh('swr', 1000, 'fallback', loader), 'v1')
    assert.equal(await gh.cachedGh('swr', 1000, 'fallback', loader), 'v1')
    assert.equal(n, 1)

    clock += 2000 // expired: the old value is served while one refresh runs
    const [a, b] = await Promise.all([gh.cachedGh('swr', 1000, 'fallback', loader), gh.cachedGh('swr', 1000, 'fallback', loader)])
    assert.deepEqual([a, b], ['v1', 'v1'])
    await new Promise((r) => setImmediate(r))
    assert.equal(n, 2)
    assert.equal(await gh.cachedGh('swr', 1000, 'fallback', loader), 'v2')

    clock += 2000 // a failing refresh keeps the last real value
    const failing = async (): Promise<string> => {
      throw new Error('down')
    }
    assert.equal(await gh.cachedGh('swr', 1000, 'fallback', failing), 'v2')
    await new Promise((r) => setImmediate(r))
    assert.equal(await gh.cachedGh('swr', 1000, 'fallback', failing), 'v2')

    // Never loaded successfully: the fallback, memoised for a minute.
    assert.equal(await gh.cachedGh('cold', 1000, 'fallback', failing), 'fallback')
    assert.equal(await gh.cachedGh('cold', 1000, 'fallback', loader), 'fallback')
    clock += 61_000
    const expected = `v${n + 1}`
    assert.equal(await gh.cachedGh('cold', 1000, 'fallback', loader), expected)
  } finally {
    Date.now = realNow
  }
})

test('loadGithubSummary: parts that miss the budget are null (the widget fetches them)', async () => {
  process.env.GITHUB_TOKEN = 'test-token'
  routes = {
    ...githubFor('me'),
    '/graphql': () =>
      json({
        data: {
          user: {
            contributionsCollection: {
              contributionCalendar: { totalContributions: 1, weeks: [{ contributionDays: [{ date: '2026-10-13', contributionCount: 1 }] }] },
            },
          },
        },
      }),
    // The events feed hangs past the budget.
    '/users/me/events/public': () => new Promise<Response>(() => {}),
  }
  const started = Date.now()
  const summary = await data.loadGithubSummary('me', { budgetMs: 300 })
  assert.ok(Date.now() - started < 2000)
  assert.ok(summary)
  assert.equal(summary.events, null)
  assert.equal(summary.topRepos?.available, true)
  assert.equal(summary.languages?.available, true)
  assert.equal(summary.contributions?.total, 1)
  assert.equal(summary.stats?.contributions, 1)
})

test('loadGithubSummary: no profile linked → honest empty state; invalid login → null', async () => {
  const summary = await data.loadGithubSummary()
  assert.deepEqual(summary, data.noProfileSummary())
  assert.equal(await data.loadGithubSummary('not a login'), null)
})
