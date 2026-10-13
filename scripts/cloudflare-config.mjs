#!/usr/bin/env node
/**
 * Versioned Cloudflare zone configuration for the public site.
 *
 * Applies, idempotently:
 *   - zone settings: Always Use HTTPS on, Email Address Obfuscation off
 *     (its rewritten markup caused React hydration errors on /cv);
 *   - http_config_settings: for the site host, email obfuscation off and
 *     Web Analytics (RUM) injection off (belt and braces for the above);
 *   - http_request_dynamic_redirect: www.<host> → https://<host><path>, 308,
 *     query string preserved;
 *   - http_request_cache_settings: HTML and cacheable API responses of the
 *     public routes become cache-eligible with the edge TTL taken from the
 *     origin's Cache-Control (ISR pages send s-maxage; server-rendered pages
 *     send no-store and stay uncached), and everything admin / auth or
 *     carrying the admin session cookie bypasses the cache;
 *   - a proxied `www` CNAME → <host> when the record is missing;
 *   - Web Analytics automatic setup off through the account RUM API when the
 *     token may do that; otherwise it prints the manual dashboard step.
 *
 * Rules this script manages are tagged with a `ref` starting with `lp_`. Rules
 * someone added in the dashboard are kept untouched (managed rules are placed
 * after them, so in the cache phase — where later rules win — the admin
 * bypass always has the last word). Each phase entrypoint is read first and
 * the full rule list is written back only when something differs.
 *
 * Env: CF_API_TOKEN (Zone Settings:Edit, Config Rules:Edit, Cache Rules:Edit,
 *      Dynamic Redirect:Edit, DNS:Edit; optionally Account Analytics:Edit)
 *      CF_ZONE_ID
 *      CF_SITE_HOST (optional, default: host of NEXT_PUBLIC_SITE_HOST /
 *      SITE_URL, else lucian-dev.com)
 *
 * Usage: node --env-file=.env scripts/cloudflare-config.mjs [--dry-run] [--host lucian-dev.com]
 * Prints a summary of every change; exits 1 on any API error.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const API = 'https://api.cloudflare.com/client/v4'
export const REF_PREFIX = 'lp_'

/** Public routes whose responses may be cached at the edge (TTL from the origin). */
export const CACHEABLE_EXACT_PATHS = [
  '/',
  '/about',
  '/contact',
  '/cv',
  '/cv/zh',
  '/blog',
  '/work',
  '/now',
  '/uses',
  '/colophon',
  '/publications',
  '/api/og',
  '/api/stack',
  '/api/search-index',
  '/feed.xml',
  '/feed.json',
  '/sitemap.xml',
]
export const CACHEABLE_PREFIXES = ['/blog/', '/work/', '/api/github/']
export const BYPASS_PREFIXES = ['/admin', '/api/admin', '/api/auth']
export const ADMIN_COOKIE = 'cv_admin_token'

export const ZONE_SETTINGS = { always_use_https: 'on', email_obfuscation: 'off' }

const q = (s) => JSON.stringify(s)

/** The rules this script owns, per phase, for `host`. */
export function desiredRules(host) {
  const exact = CACHEABLE_EXACT_PATHS.map(q).join(' ')
  const prefixes = CACHEABLE_PREFIXES.map((p) => `starts_with(http.request.uri.path, ${q(p)})`).join(' or ')
  const bypass = BYPASS_PREFIXES.map((p) => `starts_with(http.request.uri.path, ${q(p)})`).join(' or ')
  return {
    http_config_settings: [
      {
        ref: `${REF_PREFIX}site_config`,
        description: 'Site host: email obfuscation off (hydration-safe HTML), Web Analytics injection off',
        expression: `(http.host eq ${q(host)})`,
        action: 'set_config',
        action_parameters: { email_obfuscation: false, disable_rum: true },
        enabled: true,
      },
    ],
    http_request_dynamic_redirect: [
      {
        ref: `${REF_PREFIX}www_to_apex`,
        description: `www.${host} → https://${host} (308, query preserved)`,
        expression: `(http.host eq ${q(`www.${host}`)})`,
        action: 'redirect',
        action_parameters: {
          from_value: {
            status_code: 308,
            target_url: { expression: `concat(${q(`https://${host}`)}, http.request.uri.path)` },
            preserve_query_string: true,
          },
        },
        enabled: true,
      },
    ],
    http_request_cache_settings: [
      {
        ref: `${REF_PREFIX}cache_public`,
        description: 'Public pages and cacheable APIs: eligible, edge TTL from origin Cache-Control (default key incl. query string)',
        expression: `(http.host eq ${q(host)}) and (http.request.uri.path in {${exact}} or ${prefixes}) and not http.cookie contains ${q(ADMIN_COOKIE)}`,
        action: 'set_cache_settings',
        action_parameters: {
          cache: true,
          edge_ttl: { mode: 'respect_origin' },
          browser_ttl: { mode: 'respect_origin' },
        },
        enabled: true,
      },
      {
        ref: `${REF_PREFIX}cache_bypass_admin`,
        description: 'Admin, auth and admin-session requests are never cached (last rule: wins over any earlier match)',
        expression: `${bypass} or http.cookie contains ${q(ADMIN_COOKIE)}`,
        action: 'set_cache_settings',
        action_parameters: { cache: false },
        enabled: true,
      },
    ],
  }
}

/** JSON with sorted keys, so semantically equal rules compare equal. */
export function canonical(value) {
  const norm = (v) => {
    if (Array.isArray(v)) return v.map(norm)
    if (v && typeof v === 'object') {
      const out = {}
      for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = norm(v[k])
      return out
    }
    return v
  }
  return JSON.stringify(norm(value))
}

const RULE_FIELDS = ['id', 'ref', 'description', 'expression', 'action', 'action_parameters', 'enabled', 'logging']

/** The writable fields of a rule as returned by the API. */
export function writableRule(rule) {
  const out = {}
  for (const k of RULE_FIELDS) if (rule[k] !== undefined) out[k] = rule[k]
  return out
}

// Server-assigned fields (id, logging defaults) never count as a difference.
const comparable = (r) => canonical({ ...writableRule(r), id: undefined, logging: undefined, enabled: r.enabled !== false })

/**
 * Merge the managed rules into the entrypoint's current rules. Foreign rules
 * (no `lp_` ref) keep their position and content; managed rules follow them in
 * the desired order, reusing the existing rule id when the ref matches.
 */
export function mergeRules(existing, desired) {
  const current = (existing || []).map(writableRule)
  const foreign = current.filter((r) => !String(r.ref || '').startsWith(REF_PREFIX))
  const managed = new Map(current.filter((r) => String(r.ref || '').startsWith(REF_PREFIX)).map((r) => [r.ref, r]))
  const changes = []
  const next = desired.map((rule) => {
    const old = managed.get(rule.ref)
    managed.delete(rule.ref)
    if (!old) changes.push({ op: 'add', ref: rule.ref })
    else if (comparable(old) !== comparable(rule)) changes.push({ op: 'update', ref: rule.ref })
    return old?.id ? { id: old.id, ...rule } : { ...rule }
  })
  for (const ref of managed.keys()) changes.push({ op: 'remove', ref })
  const rules = [...foreign, ...next]
  // Reordering alone (e.g. a foreign rule was appended after ours) is a change too.
  const orderChanged =
    !changes.length && canonical(current.map((r) => r.id || r.ref)) !== canonical(rules.map((r) => r.id || r.ref))
  if (orderChanged) changes.push({ op: 'reorder', ref: '(managed rules moved after dashboard rules)' })
  return { rules, changes, foreign: foreign.length }
}

/** Zone settings that differ from ZONE_SETTINGS, given `current` {id: value}. */
export function settingsChanges(current) {
  return Object.entries(ZONE_SETTINGS)
    .filter(([id, value]) => current[id] !== value)
    .map(([id, value]) => ({ id, from: current[id] ?? '(unknown)', to: value }))
}

export class CloudflareError extends Error {
  constructor(message, status, errors) {
    super(message)
    this.name = 'CloudflareError'
    this.status = status
    this.errors = errors || []
  }
}

export function createClient({ token, fetchFn = fetch }) {
  return async function cf(method, apiPath, body) {
    const res = await fetchFn(`${API}${apiPath}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json || json.success === false) {
      const errors = json?.errors || []
      const detail = errors.map((e) => `${e.code}: ${e.message}`).join('; ') || res.statusText
      throw new CloudflareError(`${method} ${apiPath} → ${res.status} ${detail}`, res.status, errors)
    }
    return json.result
  }
}

function hostDefault(env) {
  const raw = env.CF_SITE_HOST || env.NEXT_PUBLIC_SITE_HOST || env.SITE_URL || ''
  try {
    const host = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`).hostname
    if (host && host !== 'localhost' && !/^127\./.test(host)) return host.toLowerCase()
  } catch {
    /* fall through */
  }
  return 'lucian-dev.com'
}

async function getEntrypoint(cf, zoneId, phase) {
  try {
    return await cf('GET', `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`)
  } catch (err) {
    if (err instanceof CloudflareError && err.status === 404) return null
    throw err
  }
}

/** Apply (or with dryRun, only report) the configuration. Returns the change log. */
export async function applyConfig({ cf, zoneId, host, dryRun, log = console.log }) {
  const report = []
  const note = (line) => {
    report.push(line)
    log(line)
  }
  const mode = dryRun ? '[dry-run] ' : ''

  // 1. Zone settings.
  const current = {}
  for (const id of Object.keys(ZONE_SETTINGS)) {
    current[id] = (await cf('GET', `/zones/${zoneId}/settings/${id}`))?.value
  }
  const settingDiff = settingsChanges(current)
  if (!settingDiff.length) note('= zone settings: always_use_https on, email_obfuscation off')
  for (const { id, from, to } of settingDiff) {
    note(`${mode}~ zone setting ${id}: ${from} → ${to}`)
    if (!dryRun) await cf('PATCH', `/zones/${zoneId}/settings/${id}`, { value: to })
  }

  // 2. Phase entrypoints.
  for (const [phase, desired] of Object.entries(desiredRules(host))) {
    const entry = await getEntrypoint(cf, zoneId, phase)
    const { rules, changes, foreign } = mergeRules(entry?.rules || [], desired)
    if (!changes.length) {
      note(`= ${phase}: ${desired.length} managed rule(s) up to date${foreign ? `, ${foreign} dashboard rule(s) kept` : ''}`)
      continue
    }
    for (const c of changes) note(`${mode}${c.op === 'add' ? '+' : c.op === 'remove' ? '-' : '~'} ${phase}: ${c.op} ${c.ref}`)
    if (foreign) note(`  ${phase}: ${foreign} dashboard rule(s) kept as they are`)
    if (!dryRun) await cf('PUT', `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`, { rules })
  }

  // 3. www record (the redirect rule only fires for proxied traffic).
  const wwwName = `www.${host}`
  const records = await cf('GET', `/zones/${zoneId}/dns_records?name=${encodeURIComponent(wwwName)}`)
  if (!records?.length) {
    note(`${mode}+ DNS: proxied CNAME ${wwwName} → ${host}`)
    if (!dryRun) {
      await cf('POST', `/zones/${zoneId}/dns_records`, {
        type: 'CNAME',
        name: wwwName,
        content: host,
        proxied: true,
        ttl: 1,
        comment: 'Redirected to the apex by the lp_www_to_apex rule (scripts/cloudflare-config.mjs)',
      })
    }
  } else if (!records.some((r) => r.proxied)) {
    note(`! DNS: ${wwwName} exists but is not proxied — the www redirect cannot run. Enable the orange cloud on it.`)
  } else {
    note(`= DNS: ${wwwName} is proxied`)
  }

  // 4. Web Analytics automatic setup (account scope; optional permission).
  const manual = `  Manual step: Cloudflare dashboard → Analytics & Logs → Web Analytics → ${host} → Manage site → turn automatic setup off. (The lp_site_config rule already disables injection on ${host}.)`
  try {
    const zone = await cf('GET', `/zones/${zoneId}`)
    const accountId = zone?.account?.id
    if (!accountId) throw new CloudflareError('zone has no account id', 0)
    const sites = (await cf('GET', `/accounts/${accountId}/rum/site_info/list?per_page=100`)) || []
    const mine = sites.filter((s) => s?.ruleset?.zone_tag === zoneId || s?.host === host)
    const auto = mine.filter((s) => s.auto_install)
    if (!auto.length) note(`= Web Analytics: no automatic setup on ${host}`)
    for (const site of auto) {
      note(`${mode}~ Web Analytics ${site.site_tag}: automatic setup → off`)
      if (!dryRun) await cf('PUT', `/accounts/${accountId}/rum/site_info/${site.site_tag}`, { auto_install: false, zone_tag: zoneId })
    }
  } catch (err) {
    note(`! Web Analytics: could not be checked through the API (${err.message}).`)
    note(manual)
  }
  return report
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const dryRun = argv.includes('--dry-run')
  const hostIdx = argv.indexOf('--host')
  const host = (hostIdx >= 0 ? argv[hostIdx + 1] : hostDefault(env)).toLowerCase()
  const token = (env.CF_API_TOKEN || '').trim()
  const zoneId = (env.CF_ZONE_ID || '').trim()
  if (!token || !zoneId) {
    console.error('[cloudflare] CF_API_TOKEN and CF_ZONE_ID are required (see README → Cloudflare).')
    return 1
  }
  console.log(`[cloudflare] ${dryRun ? 'dry run for' : 'configuring'} ${host} (zone ${zoneId})`)
  try {
    await applyConfig({ cf: createClient({ token }), zoneId, host, dryRun })
    console.log(dryRun ? '[cloudflare] dry run complete — nothing was changed' : '[cloudflare] done')
    return 0
  } catch (err) {
    console.error(`[cloudflare] FAILED: ${err.message}`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main()
}
