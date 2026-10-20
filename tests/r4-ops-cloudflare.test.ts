import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CACHEABLE_EXACT_PATHS,
  CACHEABLE_PREFIXES,
  CloudflareError,
  applyConfig,
  createClient,
  desiredRules,
  main,
  mergeRules,
  settingsChanges,
} from '../scripts/cloudflare-config.mjs'

const HOST = 'lucian-dev.com'
const ZONE = 'zone1'

/** In-memory Cloudflare API covering the endpoints the script uses. */
function fakeCloudflare(opts: { rumForbidden?: boolean; wwwExists?: boolean; failPut?: boolean } = {}) {
  const settings: Record<string, string> = { always_use_https: 'off', email_obfuscation: 'on' }
  const entrypoints: Record<string, { rules: any[] } | undefined> = {
    http_request_cache_settings: {
      rules: [{ id: 'dash1', ref: 'dash1', expression: 'http.request.uri.path eq "/x"', action: 'set_cache_settings', action_parameters: { cache: true }, enabled: true, version: '3' }],
    },
  }
  const dns: any[] = opts.wwwExists ? [{ name: `www.${HOST}`, proxied: true }] : []
  const rumSites = [{ site_tag: 'site1', auto_install: true, ruleset: { zone_tag: ZONE } }]
  const writes: { method: string; path: string; body: any }[] = []
  let nextId = 1

  const ok = (result: unknown) => new Response(JSON.stringify({ success: true, errors: [], result }), { status: 200 })
  const fail = (status: number, code: number, message: string) =>
    new Response(JSON.stringify({ success: false, errors: [{ code, message }], result: null }), { status })

  const fetchFn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input))
    const p = url.pathname.replace('/client/v4', '')
    const method = init.method || 'GET'
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    if (method !== 'GET') writes.push({ method, path: p + url.search, body })

    let m: RegExpMatchArray | null
    if ((m = p.match(/^\/zones\/zone1\/settings\/(\w+)$/))) {
      if (method === 'PATCH') settings[m[1]] = body.value
      return ok({ id: m[1], value: settings[m[1]] })
    }
    if ((m = p.match(/^\/zones\/zone1\/rulesets\/phases\/(\w+)\/entrypoint$/))) {
      if (method === 'PUT') {
        if (opts.failPut) return fail(400, 20021, 'invalid rules')
        entrypoints[m[1]] = { rules: body.rules.map((r: any) => ({ id: r.id || `gen${nextId++}`, version: '1', ...r })) }
      }
      const e = entrypoints[m[1]]
      return e ? ok(e) : fail(404, 10003, 'not found')
    }
    if (p === '/zones/zone1/dns_records') {
      if (method === 'POST') dns.push({ ...body })
      return ok(method === 'POST' ? body : dns.filter((r) => r.name === url.searchParams.get('name')))
    }
    if (p === '/zones/zone1') return ok({ id: ZONE, account: { id: 'acc1' } })
    if (p.startsWith('/accounts/acc1/rum/')) {
      if (opts.rumForbidden) return fail(403, 10000, 'Authentication error')
      if (method === 'PUT') rumSites[0].auto_install = body.auto_install
      return ok(method === 'PUT' ? rumSites[0] : rumSites)
    }
    return fail(404, 7003, `no route ${method} ${p}`)
  }) as typeof fetch

  return { fetchFn, settings, entrypoints, dns, rumSites, writes }
}

const quiet = () => {}

test('desired rules: www redirect, host-scoped cache rules, admin bypass last', () => {
  const rules = desiredRules(HOST)
  const redirect = rules.http_request_dynamic_redirect[0]
  assert.equal(redirect.expression, '(http.host eq "www.lucian-dev.com")')
  assert.equal(redirect.action_parameters.from_value.status_code, 308)
  assert.equal(redirect.action_parameters.from_value.preserve_query_string, true)
  assert.equal(redirect.action_parameters.from_value.target_url.expression, 'concat("https://lucian-dev.com", http.request.uri.path)')

  const [eligible, bypass] = rules.http_request_cache_settings
  for (const p of ['"/cv/zh"', '"/colophon"', '"/feed.json"', '"/sitemap.xml"', '"/api/search-index"']) assert.ok(eligible.expression.includes(p), p)
  assert.ok(eligible.expression.includes('starts_with(http.request.uri.path, "/blog/")'))
  assert.ok(eligible.expression.includes('not http.cookie contains "cv_admin_token"'))
  assert.equal(eligible.action_parameters.edge_ttl?.mode, 'respect_origin')
  assert.equal(bypass.action_parameters.cache, false)
  for (const p of ['"/admin"', '"/api/admin"', '"/api/auth"']) assert.ok(bypass.expression.includes(p), p)

  const config = rules.http_config_settings[0]
  assert.deepEqual(config.action_parameters, { email_obfuscation: false, disable_rum: true })
})

test('OPS-3: every public ISR page is cache-eligible at the edge, the Chinese pages included — by exact path only', async () => {
  const { STATIC_CONTENT_PATHS } = await import('../lib/revalidate')
  const { ZH_PATHS } = await import('../lib/zhRoutes')
  const eligible = (p: string) => CACHEABLE_EXACT_PATHS.includes(p) || CACHEABLE_PREFIXES.some((prefix: string) => p.startsWith(prefix))
  for (const p of STATIC_CONTENT_PATHS) assert.ok(eligible(p), `${p} is cache-eligible`)
  for (const p of ZH_PATHS) assert.ok(desiredRules(HOST).http_request_cache_settings[0].expression.includes(JSON.stringify(p)), p)
  assert.equal(eligible('/zh/unknown'), false, 'no /zh/ prefix: unknown Chinese addresses stay uncached')
})

test('mergeRules keeps dashboard rules, reuses ids and is a no-op when nothing changed', () => {
  const desired = desiredRules(HOST).http_request_cache_settings
  const foreign = { id: 'f1', ref: 'mine', expression: 'true', action: 'set_cache_settings', action_parameters: { cache: true }, enabled: true }
  const first = mergeRules([foreign], desired)
  assert.deepEqual(first.changes.map((c: { op: string }) => c.op), ['add', 'add'])
  assert.equal(first.rules[0].id, 'f1')
  assert.equal(first.rules.at(-1).ref, 'lp_cache_bypass_admin')

  const stored = first.rules.map((r: any, i: number) => ({ id: r.id || `id${i}`, version: '2', logging: { enabled: true }, ...r }))
  const second = mergeRules(stored, desired)
  assert.deepEqual(second.changes, [])
  assert.deepEqual(
    second.rules.map((r: any) => r.id),
    stored.map((r: any) => r.id),
  )
  assert.equal('version' in second.rules[0], false)

  const edited = stored.map((r: any) => (r.ref === 'lp_cache_public' ? { ...r, expression: 'true' } : r))
  assert.deepEqual(mergeRules(edited, desired).changes, [{ op: 'update', ref: 'lp_cache_public' }])

  const obsolete = [...stored, { id: 'old', ref: 'lp_retired', expression: 'true', action: 'set_cache_settings', action_parameters: { cache: true } }]
  const pruned = mergeRules(obsolete, desired)
  assert.deepEqual(pruned.changes, [{ op: 'remove', ref: 'lp_retired' }])
  assert.equal(pruned.rules.some((r: any) => r.ref === 'lp_retired'), false)
})

test('settingsChanges lists only differing settings', () => {
  assert.deepEqual(settingsChanges({ always_use_https: 'on', email_obfuscation: 'off' }), [])
  assert.deepEqual(settingsChanges({ always_use_https: 'off', email_obfuscation: 'off' }), [{ id: 'always_use_https', from: 'off', to: 'on' }])
})

test('dry run reads everything and writes nothing', async () => {
  const api = fakeCloudflare()
  const report = await applyConfig({ cf: createClient({ token: 't', fetchFn: api.fetchFn }), zoneId: ZONE, host: HOST, dryRun: true, log: quiet })
  assert.deepEqual(api.writes, [])
  assert.ok(report.some((l: string) => l.includes('always_use_https: off → on')))
  assert.ok(report.some((l: string) => l.includes('+ DNS: proxied CNAME www.lucian-dev.com')))
})

test('apply configures the zone, then a second run changes nothing', async () => {
  const api = fakeCloudflare()
  const cf = createClient({ token: 't', fetchFn: api.fetchFn })
  await applyConfig({ cf, zoneId: ZONE, host: HOST, dryRun: false, log: quiet })
  assert.deepEqual(api.settings, { always_use_https: 'on', email_obfuscation: 'off' })
  assert.equal(api.entrypoints.http_request_cache_settings!.rules[0].id, 'dash1', 'dashboard rule kept first')
  assert.equal(api.entrypoints.http_request_cache_settings!.rules.length, 3)
  assert.equal(api.entrypoints.http_request_dynamic_redirect!.rules.length, 1)
  assert.equal(api.dns.length, 1)
  assert.equal(api.dns[0].proxied, true)
  assert.equal(api.rumSites[0].auto_install, false)

  const writesBefore = api.writes.length
  const report = await applyConfig({ cf, zoneId: ZONE, host: HOST, dryRun: false, log: quiet })
  assert.equal(api.writes.length, writesBefore, 'idempotent: no writes on the second run')
  assert.ok(report.every((l: string) => !/^[+~-] /.test(l)))
})

test('without the analytics permission the manual step is printed (not an error)', async () => {
  const api = fakeCloudflare({ rumForbidden: true, wwwExists: true })
  const report = await applyConfig({ cf: createClient({ token: 't', fetchFn: api.fetchFn }), zoneId: ZONE, host: HOST, dryRun: false, log: quiet })
  assert.ok(report.some((l: string) => l.includes('Manual step')))
})

test('API errors reject with the Cloudflare message; main exits non-zero', async () => {
  const api = fakeCloudflare({ failPut: true })
  await assert.rejects(
    applyConfig({ cf: createClient({ token: 't', fetchFn: api.fetchFn }), zoneId: ZONE, host: HOST, dryRun: false, log: quiet }),
    (err: unknown) => err instanceof CloudflareError && err.status === 400 && /invalid rules/.test(err.message),
  )
  const errors: unknown[] = []
  const original = console.error
  console.error = (...a: unknown[]) => errors.push(a)
  try {
    assert.equal(await main(['--dry-run'], {} as NodeJS.ProcessEnv), 1)
  } finally {
    console.error = original
  }
  assert.equal(errors.length, 1)
})
