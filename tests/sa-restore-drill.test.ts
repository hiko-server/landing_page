/**
 * I5 — automated restore drills (lib/restoreDrill.ts) on top of the
 * snapshot pipeline (lib/backup.ts, whose manifest now records per-file
 * SHA-256, row counts and the schema version), plus the internal-job channel
 * the schedule uses (lib/internalJobs.ts). Runs in a throw-away working
 * directory without R2.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'])
  delete process.env[k]

const prevCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-drill-'))
let drill: typeof import('../lib/restoreDrill')
let backup: typeof import('../lib/backup')
let db: typeof import('../lib/db')
let analyticsDb: typeof import('../lib/analytics/db')
let jobs: typeof import('../lib/internalJobs')

const compileOk = async () => ({})

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true })
  fs.writeFileSync(
    path.join(tmp, 'public', 'uploads', 'cover.png'),
    Buffer.from('89504e470d0a1a0a', 'hex')
  )
  drill = await import('../lib/restoreDrill')
  backup = await import('../lib/backup')
  db = await import('../lib/db')
  analyticsDb = await import('../lib/analytics/db')
  jobs = await import('../lib/internalJobs')
  const d = db.getDb()
  const now = Date.now()
  d.prepare(
    `INSERT INTO pages (name, frontmatter, body, updated_at) VALUES ('now', '{}', 'Now body', ?)`
  ).run(now)
  d.prepare(
    `INSERT INTO collection_items (collection, slug, frontmatter, body, updated_at) VALUES ('blog', 'hello', '{"title":"Hello"}', '# Hello', ?)`
  ).run(now)
  d.prepare(
    `INSERT INTO collection_items (collection, slug, frontmatter, body, updated_at) VALUES ('blog', 'draft', '{"title":"D","draft":true}', 'draft body', ?)`
  ).run(now - 1)
  d.prepare(`INSERT INTO kv (key, value, updated_at) VALUES ('home', '{}', ?)`).run(now)
})
after(() => {
  db.closeDb()
  analyticsDb.closeAnalyticsDb()
  process.chdir(prevCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('with no snapshot yet the drill is recorded as skipped', async () => {
  const r = await drill.runRestoreDrill('manual', compileOk)
  assert.equal(r.status, 'skipped')
  assert.equal(drill.latestRestoreDrill()?.status, 'skipped')
  assert.equal(drill.latestRanDrill(), null)
})

test('a snapshot manifest records per-file SHA-256, row counts and the schema version', async () => {
  const snap = await backup.createSnapshot({ reason: 'manual' })
  assert.deepEqual(snap.manifest.counts, { pages: 1, collection_items: 2, kv: 1 })
  assert.equal(snap.manifest.schemaVersion, 1)
  assert.ok(snap.manifest.files.length >= 2)
  for (const f of snap.manifest.files) assert.match(f.sha256 || '', /^[0-9a-f]{64}$/, f.path)
})

test('the drill restores the newest snapshot into a scratch folder and every check passes', async () => {
  let compiled = ''
  const r = await drill.runRestoreDrill('manual', async (body) => {
    compiled = body
  })
  assert.equal(r.status, 'passed', JSON.stringify(r.checks, null, 2))
  assert.equal(r.source, 'local')
  assert.match(r.snapshot || '', backup.SNAPSHOT_FILE_RE)
  assert.deepEqual(
    r.checks.map((c) => [c.id, c.status]),
    [
      ['source', 'pass'],
      ['archive', 'pass'],
      ['files', 'pass'],
      ['integrity', 'pass'],
      ['tables', 'pass'],
      ['migrations', 'pass'],
      ['rows', 'pass'],
      ['render', 'pass'],
      ['uploads', 'pass'],
      ['inbox', 'pass'],
    ]
  )
  assert.equal(compiled, '# Hello', 'the newest PUBLISHED article is rendered, not the draft')
  assert.match(r.checks.find((c) => c.id === 'rows')!.detail, /same counts/)
  assert.equal(
    fs.readdirSync(backup.BACKUP_CONSTANTS.BACKUPS_DIR).filter((n) => n.startsWith('_drill-'))
      .length,
    0,
    'scratch removed'
  )
  const listed = drill.listRestoreDrills(5)
  assert.equal(listed[0].id, r.id)
  assert.equal(listed[0].checks.length, r.checks.length)
})

test('a render failure, a live store that moved on, and a busy store are reported', async () => {
  db.getDb()
    .prepare(`INSERT INTO kv (key, value, updated_at) VALUES ('extra', '{}', ?)`)
    .run(Date.now())
  const r = await drill.runRestoreDrill('manual', async () => {
    throw new Error('Unexpected token at 3:1')
  })
  assert.equal(r.status, 'failed')
  assert.equal(r.checks.find((c) => c.id === 'render')!.status, 'fail')
  assert.match(r.checks.find((c) => c.id === 'rows')!.detail, /\+1 kv rows since/)
  assert.match(r.summary, /^Failed: article render\.$/)

  const g = globalThis as { __storageOperation?: string | null }
  g.__storageOperation = 'backup'
  try {
    await assert.rejects(drill.runRestoreDrill('manual', compileOk), drill.DrillBusyError)
  } finally {
    g.__storageOperation = null
  }
})

/** Extract the newest snapshot into a fresh directory for tampering. */
async function extracted(): Promise<{
  dir: string
  manifest: import('../lib/backup').SnapshotManifest
}> {
  const newest = backup.listLocalBackups().find((b) => backup.SNAPSHOT_FILE_RE.test(b.filename))!
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-drill-x-'))
  const manifest = (await backup.extractTarball(
    fs.readFileSync(path.join(backup.BACKUP_CONSTANTS.BACKUPS_DIR, newest.filename)),
    dir
  ))!
  return { dir, manifest }
}

test('tampered, truncated or incomplete snapshots fail the checks', async () => {
  const { dir, manifest } = await extracted()
  try {
    const statusOf = async (m = manifest) => {
      const checks = await drill.checkExtractedSnapshot(dir, m, { live: null, compile: compileOk })
      return Object.fromEntries(checks.map((c) => [c.id, c.status]))
    }
    assert.equal((await statusOf()).files, 'pass')

    // Same size, different bytes → checksum mismatch.
    const upload = path.join(dir, 'uploads', 'cover.png')
    const bytes = fs.readFileSync(upload)
    bytes[0] ^= 0xff
    fs.writeFileSync(upload, bytes)
    assert.equal((await statusOf()).files, 'fail')

    // A missing file.
    fs.rmSync(upload)
    assert.equal((await statusOf()).files, 'fail')

    // Counts that disagree with the manifest.
    const lying = { ...manifest, counts: { pages: 9, collection_items: 9, kv: 9 } }
    assert.equal((await statusOf(lying)).rows, 'fail')

    // A manifest from before checksums and counts: warnings, not failures.
    const old = {
      ...manifest,
      files: manifest.files
        .filter((f) => f.path !== 'uploads/cover.png')
        .map(({ path: p, bytes: b }) => ({ path: p, bytes: b })),
    }
    delete (old as { counts?: unknown }).counts
    const s = await statusOf(old)
    assert.deepEqual([s.files, s.rows], ['warn', 'warn'])

    // A corrupt database.
    fs.writeFileSync(
      path.join(dir, 'db', 'content.db'),
      Buffer.from('SQLite format 3\u0000 but then garbage'.padEnd(4096, 'x'))
    )
    assert.equal((await statusOf(old)).integrity, 'fail')

    assert.equal(
      (await drill.checkExtractedSnapshot(dir, null, { live: null, compile: compileOk }))[0].status,
      'fail',
      'no manifest'
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('pure helpers: interval env, first-run delay, summaries and health warnings', () => {
  assert.equal(drill.drillIntervalHours(undefined), 168)
  assert.equal(drill.drillIntervalHours('0'), 0)
  assert.equal(drill.drillIntervalHours('0.5'), 1)
  assert.equal(drill.drillIntervalHours('9999'), 576)
  assert.equal(drill.drillIntervalHours('x'), 168)

  const week = 168 * 3_600_000
  const now = Date.UTC(2026, 9, 13)
  assert.equal(drill.firstDrillDelay(null, week, now, 0), 30 * 60_000)
  assert.equal(drill.firstDrillDelay(null, week, now, 1), 45 * 60_000)
  assert.equal(
    drill.firstDrillDelay(now - 3_600_000, week, now, 0),
    week - 3_600_000,
    'waits for the interval since the last drill'
  )
  assert.equal(
    drill.firstDrillDelay(now - 2 * week, week, now, 0),
    30 * 60_000,
    'an overdue drill runs soon after boot'
  )

  assert.deepEqual(
    drill.summarizeChecks([{ id: 'a', label: 'Files', status: 'warn', detail: '' }]),
    { status: 'passed', summary: 'Restorable, with 1 warning (files).' }
  )
  assert.equal(drill.summarizeChecks([]).summary, 'Restorable: every check passed.')

  const schedule = { enabled: true, intervalHours: 168, nextAt: null, running: false }
  const failed = { status: 'failed', ranAt: now } as import('../lib/restoreDrill').DrillResult
  assert.deepEqual(drill.restoreDrillWarnings(failed, schedule, true, now), [
    'The last restore drill failed; details are in the admin System panel.',
  ])
  assert.deepEqual(
    drill.restoreDrillWarnings(failed, schedule, false, now),
    [],
    'no backups, nothing to drill'
  )
  const stale = {
    status: 'passed',
    ranAt: now - 3 * week,
  } as import('../lib/restoreDrill').DrillResult
  assert.match(drill.restoreDrillWarnings(stale, schedule, true, now)[0], /ran 504 h ago/)
})

test('the schedule: first tick after the boot delay, then weekly; failures retry in a day, busy in 10 minutes', async () => {
  const timers: Array<{ fn: () => void; ms: number }> = []
  const results: Array<'passed' | 'failed' | 'busy'> = ['failed', 'busy', 'passed']
  const handle = drill.startRestoreDrillSchedule({
    intervalHours: 168,
    random: () => 0,
    now: () => Date.UTC(2026, 9, 13),
    setTimeoutFn: (fn, ms) => {
      timers.push({ fn, ms })
      return timers.length
    },
    clearTimeoutFn: () => {},
    run: async () => {
      const next = results.shift()
      if (next === 'busy') throw new drill.DrillBusyError('backup')
      return { status: next } as import('../lib/restoreDrill').DrillResult
    },
  })
  try {
    assert.equal(drill.restoreDrillSchedule().enabled, true)
    const wait = () => new Promise((r) => setImmediate(r))
    const step = async () => {
      timers[timers.length - 1].fn()
      await wait()
      await wait()
    }
    // The last ran drill (from the tests above) was moments ago → first run waits ~a week.
    assert.ok(timers[0].ms > 160 * 3_600_000 || timers[0].ms === 30 * 60_000)
    await step()
    assert.equal(timers[timers.length - 1].ms, 24 * 3_600_000, 'failed → retry in a day')
    await step()
    assert.equal(timers[timers.length - 1].ms, 10 * 60_000, 'busy → retry in 10 minutes')
    await step()
    assert.equal(timers[timers.length - 1].ms, 168 * 3_600_000, 'passed → next week')
  } finally {
    handle.stop()
  }
  assert.equal(drill.restoreDrillSchedule().enabled, false)
  assert.equal(drill.startRestoreDrillSchedule({ intervalHours: 0 }).stop(), undefined)
})

test('internal jobs: only this process (loopback + per-process token) may trigger them', () => {
  const token = jobs.internalJobToken()
  assert.match(token, /^[0-9a-f]{64}$/)
  assert.equal(jobs.internalJobToken(), token, 'stable per process')
  const req = (remoteAddress: string, t?: string) =>
    ({
      socket: { remoteAddress },
      headers: t === undefined ? {} : { [jobs.INTERNAL_TOKEN_HEADER]: t },
    }) as any
  assert.equal(jobs.isInternalJobRequest(req('127.0.0.1', token)), true)
  assert.equal(jobs.isInternalJobRequest(req('::ffff:127.0.0.1', token)), true)
  assert.equal(jobs.isInternalJobRequest(req('::1', token)), true)
  assert.equal(jobs.isInternalJobRequest(req('172.18.0.1', token)), false, 'not loopback')
  assert.equal(
    jobs.isInternalJobRequest(
      req(
        '127.0.0.1',
        token.replace(/.$/, (c) => (c === '0' ? '1' : '0'))
      )
    ),
    false
  )
  assert.equal(jobs.isInternalJobRequest(req('127.0.0.1')), false)
})

test('triggerInternalJob posts to this server with the token and maps 409 to busy', async () => {
  const http = await import('node:http')
  const seen: Array<{ url?: string; ok: boolean }> = []
  let reply = 200
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, ok: jobs.isInternalJobRequest(req as any) })
    res.writeHead(reply, { 'content-type': 'application/json' })
    res.end(JSON.stringify(reply === 200 ? { drill: { status: 'passed' } } : { error: 'A backup is running' }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const prevPort = process.env.PORT
  process.env.PORT = String((server.address() as { port: number }).port)
  try {
    assert.deepEqual(await jobs.triggerInternalJob('restore-drill'), { drill: { status: 'passed' } })
    assert.deepEqual(seen, [{ url: '/api/internal/restore-drill', ok: true }])
    reply = 409
    await assert.rejects(jobs.triggerInternalJob('restore-drill'), jobs.InternalJobBusyError)
    reply = 500
    await assert.rejects(jobs.triggerInternalJob('restore-drill'), /HTTP 500/)
    await assert.rejects(jobs.triggerInternalJob('../etc'), /invalid job name/)
  } finally {
    if (prevPort === undefined) delete process.env.PORT
    else process.env.PORT = prevPort
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
