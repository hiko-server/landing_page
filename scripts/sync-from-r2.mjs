/* eslint-disable no-console */
/**
 * Reconcile the local SQLite content store with its Cloudflare R2 replica.
 *
 * Runs on container startup (docker-entrypoint.sh, before the server starts)
 * and manually via `yarn content:pull`.
 *
 * Keys (layout written by lib/contentStore.ts):
 *   pages/*.mdx              ↔ pages
 *   blog/*.mdx, work/*.mdx   ↔ collection_items
 *   data/*.json              ↔ kv
 *   uploads/*                → public/uploads/<basename>
 *
 * Per key, the newer side wins — judged by real timestamps (R2 LastModified
 * vs the row's updated_at), never by "which one did we read last":
 *   - R2 newer (or a tie)  → pull it, stamping the row with LastModified, but
 *                            only when the content actually differs.
 *   - local newer          → push the row back to R2 (a dual-write that failed
 *                            earlier is repaired instead of merely skipped).
 *   - local row identical to the file bundled in git (content/*.mdx,
 *     data/*.json) → it is an auto-seeded copy written with Date.now(), not an
 *     edit, so R2 wins regardless of the timestamp.
 *   - slug in the local tombstone list → not resurrected; the stale R2 object
 *     is deleted, unless R2 rewrote it after the deletion (then it is pulled
 *     and the tombstone cleared).
 * R2 objects that do not parse (bad JSON / YAML) are never written to the DB.
 *
 * All R2 reads happen before the first DB write, and the DB writes land in a
 * single transaction, so a network failure half-way leaves the DB untouched.
 *
 * Exit codes (consumed by docker-entrypoint.sh):
 *   0  synced, or R2 not configured (warning) and R2_REQUIRED is not 1
 *   1  fatal: R2 required but not configured, DB unusable, or R2 failed and
 *      there is no local content to fall back to
 *   3  R2 failed, existing local content kept untouched
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import {
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import {
  COLLECTIONS,
  SAFE_NAME,
  SAFE_UPLOAD,
  countContentRows,
  createS3,
  decideSync,
  itemKey,
  kvKey,
  mapLimit,
  nameFromKey,
  openContentDb,
  pageKey,
  parseJson,
  parseMdx,
  prettyJson,
  r2Env,
  sameJsonText,
  sameMdx,
  serializeMdx,
  streamToBuffer,
} from './content-helpers.mjs'

const EXIT_FATAL = 1
const EXIT_KEPT_LOCAL = 3

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(ROOT, 'data', 'content.db')
const UPLOADS_DIR = path.join(ROOT, 'public', 'uploads')
const TAG = '[sync-from-r2]'

const cfg = r2Env()
if (!cfg) {
  if (process.env.R2_REQUIRED === '1') {
    console.error(`${TAG} R2 env vars missing and R2_REQUIRED=1. Aborting.`)
    process.exit(EXIT_FATAL)
  }
  console.warn(`${TAG} R2 env vars missing. Skipping sync (set R2_REQUIRED=1 to make this fatal).`)
  process.exit(0)
}

let db
let hadContent = false
try {
  db = openContentDb(DB_PATH)
  hadContent = countContentRows(db) > 0
} catch (err) {
  console.error(`${TAG} cannot open ${DB_PATH}:`, err?.message || err)
  process.exit(EXIT_FATAL)
}

const s3 = createS3(cfg)
const stats = { pulled: 0, pushed: 0, removed: 0, unchanged: 0, invalid: 0, uploads: 0 }
const warnings = []
const warn = (msg) => {
  warnings.push(msg)
  console.warn(`${TAG} WARNING: ${msg}`)
}

// ── R2 primitives ────────────────────────────────────────────────────────
async function listAll(prefix) {
  const objs = []
  let token
  do {
    const out = await s3.send(
      new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token }),
    )
    for (const obj of out.Contents || []) {
      if (!obj.Key) continue
      objs.push({
        key: obj.Key,
        at: obj.LastModified ? new Date(obj.LastModified).getTime() : 0,
        size: obj.Size ?? -1,
      })
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (token)
  return objs
}

async function getBuffer(key) {
  const out = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }))
  return out.Body ? streamToBuffer(out.Body) : Buffer.alloc(0)
}

async function putText(key, body, contentType) {
  await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }))
}

async function deleteKey(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }))
}

/** name → newest remote object, for keys whose basename is a valid name. */
async function remoteIndex(prefix, ext) {
  const map = new Map()
  for (const obj of await listAll(prefix)) {
    const name = nameFromKey(obj.key, ext)
    if (!name) continue
    const prev = map.get(name)
    if (!prev || obj.at > prev.at) map.set(name, obj)
  }
  return map
}

// ── Git-bundled seeds (what contentStore auto-imports into an empty DB) ──
function readSeedMdx(...candidates) {
  for (const rel of candidates) {
    const fp = path.join(ROOT, rel)
    try {
      if (fs.existsSync(fp)) return parseMdx(matter, fs.readFileSync(fp, 'utf-8'))
    } catch {
      return null
    }
  }
  return null
}

function readSeedJson(name) {
  const fp = path.join(ROOT, 'data', `${name}.json`)
  try {
    return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8') : null
  } catch {
    return null
  }
}

// ── Entity kinds ─────────────────────────────────────────────────────────
const MDX = 'text/markdown; charset=utf-8'
const JSON_CT = 'application/json; charset=utf-8'

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

function mdxLocal(row) {
  try {
    return { at: Number(row.updated_at), doc: { frontmatter: JSON.parse(row.frontmatter), body: row.body } }
  } catch {
    return { at: Number(row.updated_at), doc: { frontmatter: {}, body: row.body } }
  }
}

const mdxKind = {
  format: 'MDX',
  same: sameMdx,
  parse: (text) => parseMdx(matter, text),
  serialize: (doc) => ({ body: serializeMdx(matter, doc.frontmatter, doc.body), contentType: MDX }),
}

const kvKind = {
  format: 'JSON',
  same: sameJsonText,
  parse: (text) => {
    const parsed = parseJson(text)
    if (!parsed.ok) throw new Error(parsed.error)
    return JSON.stringify(parsed.value)
  },
  serialize: (doc) => ({ body: prettyJson(doc), contentType: JSON_CT }),
}

function readTombstones(collection) {
  try {
    const row = db.prepare('SELECT value, updated_at FROM kv WHERE key = ?').get(`tombstones:${collection}`)
    const list = row ? JSON.parse(row.value) : []
    return {
      at: row ? Number(row.updated_at) : 0,
      slugs: new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []),
    }
  } catch {
    return { at: 0, slugs: new Set() }
  }
}

/** Every page / item / kv key known on either side, with its local + remote state. */
async function collectEntities() {
  const entities = []

  const remotePages = await remoteIndex('pages/')
  const localPages = new Map(
    db.prepare('SELECT name, frontmatter, body, updated_at FROM pages').all().map((r) => [r.name, mdxLocal(r)]),
  )
  for (const name of new Set([...remotePages.keys(), ...localPages.keys()])) {
    if (!SAFE_NAME.test(name)) continue
    entities.push({
      ...mdxKind,
      label: `page ${name}`,
      key: pageKey(name),
      local: localPages.get(name) || null,
      remote: remotePages.get(name) || null,
      seed: () => readSeedMdx(`content/${name}.mdx`),
      write: (doc, at) => upsertPage.run(name, JSON.stringify(doc.frontmatter), doc.body, at),
    })
  }

  for (const collection of COLLECTIONS) {
    const tomb = readTombstones(collection)
    const remote = await remoteIndex(`${collection}/`)
    const local = new Map(
      db
        .prepare('SELECT slug, frontmatter, body, updated_at FROM collection_items WHERE collection = ?')
        .all(collection)
        .map((r) => [r.slug, mdxLocal(r)]),
    )
    for (const slug of new Set([...remote.keys(), ...local.keys()])) {
      if (!SAFE_NAME.test(slug)) continue
      entities.push({
        ...mdxKind,
        label: `${collection}/${slug}`,
        key: itemKey(collection, slug),
        local: local.get(slug) || null,
        remote: remote.get(slug) || null,
        tombstone: tomb.slugs.has(slug) ? { collection, slug, at: tomb.at } : null,
        seed: () => readSeedMdx(`content/${collection}/${slug}.mdx`, `content/${collection}/${slug}.md`),
        write: (doc, at) => upsertItem.run(collection, slug, JSON.stringify(doc.frontmatter), doc.body, at),
      })
    }
  }

  const remoteKv = await remoteIndex('data/', /\.json$/)
  const localKv = new Map(
    db
      .prepare('SELECT key, value, updated_at FROM kv')
      .all()
      .filter((r) => SAFE_NAME.test(r.key))
      .map((r) => [r.key, { at: Number(r.updated_at), doc: r.value }]),
  )
  for (const name of new Set([...remoteKv.keys(), ...localKv.keys()])) {
    entities.push({
      ...kvKind,
      label: `kv ${name}`,
      key: kvKey(name),
      local: localKv.get(name) || null,
      remote: remoteKv.get(name) || null,
      seed: () => readSeedJson(name),
      write: (doc, at) => upsertKv.run(name, doc, at),
    })
  }

  return entities
}

// ── Plan (network reads only) ────────────────────────────────────────────
async function plan(entities) {
  const writes = []
  const pushes = []
  const deletes = []

  await mapLimit(entities, 4, async (e) => {
    const seed = e.local ? e.seed() : null
    const isSeed = !!(e.local && seed !== null && e.same(seed, e.local.doc))
    const action = decideSync({
      local: e.local ? { at: e.local.at, isSeed } : null,
      remote: e.remote ? { at: e.remote.at } : null,
      tombstoneAt: e.tombstone ? e.tombstone.at : null,
    })

    if (action === 'push') {
      pushes.push(e)
      return
    }
    if (action === 'delete-remote') {
      deletes.push(e)
      return
    }
    if (action !== 'pull') return

    const raw = (await getBuffer(e.remote.key)).toString('utf-8')
    let doc
    try {
      doc = e.parse(raw)
    } catch (err) {
      stats.invalid++
      warn(`${e.remote.key} is not valid ${e.format} (${err?.message || err}); not imported`)
      return
    }
    if (e.local && e.same(doc, e.local.doc)) {
      stats.unchanged++
      return
    }
    writes.push({ e, doc, at: e.remote.at || Date.now() })
  })

  return { writes, pushes, deletes }
}

// ── Apply ────────────────────────────────────────────────────────────────
function applyWrites(writes) {
  const revived = new Map()
  db.transaction(() => {
    for (const { e, doc, at } of writes) {
      e.write(doc, at)
      stats.pulled++
      console.log(`  ${e.label} ← ${e.remote.key}`)
      if (e.tombstone) {
        const set = revived.get(e.tombstone.collection) || new Set()
        set.add(e.tombstone.slug)
        revived.set(e.tombstone.collection, set)
      }
    }
    // R2 rewrote a slug after it was deleted here: it is alive again.
    for (const [collection, slugs] of revived) {
      const tomb = readTombstones(collection)
      for (const slug of slugs) tomb.slugs.delete(slug)
      upsertKv.run(`tombstones:${collection}`, JSON.stringify(Array.from(tomb.slugs)), Date.now())
    }
  })()
}

async function pushBack(pushes) {
  await mapLimit(pushes, 4, async (e) => {
    const { body, contentType } = e.serialize(e.local.doc)
    try {
      await putText(e.key, body, contentType)
      stats.pushed++
      console.log(`  ${e.label} → ${e.key}`)
    } catch (err) {
      warn(`push ${e.key} failed: ${err?.message || err}`)
    }
  })
}

async function deleteStale(deletes) {
  await mapLimit(deletes, 4, async (e) => {
    try {
      await deleteKey(e.remote.key)
      stats.removed++
      console.log(`  ${e.label} ✕ ${e.remote.key} (deleted locally)`)
    } catch (err) {
      warn(`delete ${e.remote.key} failed: ${err?.message || err}`)
    }
  })
}

/**
 * uploads/ — immutable names; skip files already present with the same size.
 * Runs after the DB commit, so a single failed image is a warning, not a
 * reason to report the whole sync as failed.
 */
async function pullUploads() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  const wanted = (await listAll('uploads/')).filter(({ key, size }) => {
    const name = path.basename(key)
    if (!SAFE_UPLOAD.test(name) || name.startsWith('.')) return false
    try {
      const dest = path.join(UPLOADS_DIR, name)
      return !(fs.existsSync(dest) && fs.statSync(dest).size === size)
    } catch {
      return true
    }
  })
  await mapLimit(wanted, 4, async ({ key }) => {
    const name = path.basename(key)
    const dest = path.join(UPLOADS_DIR, name)
    const tmp = `${dest}.sync-${process.pid}`
    try {
      fs.writeFileSync(tmp, await getBuffer(key))
      fs.renameSync(tmp, dest)
      stats.uploads++
      console.log(`  upload ← ${key}`)
    } catch (err) {
      fs.rmSync(tmp, { force: true })
      warn(`upload ${key} failed: ${err?.message || err}`)
    }
  })
}

async function main() {
  const started = Date.now()
  console.log(`${TAG} Bucket: ${cfg.bucket}`)

  const { writes, pushes, deletes } = await plan(await collectEntities())
  applyWrites(writes)
  await pushBack(pushes)
  await deleteStale(deletes)
  await pullUploads()

  console.log(
    `${TAG} OK: pulled ${stats.pulled}, pushed ${stats.pushed}, unchanged ${stats.unchanged}, ` +
      `removed ${stats.removed}, invalid ${stats.invalid}, uploads ${stats.uploads}, ` +
      `warnings ${warnings.length} (${Date.now() - started} ms)`,
  )
}

main()
  .then(() => {
    db.close()
    process.exit(0)
  })
  .catch((err) => {
    try {
      db.close()
    } catch {
      /* already closed */
    }
    if (hadContent) {
      console.error(`${TAG} FAILED (${err?.name || 'Error'}: ${err?.message || err}); existing local content kept.`)
      process.exit(EXIT_KEPT_LOCAL)
    }
    console.error(`${TAG} FAILED and the local store is empty:`, err)
    process.exit(EXIT_FATAL)
  })
