/**
 * S2: the admin shell's pure parts (the "?" overlay catalog, the Analytics
 * tab) and GET /api/admin/overview through the real handler.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import { adminShortcutGroups, isHelpShortcut, tabShortcutIndex, tabShortcutLabel } from '../components/Admin/shell/shortcuts'
import { DASHBOARD_TABS, dashboardQuery, parseDashboardQuery } from '../components/Admin/shell/dashboardTabs'

const key = (over: Partial<Parameters<typeof isHelpShortcut>[0]>) => ({
  key: '?',
  code: 'Slash',
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: true,
  ...over,
})

test('"?" opens the overlay only outside text fields and without modifiers', () => {
  assert.equal(isHelpShortcut(key({}), false), true)
  assert.equal(isHelpShortcut(key({}), true), false)
  assert.equal(isHelpShortcut(key({ metaKey: true }), false), false)
  assert.equal(isHelpShortcut(key({ ctrlKey: true }), false), false)
  assert.equal(isHelpShortcut(key({ key: '/', shiftKey: false }), false), false)
})

test('Analytics is the sixth dashboard tab, reachable by URL and Alt/⌃+6', () => {
  assert.deepEqual([...DASHBOARD_TABS], ['home', 'cv', 'versions', 'storage', 'inbox', 'analytics'])
  assert.equal(parseDashboardQuery({ tab: 'analytics' }).tab, 'analytics')
  assert.deepEqual(dashboardQuery({ tab: 'cv', view: 'raw' }, 'analytics'), { tab: 'analytics' })
  const six = { key: '6', code: 'Digit6', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }
  assert.equal(tabShortcutIndex(six, DASHBOARD_TABS.length, { isMac: false, inEditable: false }), 5)
  assert.equal(tabShortcutLabel(true, DASHBOARD_TABS.length), '⌃1–6')
})

test('the overlay lists the real bindings with platform labels', () => {
  const mac = adminShortcutGroups(true, 6)
  const pc = adminShortcutGroups(false, 6)
  const flat = (g: ReturnType<typeof adminShortcutGroups>) => g.flatMap((x) => x.items.map((i) => `${i.keys.join('+')} ${i.label}`))
  assert.ok(flat(mac).includes('⌘+S Save the open editor'))
  assert.ok(flat(pc).includes('Ctrl+S Save the open editor'))
  assert.ok(flat(mac).includes('⌃+1–6 Switch dashboard tab'))
  assert.ok(flat(pc).includes('Alt+1–6 Switch dashboard tab'))
  assert.ok(flat(mac).includes('⌥+↑ / ↓ Move a bullet'))
  assert.ok(flat(pc).includes('↑ / ↓ Previous / next message'))
  assert.ok(flat(pc).includes('Ctrl+⇧+P Toggle Write / Preview'))
  assert.ok(flat(pc).includes('/ Insert a block (slash menu)'))
  assert.deepEqual(
    mac.map((g) => g.title),
    ['Everywhere in the admin', 'Dashboard', 'CV Studio', 'Inbox', 'Post & case study editor'],
  )
})

// ── GET /api/admin/overview ────────────────────────────────────────────────

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'CF_API_TOKEN', 'CF_ZONE_ID', 'INDEXNOW_KEY', 'TRUSTED_PROXY_IPS']) {
  delete process.env[k]
}
process.env.GITHUB_TOKEN = 'ghp_overviewtestsecretvalue'
process.env.JWT_SECRET = 'r4-adminshell-shell-secret'
const repoRoot = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-overview-'))
type Handler = (req: any, res: any) => unknown
let overview: Handler, cvdata: Handler
let closeDb: () => void
let putPage: typeof import('../lib/contentStore').putPage
let putItem: typeof import('../lib/contentStore').putItem

async function call(handler: Handler, opts: { method?: string; body?: any; admin?: boolean } = {}) {
  const token = jwt.sign({ role: 'admin', email: 'owner@example.test' }, 'r4-adminshell-shell-secret', { algorithm: 'HS256' })
  const admin = opts.admin !== false
  const req = {
    method: opts.method || 'GET',
    query: {},
    body: opts.body,
    cookies: admin ? { cv_admin_token: token } : {},
    headers: admin ? { cookie: `cv_admin_token=${token}` } : {},
    socket: { remoteAddress: '127.0.0.1' },
  }
  const out = { statusCode: 200, headers: {} as Record<string, string>, body: undefined as any }
  const res: any = {
    get statusCode() {
      return out.statusCode
    },
    set statusCode(c: number) {
      out.statusCode = c
    },
    status(c: number) {
      out.statusCode = c
      return res
    },
    setHeader(n: string, v: any) {
      out.headers[n.toLowerCase()] = String(v)
      return res
    },
    getHeader: (n: string) => out.headers[n.toLowerCase()],
    json(b: any) {
      out.body = JSON.parse(JSON.stringify(b))
      return res
    },
    send(b: any) {
      out.body = b
      return res
    },
    end(payload?: string) {
      if (typeof payload === 'string' && /json/.test(out.headers['content-type'] || '')) out.body = JSON.parse(payload)
      return res
    },
    async revalidate() {},
  }
  await handler(req, res)
  return out
}

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  overview = (await import('../pages/api/admin/overview')).default
  cvdata = (await import('../pages/api/cvdata')).default
  const store = await import('../lib/contentStore')
  putPage = store.putPage
  putItem = store.putItem
  closeDb = (await import('../lib/db')).closeDb
})

after(() => {
  closeDb()
  delete process.env.GITHUB_TOKEN
  process.chdir(repoRoot)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('overview requires an admin session and is never cached', async () => {
  assert.equal((await call(overview, { admin: false })).statusCode, 401)
  assert.equal((await call(overview, { method: 'POST' })).statusCode, 405)
  const r = await call(overview)
  assert.equal(r.statusCode, 200)
  assert.equal(r.headers['cache-control'], 'no-store')
})

test('overview reports real counts, env presence as booleans and the latest edits', async () => {
  await putItem('blog', 'hello', { title: 'Hello' }, 'Body')
  await putItem('blog', 'draft-post', { title: 'Draft', draft: true }, 'Body')
  await putItem('work', 'case', { title: 'Case' }, 'Body')
  await putPage('now', {}, 'What I am doing now.')
  await call(cvdata, { method: 'PUT', body: { en: [{ sessionName: 'extraSkill', points: ['English'] }], zh: [] } })

  const r = await call(overview)
  const o = r.body
  assert.deepEqual(o.posts, { published: 1, drafts: 1 })
  assert.deepEqual(o.work, { published: 1, drafts: 0 })
  assert.deepEqual(o.pages, { nowEmpty: false, usesEmpty: true })
  assert.deepEqual(o.inbox, { unread: 0, total: 0 })
  assert.deepEqual(o.r2, { configured: false, pending: 0 })
  assert.deepEqual(o.config, { smtp: false, githubToken: true, trustedProxy: false, cfApi: false, indexNow: false })
  assert.equal(JSON.stringify(o).includes('ghp_'), false, 'env values never leave the server')
  assert.equal(o.backup.lastAt, null)
  assert.equal(typeof o.backup.scheduled, 'boolean')
  assert.deepEqual(
    o.lastEdits.map((e: { kind: string; ref: string }) => `${e.kind}:${e.ref}`).sort(),
    ['cv:cvdata', 'page:now', 'post:draft-post', 'post:hello', 'work:case'],
  )
  for (let i = 1; i < o.lastEdits.length; i++) assert.ok(o.lastEdits[i - 1].updatedAt >= o.lastEdits[i].updatedAt)
})
