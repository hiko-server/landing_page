import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import Database from 'better-sqlite3'

// scripts/migrate-files-to-db.mjs resolves data/ and content/ next to itself,
// so it runs from a copy inside a throwaway project root.
const repoRoot = process.cwd()
const root = fs.mkdtempSync(path.join(os.tmpdir(), 's3-migrate-'))
fs.mkdirSync(path.join(root, 'scripts'))
for (const f of ['migrate-files-to-db.mjs', 'content-helpers.mjs']) {
  fs.copyFileSync(path.join(repoRoot, 'scripts', f), path.join(root, 'scripts', f))
}
// content-helpers.mjs applies the shared, versioned migrations in scripts/db.
fs.cpSync(path.join(repoRoot, 'scripts', 'db'), path.join(root, 'scripts', 'db'), { recursive: true })
fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir')
fs.mkdirSync(path.join(root, 'content', 'blog'), { recursive: true })
fs.mkdirSync(path.join(root, 'data'), { recursive: true })
fs.writeFileSync(path.join(root, 'content', 'now.mdx'), '---\ntitle: Now\n---\nSeed now\n')
fs.writeFileSync(path.join(root, 'content', 'blog', 'hello.mdx'), '---\ntitle: Hello\ndate: 2024-05-01\n---\nHi\n')
fs.writeFileSync(path.join(root, 'content', 'blog', 'deleted.mdx'), '---\ntitle: Deleted\n---\nx\n')
fs.writeFileSync(path.join(root, 'data', 'home.json'), '{\n  "hero": { "brand": "Seed" }\n}\n')
fs.writeFileSync(path.join(root, 'data', 'cvdata.json'), '{ not json')

after(() => fs.rmSync(root, { recursive: true, force: true }))

const run = (...args: string[]) =>
  spawnSync(process.execPath, [path.join(root, 'scripts', 'migrate-files-to-db.mjs'), ...args], { encoding: 'utf-8' })
const db = () => new Database(path.join(root, 'data', 'content.db'))

test('first run imports seeds, normalises them, and refuses invalid JSON', () => {
  const r = run()
  assert.equal(r.status, 0, r.stderr)
  const d = db()
  assert.deepEqual(JSON.parse((d.prepare("SELECT frontmatter FROM collection_items WHERE slug = 'hello'").get() as { frontmatter: string }).frontmatter), {
    title: 'Hello',
    date: '2024-05-01',
  })
  assert.equal((d.prepare("SELECT value FROM kv WHERE key = 'home'").get() as { value: string }).value, '{"hero":{"brand":"Seed"}}')
  assert.equal(d.prepare("SELECT 1 FROM kv WHERE key = 'cvdata'").get(), undefined)
  d.close()
  assert.match(r.stdout, /cvdata.json is not valid JSON/)
})

test('existing rows are kept unless --force; tombstoned slugs stay deleted', () => {
  const d = db()
  d.prepare("UPDATE kv SET value = ? WHERE key = 'home'").run('{"hero":{"brand":"Edited"}}')
  d.prepare("DELETE FROM collection_items WHERE slug = 'deleted'").run()
  d.prepare('INSERT INTO kv VALUES (?, ?, ?)').run('tombstones:blog', '["deleted"]', Date.now())
  d.close()

  const keep = run()
  assert.equal(keep.status, 0, keep.stderr)
  assert.match(keep.stdout, /keep kv home/)
  let check = db()
  assert.equal((check.prepare("SELECT value FROM kv WHERE key = 'home'").get() as { value: string }).value, '{"hero":{"brand":"Edited"}}')
  assert.equal(check.prepare("SELECT 1 FROM collection_items WHERE slug = 'deleted'").get(), undefined)
  check.close()

  const force = run('--force')
  assert.equal(force.status, 0, force.stderr)
  check = db()
  assert.equal((check.prepare("SELECT value FROM kv WHERE key = 'home'").get() as { value: string }).value, '{"hero":{"brand":"Seed"}}')
  assert.ok(check.prepare("SELECT 1 FROM collection_items WHERE slug = 'deleted'").get())
  assert.equal((check.prepare("SELECT value FROM kv WHERE key = 'tombstones:blog'").get() as { value: string }).value, '[]')
  // Overwritten rows are queued for the boot sync to upload (their file mtime
  // would otherwise lose to R2's newer copy); fresh imports are not.
  assert.deepEqual(
    (check.prepare("SELECT key, op FROM r2_pending ORDER BY key").all() as Array<{ key: string; op: string }>),
    [
      { key: 'blog/hello.mdx', op: 'put' },
      { key: 'data/home.json', op: 'put' },
      { key: 'pages/now.mdx', op: 'put' },
    ],
  )
  check.close()
})
