import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'

/**
 * Wave 2B integration: what the merged streams owe each other.
 *
 * The activity log (admin-ops, H13) follows the auth store's rule (SECU-4):
 * audit.db is created owner-only before SQLite opens it, so the -wal and
 * -shm files — where the rows actually sit — are never world-readable.
 */

const modeOf = (p: string) => fs.statSync(p).mode & 0o777

test('audit.db, its -wal and -shm files are owner-only (0600) from the first open', async () => {
  if (process.platform === 'win32') return
  const prevCwd = process.cwd()
  // realpath: macOS reports /var/… as /private/var/… once a process has chdir'ed into it.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'audit-perms-')))
  process.chdir(dir)
  try {
    const { getAuditDb, closeAuditDb, auditDbPath, restrictAuditDbFiles } = await import('../lib/audit/db')
    const file = auditDbPath()
    assert.equal(file, path.join(dir, 'data', 'audit.db'))
    const db = getAuditDb()
    // A write makes SQLite create the WAL sidecars.
    db.prepare(`CREATE TABLE IF NOT EXISTS t (x)`).run()
    db.prepare(`INSERT INTO t VALUES (1)`).run()
    for (const p of [file, `${file}-wal`, `${file}-shm`]) {
      assert.ok(fs.existsSync(p), `${path.basename(p)} exists`)
      assert.equal(modeOf(p), 0o600, path.basename(p))
    }
    // A sidecar left world-readable by an older release is repaired on the next open.
    fs.chmodSync(`${file}-wal`, 0o644)
    restrictAuditDbFiles(file)
    assert.equal(modeOf(`${file}-wal`), 0o600)
    // A missing sidecar is not an error.
    assert.doesNotThrow(() => restrictAuditDbFiles(path.join(dir, 'data', 'absent.db')))
    closeAuditDb()
    assert.ok(new Database(file, { readonly: true }).prepare(`SELECT count(*) AS n FROM t`).get())
  } finally {
    process.chdir(prevCwd)
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
