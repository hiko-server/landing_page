/* eslint-disable no-console */
/**
 * Seed data/content.db from the legacy files bundled in git.
 *
 * Reads:
 *   content/now.mdx              → pages('now')
 *   content/uses.mdx             → pages('uses')
 *   content/blog/*.mdx           → collection_items('blog', slug)
 *   content/work/*.mdx           → collection_items('work', slug)
 *   data/home.json               → kv('home')
 *   data/cvdata.json             → kv('cvdata')
 *
 * Safe by default: rows that already exist in the DB are left alone (the
 * DB holds the edited, canonical content; the files are only a seed). Pass
 * --force to overwrite existing rows with the files' contents. Slugs deleted
 * through the admin (tombstoned) are not re-imported unless --force is given.
 * Invalid JSON seeds are refused rather than written.
 *
 * Run: `yarn content:migrate [--force]`
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { SAFE_NAME, openContentDb, parseJson, parseMdx } from './content-helpers.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(ROOT, 'data', 'content.db')
const FORCE = process.argv.slice(2).includes('--force')

const db = openContentDb(DB_PATH)
const counts = { imported: 0, overwritten: 0, kept: 0, skipped: 0 }

const pageExists = db.prepare('SELECT 1 FROM pages WHERE name = ?')
const itemExists = db.prepare('SELECT 1 FROM collection_items WHERE collection = ? AND slug = ?')
const kvExists = db.prepare('SELECT 1 FROM kv WHERE key = ?')
const upsertPage = db.prepare(
  `INSERT INTO pages (name, frontmatter, body, updated_at) VALUES (?, ?, ?, ?)
   ON CONFLICT(name) DO UPDATE SET frontmatter = excluded.frontmatter, body = excluded.body, updated_at = excluded.updated_at`,
)
const upsertItem = db.prepare(
  `INSERT INTO collection_items (collection, slug, frontmatter, body, updated_at) VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(collection, slug) DO UPDATE SET frontmatter = excluded.frontmatter, body = excluded.body, updated_at = excluded.updated_at`,
)
const upsertKv = db.prepare(
  `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
)

function tombstones(collection) {
  try {
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(`tombstones:${collection}`)
    return new Set(row ? JSON.parse(row.value) : [])
  } catch {
    return new Set()
  }
}

/** Write unless the row exists (or --force), and log what happened. */
function importRow(label, exists, write) {
  if (exists && !FORCE) {
    counts.kept++
    console.log(`  keep ${label} (already in DB; --force to overwrite)`)
    return
  }
  write()
  if (exists) counts.overwritten++
  else counts.imported++
  console.log(`  ${exists ? 'overwrote' : 'imported'} ${label}`)
}

function importPage(name) {
  const fp = path.join(ROOT, 'content', `${name}.mdx`)
  if (!fs.existsSync(fp)) {
    console.log(`  skip page ${name} (no file)`)
    return
  }
  const { frontmatter, body } = parseMdx(matter, fs.readFileSync(fp, 'utf-8'))
  importRow(`page ${name}`, !!pageExists.get(name), () =>
    upsertPage.run(name, JSON.stringify(frontmatter), body, Math.round(fs.statSync(fp).mtimeMs)),
  )
}

function importCollection(collection) {
  const dir = path.join(ROOT, 'content', collection)
  if (!fs.existsSync(dir)) return
  const dead = tombstones(collection)
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith('.') || !/\.(mdx|md)$/.test(file)) continue
    const slug = file.replace(/\.(mdx|md)$/, '')
    if (!SAFE_NAME.test(slug)) {
      counts.skipped++
      console.log(`  skip ${collection}/${file} (invalid slug)`)
      continue
    }
    if (dead.has(slug) && !FORCE) {
      counts.skipped++
      console.log(`  skip ${collection}/${slug} (deleted in the admin; --force to re-import)`)
      continue
    }
    const fp = path.join(dir, file)
    const { frontmatter, body } = parseMdx(matter, fs.readFileSync(fp, 'utf-8'))
    importRow(`${collection}/${slug}`, !!itemExists.get(collection, slug), () =>
      upsertItem.run(collection, slug, JSON.stringify(frontmatter), body, Math.round(fs.statSync(fp).mtimeMs)),
    )
  }
  // --force re-imported deleted slugs: they are alive again (as putItem does).
  const revived = [...dead].filter((slug) => FORCE && itemExists.get(collection, slug))
  if (revived.length) {
    for (const slug of revived) dead.delete(slug)
    upsertKv.run(`tombstones:${collection}`, JSON.stringify([...dead]), Date.now())
  }
}

function importKv(key, file) {
  const fp = path.join(ROOT, 'data', file)
  if (!fs.existsSync(fp)) {
    console.log(`  skip kv ${key} (no file)`)
    return
  }
  const parsed = parseJson(fs.readFileSync(fp, 'utf-8'))
  if (!parsed.ok) {
    counts.skipped++
    console.log(`  skip kv ${key} (data/${file} is not valid JSON: ${parsed.error})`)
    return
  }
  importRow(`kv ${key}`, !!kvExists.get(key), () =>
    upsertKv.run(key, JSON.stringify(parsed.value), Math.round(fs.statSync(fp).mtimeMs)),
  )
}

console.log(`Migrating filesystem content into SQLite${FORCE ? ' (--force: overwriting existing rows)' : ''}…`)
db.transaction(() => {
  importPage('now')
  importPage('uses')
  importCollection('blog')
  importCollection('work')
  importKv('home', 'home.json')
  importKv('cvdata', 'cvdata.json')
})()
db.close()
console.log(
  `Done: ${counts.imported} imported, ${counts.overwritten} overwritten, ${counts.kept} kept, ${counts.skipped} skipped.`,
)
