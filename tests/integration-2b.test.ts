import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { publicSections, UNDER_REVIEW_WITHHELD } from '../lib/cvVisibility'
import { withEvidenceLinks } from '../lib/cvLinks'

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

/**
 * CV-L-1: a manuscript under review is cited without where it was submitted
 * (no view prints its venue, volume, issue, pages or publisher), so the public
 * projection — page props, /api/cvdata — never carries those fields either.
 */
test('under-review papers ship without venue, volume, issue, pages and publisher', () => {
  const section = {
    sessionName: 'publications',
    headerName: 'PUBLICATIONS',
    papers: [
      { title: 'Submitted work', status: 'under-review', venue: 'Secret Venue', volume: '1', issue: '2', pages: '3-4', publisher: 'P', authors: [], date: '2026-01' },
      { title: 'Printed work', status: 'published', venue: 'Known Venue', volume: '5', authors: [], date: '2025-01' },
    ],
  }
  const [pub] = publicSections([section], 'any')
  const [under, printed] = pub.papers as Array<Record<string, unknown>>
  for (const key of UNDER_REVIEW_WITHHELD) assert.equal(key in under, false, `${key} withheld while under review`)
  assert.equal(under.title, 'Submitted work')
  assert.equal(under.status, 'under-review')
  assert.equal(printed.venue, 'Known Venue')
  assert.equal(printed.volume, '5')
  assert.equal(JSON.stringify(pub).includes('Secret Venue'), false)
})

/**
 * CV-L-2: the home page and /about ship their CV sections through the same
 * link resolution as /cv, so a project's `caseStudy` is the slug of a
 * PUBLISHED case study or '' — a draft's slug never reaches __NEXT_DATA__.
 */
test('a project pointing at an unpublished case study ships no slug on the home page and /about', () => {
  const sections = [{ sessionName: 'project', headerName: 'PROJECTS', projectExperience: [{ title: 'Secret project', caseStudy: 'secret-draft' }, { title: 'Open project', caseStudy: 'open-work' }] }]
  const out = withEvidenceLinks(sections, { works: [{ slug: 'open-work', title: 'Open project' }] })
  const [secret, open] = (out[0] as { projectExperience: Array<Record<string, unknown>> }).projectExperience
  assert.equal(secret.caseStudy, '')
  assert.equal(open.caseStudy, 'open-work')
  for (const f of ['pages/index.tsx', 'pages/about/index.tsx']) {
    const src = fs.readFileSync(path.join(process.cwd(), f), 'utf8')
    assert.match(src, /withEvidenceLinks\(/, `${f} resolves evidence links`)
  }
})
