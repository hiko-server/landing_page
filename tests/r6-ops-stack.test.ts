/**
 * FIX-26: /colophon, /uses and /api/stack show the INSTALLED versions (not
 * the floors of package.json's semver ranges), and the hosting / CSP
 * descriptions match what the deployment really does. (Sentry used to be
 * listed when a DSN was configured; the integration was removed.)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { STACK_PACKAGES, buildStack, installedVersions, pinnedVersion } from '../lib/stack'

const ROOT = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const PKG = { dependencies: { react: '^18.2.0', '@chakra-ui/react': '^2.8.2', '@sentry/nextjs': '^8', jose: '^4.15.9', nodemailer: '10.0.12' }, devDependencies: { typescript: '^5.3.3' } }

const find = (stack: ReturnType<typeof buildStack>, label: string) => stack.groups.find((g) => g.label === label)

test('versions are the installed ones; a bare range never shows its floor', () => {
  const stack = buildStack(PKG, '22.23.3', { installed: { react: '18.3.1', '@chakra-ui/react': '2.10.9', typescript: '5.9.3' } })
  assert.deepEqual(find(stack, 'Framework')?.items, [
    { name: 'React', version: '18.3' },
    { name: 'TypeScript', version: '5.9' },
  ])
  assert.deepEqual(find(stack, 'Interface')?.items, [{ name: 'Chakra UI', version: '2.10' }])
  // Unknown install: an exact pin is still the truth, a range is not.
  const bare = buildStack(PKG, '22.23.3')
  assert.deepEqual(find(bare, 'Framework')?.items, [{ name: 'React' }, { name: 'TypeScript' }])
  assert.deepEqual(find(bare, 'Platform')?.items.find((i) => i.name === 'Nodemailer'), { name: 'Nodemailer', version: '10.0' })
  assert.equal(pinnedVersion('15.5.27'), '15.5')
  for (const range of ['^18.2.0', '~5.4.5', '>=1.0.0', 'latest', '', undefined]) assert.equal(pinnedVersion(range), undefined, String(range))
})

test('Sentry is never listed (the integration was removed); Platform is auth and mail', () => {
  // PKG still names @sentry/nextjs: even a package.json that has it lists nothing for it.
  const platform = find(buildStack(PKG, '22.0.0', { installed: { '@sentry/nextjs': '8.55.0' } }), 'Platform')
  assert.deepEqual(platform?.items.map((i) => i.name), ['JOSE (JWT)', 'Nodemailer'])
  assert.equal(platform?.hint, 'Auth and mail')
  assert.ok(!STACK_PACKAGES.some((name) => name.startsWith('@sentry/')))
})

test('OPS-1: the stack list and the static /colophon read no runtime Sentry DSN', () => {
  for (const f of ['lib/stack.ts', 'pages/colophon.tsx', 'pages/uses.tsx', 'pages/api/stack.ts']) {
    if (!fs.existsSync(path.join(ROOT, f))) continue
    assert.doesNotMatch(read(f), /SENTRY_DSN|@sentry\//, f)
  }
  // The same stack whatever the environment says.
  const saved = { a: process.env.SENTRY_DSN, b: process.env.NEXT_PUBLIC_SENTRY_DSN }
  try {
    const without = buildStack(PKG, '22.0.0')
    process.env.SENTRY_DSN = 'https://key@o0.ingest.sentry.io/0'
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://key@o0.ingest.sentry.io/0'
    assert.deepEqual(buildStack(PKG, '22.0.0'), without)
  } finally {
    if (saved.a === undefined) delete process.env.SENTRY_DSN
    else process.env.SENTRY_DSN = saved.a
    if (saved.b === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN
    else process.env.NEXT_PUBLIC_SENTRY_DSN = saved.b
  }
})

test('installedVersions prefers the build snapshot, falls back to node_modules, and never throws', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r6-stack-'))
  try {
    fs.mkdirSync(path.join(tmp, 'node_modules', '@scope', 'pkg'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'node_modules', '@scope', 'pkg', 'package.json'), JSON.stringify({ version: '3.4.5' }))
    fs.mkdirSync(path.join(tmp, 'node_modules', 'broken'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'node_modules', 'broken', 'package.json'), '{nope')
    const names = ['@scope/pkg', 'react', 'missing', 'broken', '../escape']
    assert.deepEqual(installedVersions(names, JSON.stringify({ react: '18.3.1', '@scope/pkg': 'not-a-version' }), tmp), { react: '18.3.1', '@scope/pkg': '3.4.5' })
    assert.deepEqual(installedVersions(names, 'not json', tmp), { '@scope/pkg': '3.4.5' })
    assert.deepEqual(installedVersions(names, undefined, path.join(tmp, 'nowhere')), {})
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  // In this checkout the real installed versions are found for the listed packages.
  const real = installedVersions(STACK_PACKAGES, undefined, ROOT)
  assert.equal(real.react, JSON.parse(read('node_modules/react/package.json')).version)
  assert.equal(real.typescript, JSON.parse(read('node_modules/typescript/package.json')).version)
})

test('next.config inlines the installed versions of the direct dependencies at build time', () => {
  const out = execFileSync(
    process.execPath,
    ['-e', "process.stdout.write(require('./next.config.js').env.STACK_INSTALLED_VERSIONS)"],
    { cwd: ROOT, env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production' }, encoding: 'utf8' },
  )
  const snapshot = JSON.parse(out) as Record<string, string>
  assert.equal(snapshot.next, JSON.parse(read('node_modules/next/package.json')).version)
  assert.equal(snapshot.typescript, JSON.parse(read('node_modules/typescript/package.json')).version)
  assert.ok(STACK_PACKAGES.every((name) => typeof snapshot[name] === 'string'), 'every listed package has a snapshot version')
})

test('the hosting and CSP descriptions are accurate', () => {
  const colophon = read('pages/colophon.tsx')
  assert.doesNotMatch(colophon, /opens no inbound/)
  assert.match(colophon, /container publishes no public port: it is reached only through a\s+Cloudflare Tunnel/)
  const security = read('SECURITY.md')
  assert.doesNotMatch(security, /`script-src` includes\s+`'unsafe-eval'`/)
  assert.match(security, /does \*\*not\*\*\s+include `'unsafe-eval'` in production/)
})
