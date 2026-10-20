#!/usr/bin/env node
/**
 * Blocking dependency-audit gate (`yarn audit:deps`, README → Quality gates).
 *
 * Runs `yarn audit --groups dependencies --json` (production dependencies
 * only) and fails when
 *   - any high or critical advisory is not allowlisted in
 *     security/audit-allowlist.json (matched by package + GHSA id),
 *   - an allowlist entry has expired (`expires` is before today, UTC), or
 *   - an allowlist entry is malformed, or the audit produced no summary
 *     (registry unreachable): a gate that cannot see must not pass.
 * Allowlist entries that no longer match any advisory are reported as stale
 * so they get removed, without failing the run.
 *
 * Usage:
 *   node scripts/check-audit.mjs [--report audit-report.json]
 *                                [--allowlist security/audit-allowlist.json]
 *                                [--input saved-audit.jsonl]
 *
 * --input evaluates a saved `yarn audit --json` output instead of running
 * yarn. --report writes every advisory (all severities) plus the verdict as
 * JSON, which CI keeps as a build artifact.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

export const BLOCKING_SEVERITIES = new Set(['high', 'critical'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const GHSA_RE = /^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/

/**
 * Parse `yarn audit --json` output (one JSON object per line) into unique
 * advisories (one per package + advisory id, with every dependency path).
 */
export function parseAuditJsonl(text) {
  const byKey = new Map()
  let summary = null
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    let entry
    try {
      entry = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (entry.type === 'auditSummary') summary = entry.data
    if (entry.type !== 'auditAdvisory') continue
    const adv = entry.data?.advisory
    if (!adv) continue
    const id = adv.github_advisory_id || String(adv.id)
    const key = `${adv.module_name}|${id}`
    const found = byKey.get(key)
    const depPath = entry.data?.resolution?.path
    if (found) {
      if (depPath && !found.paths.includes(depPath)) found.paths.push(depPath)
      continue
    }
    byKey.set(key, {
      id,
      npmId: adv.id,
      package: adv.module_name,
      severity: String(adv.severity || '').toLowerCase(),
      title: adv.title,
      url: adv.url,
      vulnerableVersions: adv.vulnerable_versions,
      patchedVersions: adv.patched_versions,
      versions: Array.from(new Set((adv.findings || []).map((f) => f.version))),
      paths: depPath ? [depPath] : [],
    })
  }
  return { advisories: Array.from(byKey.values()), summary }
}

/** Problems with the allowlist file itself (empty array when valid). */
export function validateAllowlist(entries) {
  if (!Array.isArray(entries)) return ['the allowlist must be a JSON array']
  const problems = []
  const seen = new Set()
  entries.forEach((e, i) => {
    const at = `entry ${i}${e && e.package ? ` (${e.package} ${e.id})` : ''}`
    if (!e || typeof e !== 'object') return problems.push(`${at}: not an object`)
    if (typeof e.id !== 'string' || !(GHSA_RE.test(e.id) || /^\d+$/.test(e.id))) problems.push(`${at}: id must be a GHSA id`)
    if (typeof e.package !== 'string' || !e.package.trim()) problems.push(`${at}: package is required`)
    if (typeof e.reason !== 'string' || e.reason.trim().length < 20) problems.push(`${at}: reason must explain why it is not exploitable`)
    for (const k of ['reviewed', 'expires']) {
      if (typeof e[k] !== 'string' || !DATE_RE.test(e[k]) || Number.isNaN(Date.parse(`${e[k]}T00:00:00Z`))) {
        problems.push(`${at}: ${k} must be YYYY-MM-DD`)
      }
    }
    const key = `${e.package}|${e.id}`
    if (seen.has(key)) problems.push(`${at}: duplicate entry`)
    seen.add(key)
  })
  return problems
}

/**
 * Decide the gate. `today` is a YYYY-MM-DD string (UTC); an entry is valid
 * through its `expires` day.
 */
export function evaluateAudit({ advisories, allowlist, today }) {
  const blocking = advisories.filter((a) => BLOCKING_SEVERITIES.has(a.severity))
  const keyOf = (pkg, id) => `${pkg}|${id}`
  const entries = new Map(allowlist.map((e) => [keyOf(e.package, e.id), e]))
  const expired = allowlist.filter((e) => e.expires < today)
  const unallowed = []
  const allowed = []
  for (const a of blocking) {
    const entry = entries.get(keyOf(a.package, a.id)) || entries.get(keyOf(a.package, String(a.npmId)))
    if (entry) allowed.push({ advisory: a, entry })
    else unallowed.push(a)
  }
  const used = new Set(allowed.map(({ entry }) => keyOf(entry.package, entry.id)))
  const stale = allowlist.filter((e) => !used.has(keyOf(e.package, e.id)))
  return { ok: unallowed.length === 0 && expired.length === 0, blocking, unallowed, allowed, expired, stale }
}

function argValue(argv, name) {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

function runYarnAudit() {
  const res = spawnSync('yarn', ['audit', '--groups', 'dependencies', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  })
  if (res.error) throw res.error
  // yarn audit exits non-zero whenever it finds anything; the verdict is ours.
  return res.stdout || ''
}

export function main(argv = process.argv.slice(2), now = new Date()) {
  const allowlistPath = path.resolve(repoRoot, argValue(argv, '--allowlist') || 'security/audit-allowlist.json')
  const inputPath = argValue(argv, '--input')
  const reportPath = argValue(argv, '--report')
  const today = now.toISOString().slice(0, 10)

  let allowlist
  try {
    allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'))
  } catch (err) {
    console.error(`[audit] cannot read ${path.relative(repoRoot, allowlistPath)}: ${err.message}`)
    return 1
  }
  const problems = validateAllowlist(allowlist)
  if (problems.length) {
    for (const p of problems) console.error(`[audit] allowlist: ${p}`)
    return 1
  }

  const raw = inputPath ? fs.readFileSync(path.resolve(inputPath), 'utf8') : runYarnAudit()
  const { advisories, summary } = parseAuditJsonl(raw)
  if (!summary) {
    console.error('[audit] yarn audit produced no summary (registry unreachable?) — failing closed.')
    return 1
  }
  const verdict = evaluateAudit({ advisories, allowlist, today })

  if (reportPath) {
    const report = {
      generatedAt: now.toISOString(),
      scope: 'dependencies',
      summary,
      ok: verdict.ok,
      unallowed: verdict.unallowed,
      expired: verdict.expired,
      stale: verdict.stale,
      allowlisted: verdict.allowed.map(({ advisory, entry }) => ({ ...advisory, reason: entry.reason, expires: entry.expires })),
      advisories,
    }
    fs.writeFileSync(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`)
  }

  const counts = summary.vulnerabilities || {}
  console.log(
    `[audit] production dependencies: ${summary.dependencies ?? '?'} · critical ${counts.critical ?? 0} · high ${counts.high ?? 0} · moderate ${counts.moderate ?? 0} · low ${counts.low ?? 0}`,
  )
  for (const { advisory, entry } of verdict.allowed) {
    console.log(`[audit] allowlisted until ${entry.expires}: ${advisory.severity} ${advisory.package} ${advisory.id} — ${advisory.title}`)
  }
  for (const e of verdict.stale) {
    console.warn(`[audit] stale allowlist entry (no longer reported, remove it): ${e.package} ${e.id}`)
  }
  for (const e of verdict.expired) {
    console.error(`[audit] EXPIRED allowlist entry (${e.expires}): ${e.package} ${e.id} — re-review or upgrade`)
  }
  for (const a of verdict.unallowed) {
    console.error(`[audit] NOT ALLOWLISTED: ${a.severity} ${a.package}@${a.versions.join(',')} ${a.id} — ${a.title}`)
    console.error(`        ${a.url}`)
    for (const p of a.paths.slice(0, 3)) console.error(`        via ${p}`)
  }
  console.log(verdict.ok ? '[audit] passed' : '[audit] FAILED')
  return verdict.ok ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main()
}
