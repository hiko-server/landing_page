import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { evaluateAudit, parseAuditJsonl, validateAllowlist } from '../scripts/check-audit.mjs'

const advisoryLine = (o: { id: number; ghsa: string; module: string; severity: string; path: string; version?: string }) =>
  JSON.stringify({
    type: 'auditAdvisory',
    data: {
      resolution: { id: o.id, path: o.path },
      advisory: {
        id: o.id,
        github_advisory_id: o.ghsa,
        module_name: o.module,
        severity: o.severity,
        title: `${o.module} issue`,
        url: `https://github.com/advisories/${o.ghsa}`,
        vulnerable_versions: '<9',
        patched_versions: '>=9',
        findings: [{ version: o.version || '1.0.0' }],
      },
    },
  })

const SUMMARY = JSON.stringify({ type: 'auditSummary', data: { vulnerabilities: { high: 2 }, dependencies: 10 } })

const entry = (pkg: string, id: string, expires = '2026-12-31') => ({
  id,
  package: pkg,
  reason: 'Build-time only; never processes untrusted input.',
  reviewed: '2026-10-13',
  expires,
})

test('parseAuditJsonl dedupes per package + GHSA and keeps every path', () => {
  const text = [
    '{"type":"warning","data":"noise"}',
    advisoryLine({ id: 1, ghsa: 'GHSA-vfj7-8cjw-p6xm', module: 'braces', severity: 'high', path: 'a>braces' }),
    advisoryLine({ id: 1, ghsa: 'GHSA-vfj7-8cjw-p6xm', module: 'braces', severity: 'high', path: 'b>braces' }),
    advisoryLine({ id: 2, ghsa: 'GHSA-pxg6-pf52-xh8x', module: 'cookie', severity: 'low', path: 'c>cookie' }),
    'not json',
    SUMMARY,
  ].join('\n')
  const { advisories, summary } = parseAuditJsonl(text)
  assert.equal(advisories.length, 2)
  assert.deepEqual(advisories[0].paths, ['a>braces', 'b>braces'])
  assert.equal(summary.dependencies, 10)
  assert.equal(parseAuditJsonl('').summary, null)
})

test('unallowlisted high/critical advisories fail; moderate/low never block', () => {
  const { advisories } = parseAuditJsonl(
    [
      advisoryLine({ id: 1, ghsa: 'GHSA-vfj7-8cjw-p6xm', module: 'braces', severity: 'high', path: 'x' }),
      advisoryLine({ id: 3, ghsa: 'GHSA-2xp9-vwfh-vxw4', module: 'next', severity: 'critical', path: 'next' }),
      advisoryLine({ id: 4, ghsa: 'GHSA-qx2v-qp2m-jg93', module: 'postcss', severity: 'moderate', path: 'next>postcss' }),
    ].join('\n'),
  )
  const verdict = evaluateAudit({ advisories, allowlist: [entry('braces', 'GHSA-vfj7-8cjw-p6xm')], today: '2026-10-13' })
  assert.equal(verdict.ok, false)
  assert.deepEqual(
    verdict.unallowed.map((a: { package: string }) => a.package),
    ['next'],
  )
  assert.equal(verdict.allowed.length, 1)

  const allAllowed = evaluateAudit({
    advisories,
    allowlist: [entry('braces', 'GHSA-vfj7-8cjw-p6xm'), entry('next', 'GHSA-2xp9-vwfh-vxw4')],
    today: '2026-10-13',
  })
  assert.equal(allAllowed.ok, true)
})

test('the id must match the package (no cross-package allowlisting)', () => {
  const { advisories } = parseAuditJsonl(advisoryLine({ id: 1, ghsa: 'GHSA-vfj7-8cjw-p6xm', module: 'braces', severity: 'high', path: 'x' }))
  assert.equal(evaluateAudit({ advisories, allowlist: [entry('micromatch', 'GHSA-vfj7-8cjw-p6xm')], today: '2026-10-13' }).ok, false)
})

test('expired entries fail even when the advisory is gone; unused entries are stale', () => {
  const advisories = parseAuditJsonl(advisoryLine({ id: 1, ghsa: 'GHSA-vfj7-8cjw-p6xm', module: 'braces', severity: 'high', path: 'x' })).advisories
  const lastDay = evaluateAudit({ advisories, allowlist: [entry('braces', 'GHSA-vfj7-8cjw-p6xm', '2026-12-31')], today: '2026-12-31' })
  assert.equal(lastDay.ok, true, 'valid through the expiry day')
  const after = evaluateAudit({ advisories, allowlist: [entry('braces', 'GHSA-vfj7-8cjw-p6xm', '2026-12-31')], today: '2027-01-01' })
  assert.equal(after.ok, false)
  assert.equal(after.expired.length, 1)

  const gone = evaluateAudit({ advisories: [], allowlist: [entry('braces', 'GHSA-vfj7-8cjw-p6xm', '2026-01-01')], today: '2026-10-13' })
  assert.equal(gone.ok, false)
  const stale = evaluateAudit({ advisories: [], allowlist: [entry('braces', 'GHSA-vfj7-8cjw-p6xm')], today: '2026-10-13' })
  assert.equal(stale.ok, true)
  assert.equal(stale.stale.length, 1)
})

test('allowlist validation', () => {
  assert.deepEqual(validateAllowlist([entry('braces', 'GHSA-vfj7-8cjw-p6xm')]), [])
  assert.ok(validateAllowlist({}).length > 0)
  assert.ok(validateAllowlist([{ ...entry('braces', 'GHSA-vfj7-8cjw-p6xm'), expires: '31/12/2026' }]).some((p: string) => p.includes('expires')))
  assert.ok(validateAllowlist([{ ...entry('braces', 'GHSA-vfj7-8cjw-p6xm'), reason: 'ok' }]).some((p: string) => p.includes('reason')))
  assert.ok(validateAllowlist([{ ...entry('braces', 'not-an-id') }]).some((p: string) => p.includes('GHSA')))
  assert.ok(
    validateAllowlist([entry('braces', 'GHSA-vfj7-8cjw-p6xm'), entry('braces', 'GHSA-vfj7-8cjw-p6xm')]).some((p: string) => p.includes('duplicate')),
  )
})

test('the committed allowlist is well-formed and never covers next itself', () => {
  const file = path.join(process.cwd(), 'security', 'audit-allowlist.json')
  const list = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.deepEqual(validateAllowlist(list), [])
  assert.ok(list.length > 0)
  for (const e of list) assert.notEqual(e.package, 'next', 'no Next.js advisory may be allowlisted')
})
