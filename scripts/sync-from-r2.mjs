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
 *                              (never a name in the media library's trash —
 *                              content.db media_trash: R2's copies of those
 *                              are removed instead)
 *
 * Keys in r2_pending (the app's upload or delete of them failed after every
 * retry) are reconciled first and unconditionally from the local side: the
 * row is pushed, or — when the row is gone — the R2 object is deleted. The
 * pending entry is cleared once that succeeds. R2 is known to be stale for
 * these keys, so their timestamps are not consulted. A pending uploads/ key
 * is pushed when the file is on disk (and not trashed), else deleted.
 *
 * Every other key: the newer side wins — judged by real timestamps (R2
 * LastModified vs the row's updated_at), never by "which one did we read last":
 *   - same timestamp       → nothing to do (the sync stamped the row with the
 *                            object's LastModified when it last proved them
 *                            identical), so a settled store costs no GETs.
 *   - R2 newer (or a tie)  → pull it, stamping the row with LastModified, but
 *                            only when the content actually differs.
 *   - local newer          → compare with the R2 copy and push the row only
 *                            when it differs (a dual-write that failed earlier
 *                            is repaired instead of merely skipped).
 *   - local row identical to the file bundled in git (content/*.mdx,
 *     data/*.json) → it is an auto-seeded copy written with Date.now(), not an
 *     edit, so R2 wins regardless of the timestamp.
 *   - slug in the local tombstone list → not resurrected; the stale R2 object
 *     is deleted, unless R2 rewrote it after the deletion (then it is pulled
 *     and the tombstone cleared).
 * Whenever both sides end up identical (pulled, pushed, or compared equal)
 * the row's updated_at is set to the object's LastModified, so the next boot
 * decides 'none' for it.
 *
 * A collection that has never had a tombstone row (stores written before
 * deletions were recorded) cannot tell "never seen here" from "deleted here
 * while R2 was unreachable". Its remote-only items are still imported, and
 * each one is logged so the operator can delete it if that was intended.
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
  inferMime,
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
  remoteOnlyNotice,
  sameJsonText,
  sameMdx,
  serializeMdx,
  streamToBuffer,
  trashedUploads,
  uploadOriginalOf,
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
const stats = { pulled: 0, pushed: 0, removed: 0, unchanged: 0, invalid: 0, uploads: 0, settled: 0 }
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

/** LastModified (ms) of exactly `key`, as a listing reports it; null when absent. */
async function statKey(key) {
  const out = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: key, MaxKeys: 1 }))
  const hit = (out.Contents || []).find((obj) => obj.Key === key)
  return hit?.LastModified ? new Date(hit.LastModified).getTime() : null
}

async function getBuffer(key) {
  const out = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }))
  return out.Body ? streamToBuffer(out.Body) : Buffer.alloc(0)
}

async function putText(key, body, contentType) {
  await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }))
}

async function putBuffer(key, body, contentType) {
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

const pageAt = db.prepare('SELECT updated_at FROM pages WHERE name = ?').pluck()
const itemAt = db.prepare('SELECT updated_at FROM collection_items WHERE collection = ? AND slug = ?').pluck()
const kvAt = db.prepare('SELECT updated_at FROM kv WHERE key = ?').pluck()
// Stamps only the row version the sync looked at: a row the app rewrote in
// the meantime keeps its own (newer) timestamp.
const stampPage = db.prepare('UPDATE pages SET updated_at = ? WHERE name = ? AND updated_at = ?')
const stampItem = db.prepare(
  'UPDATE collection_items SET updated_at = ? WHERE collection = ? AND slug = ? AND updated_at = ?',
)
const stampKv = db.prepare('UPDATE kv SET updated_at = ? WHERE key = ? AND updated_at = ?')
// Clears exactly the pending entry that was acted on; a newer failure the app
// recorded while the sync ran keeps its entry.
const clearPendingStmt = db.prepare('DELETE FROM r2_pending WHERE key = ? AND updated_at = ?')

const numOrNull = (v) => (v === undefined || v === null ? null : Number(v))

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

/**
 * The collection's tombstone list. `tracked` is false when no usable row
 * exists (never written, or not valid JSON): deletions made before the store
 * recorded them are then unknown.
 */
function readTombstones(collection) {
  try {
    const row = db.prepare('SELECT value, updated_at FROM kv WHERE key = ?').get(`tombstones:${collection}`)
    const list = row ? JSON.parse(row.value) : []
    return {
      at: row ? Number(row.updated_at) : 0,
      slugs: new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []),
      tracked: !!row,
    }
  } catch {
    return { at: 0, slugs: new Set(), tracked: false }
  }
}

/** key → { op, at } for every R2 key whose last app-side upload/delete failed. */
function readPending() {
  return new Map(
    db
      .prepare('SELECT key, op, updated_at FROM r2_pending')
      .all()
      .map((r) => [r.key, { op: r.op, at: Number(r.updated_at) }]),
  )
}

/**
 * Every page / item / kv key known on either side, with its local + remote
 * state, plus the pending entries no such key claims (nothing exists for them
 * on either side any more).
 */
async function collectEntities() {
  const entities = []
  const pending = readPending()

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
      pending: pending.get(pageKey(name)) || null,
      seed: () => readSeedMdx(`content/${name}.mdx`),
      write: (doc, at) => upsertPage.run(name, JSON.stringify(doc.frontmatter), doc.body, at),
      currentAt: () => numOrNull(pageAt.get(name)),
      stamp: (from, to) => stampPage.run(to, name, from).changes > 0,
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
        untracked: !tomb.tracked,
        pending: pending.get(itemKey(collection, slug)) || null,
        seed: () => readSeedMdx(`content/${collection}/${slug}.mdx`, `content/${collection}/${slug}.md`),
        write: (doc, at) => upsertItem.run(collection, slug, JSON.stringify(doc.frontmatter), doc.body, at),
        currentAt: () => numOrNull(itemAt.get(collection, slug)),
        stamp: (from, to) => stampItem.run(to, collection, slug, from).changes > 0,
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
      pending: pending.get(kvKey(name)) || null,
      seed: () => readSeedJson(name),
      write: (doc, at) => upsertKv.run(name, doc, at),
      currentAt: () => numOrNull(kvAt.get(name)),
      stamp: (from, to) => stampKv.run(to, name, from).changes > 0,
    })
  }

  const claimed = new Set(entities.map((e) => e.key))
  // uploads/ keys are images, not rows: repairPendingUploads() reconciles them.
  const orphanPending = [...pending]
    .filter(([key]) => !claimed.has(key) && !key.startsWith('uploads/'))
    .map(([key, p]) => ({ key, ...p }))
  return { entities, orphanPending }
}

// ── Plan (network reads only) ────────────────────────────────────────────

/** Fetch and parse the remote copy; null (with a warning) when it does not parse. */
async function fetchRemoteDoc(e, { reportInvalid }) {
  const raw = (await getBuffer(e.remote.key)).toString('utf-8')
  try {
    return e.parse(raw)
  } catch (err) {
    if (reportInvalid) {
      stats.invalid++
      warn(`${e.remote.key} is not valid ${e.format} (${err?.message || err}); not imported`)
    }
    return null
  }
}

async function plan(entities) {
  const writes = []
  const stamps = []
  const pushes = []
  const deletes = []

  await mapLimit(entities, 4, async (e) => {
    const seed = e.local ? e.seed() : null
    const isSeed = !!(e.local && seed !== null && e.same(seed, e.local.doc))
    const action = decideSync({
      local: e.local ? { at: e.local.at, isSeed } : null,
      remote: e.remote ? { at: e.remote.at } : null,
      tombstoneAt: e.tombstone ? e.tombstone.at : null,
      pending: !!e.pending,
    })

    if (action === 'delete-remote') {
      deletes.push(e)
      return
    }
    if (action === 'push') {
      // A pending key is pushed as is: R2 is known to be stale for it.
      // Otherwise skip the upload when R2 already holds the same document
      // (e.g. rows an older sync re-stamped with its boot time).
      if (!e.pending && e.remote) {
        const doc = await fetchRemoteDoc(e, { reportInvalid: false })
        if (doc !== null && e.same(doc, e.local.doc)) {
          stats.unchanged++
          stamps.push({ e, at: e.remote.at })
          return
        }
      }
      pushes.push(e)
      return
    }
    if (action !== 'pull') return

    const doc = await fetchRemoteDoc(e, { reportInvalid: true })
    if (doc === null) return
    if (e.local && e.same(doc, e.local.doc)) {
      stats.unchanged++
      stamps.push({ e, at: e.remote.at })
      return
    }
    writes.push({ e, doc, at: e.remote.at || Date.now() })
  })

  return { writes, stamps, pushes, deletes }
}

// ── Apply ────────────────────────────────────────────────────────────────

/** Stamp a row with the LastModified of the identical R2 object. */
function settle(e, at) {
  if (!(at > 0) || !e.local || e.local.at === at) return
  if (e.stamp(e.local.at, at)) stats.settled++
}

function clearPending(e) {
  if (e.pending) clearPendingStmt.run(e.key, e.pending.at)
}

/** Pending keys (known-stale R2 objects) are repaired before anything else. */
const pendingFirst = (list) => [...list.filter((e) => e.pending), ...list.filter((e) => !e.pending)]

function applyWrites({ writes, stamps, orphanPending }) {
  const revived = new Map()
  const notices = []
  db.transaction(() => {
    for (const { e, doc, at } of writes) {
      e.write(doc, at)
      stats.pulled++
      console.log(`  ${e.label} ← ${e.remote.key}`)
      // No tombstone row has ever been written for this collection, so a
      // deletion that failed to reach R2 before the upgrade looks exactly
      // like this. (An empty store is a fresh restore from R2 — no notice.)
      if (!e.local && e.untracked && hadContent) notices.push(remoteOnlyNotice(e.label))
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
    for (const { e, at } of stamps) settle(e, at)
    // Pending keys with nothing on either side: there is nothing left to repair.
    for (const p of orphanPending) clearPendingStmt.run(p.key, p.at)
  })()
  for (const notice of notices) warn(notice)
}

async function pushBack(pushes) {
  await mapLimit(pendingFirst(pushes), 4, async (e) => {
    // The app rewrote (or removed) the row since it was read: its own
    // dual-write — or the pending entry it records on failure — covers it.
    if (e.currentAt() !== e.local.at) {
      console.log(`  ${e.label} changed locally during the sync; not pushed`)
      return
    }
    const { body, contentType } = e.serialize(e.local.doc)
    try {
      await putText(e.key, body, contentType)
    } catch (err) {
      warn(`push ${e.key} failed: ${err?.message || err}`)
      return
    }
    stats.pushed++
    console.log(`  ${e.label} → ${e.key}${e.pending ? ' (pending upload repaired)' : ''}`)
    clearPending(e)
    try {
      settle(e, await statKey(e.key))
    } catch (err) {
      console.warn(`${TAG} could not read back ${e.key} after the push (${err?.message || err}); the next sync compares it.`)
    }
  })
}

async function deleteStale(deletes) {
  await mapLimit(pendingFirst(deletes), 4, async (e) => {
    try {
      await deleteKey(e.remote.key)
      stats.removed++
      clearPending(e)
      console.log(`  ${e.label} ✕ ${e.remote.key} (deleted locally)`)
    } catch (err) {
      warn(`delete ${e.remote.key} failed: ${err?.message || err}`)
    }
  })
}

/**
 * uploads/ keys whose app-side upload or delete failed (r2_pending): the file
 * on disk is pushed when it is there and not in the media library's trash;
 * otherwise R2's copy is deleted. Cleared once that succeeds.
 */
async function repairPendingUploads(trashed) {
  const entries = [...readPending()].filter(([key]) => key.startsWith('uploads/'))
  await mapLimit(entries, 4, async ([key, p]) => {
    const name = key.slice('uploads/'.length)
    if (!SAFE_UPLOAD.test(name) || name.startsWith('.')) {
      clearPendingStmt.run(key, p.at)
      return
    }
    const file = path.join(UPLOADS_DIR, name)
    try {
      if (fs.existsSync(file) && !trashed.has(uploadOriginalOf(name))) {
        await putBuffer(key, fs.readFileSync(file), inferMime(name))
        console.log(`  upload → ${key} (pending upload repaired)`)
      } else {
        await deleteKey(key)
        stats.removed++
        console.log(`  upload ✕ ${key} (pending delete repaired)`)
      }
      clearPendingStmt.run(key, p.at)
    } catch (err) {
      warn(`pending ${key} failed: ${err?.message || err}`)
    }
  })
}

/**
 * uploads/ — immutable names; skip files already present with the same size.
 * Runs after the DB commit, so a single failed image is a warning, not a
 * reason to report the whole sync as failed. A name in the media library's
 * trash is never pulled back: R2's copies of it are deleted (the app could
 * not delete them when it trashed the file) — unless its file is on disk
 * (main() leaves such a name out of `trashed` and warns).
 */
async function pullUploads(trashed) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  const listed = await listAll('uploads/')
  const stale = listed.filter(({ key }) => trashed.has(uploadOriginalOf(path.basename(key))))
  await mapLimit(stale, 4, async ({ key }) => {
    try {
      await deleteKey(key)
      stats.removed++
      console.log(`  upload ✕ ${key} (in the media library's trash)`)
    } catch (err) {
      warn(`delete ${key} failed: ${err?.message || err}`)
    }
  })
  const wanted = listed.filter(({ key, size }) => {
    const name = path.basename(key)
    if (!SAFE_UPLOAD.test(name) || name.startsWith('.')) return false
    if (trashed.has(uploadOriginalOf(name))) return false
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

  const { entities, orphanPending } = await collectEntities()
  const pendingCount = entities.filter((e) => e.pending).length + orphanPending.length
  if (pendingCount) console.log(`${TAG} ${pendingCount} key(s) left stale in R2 by a failed upload/delete; repairing them first.`)
  const { writes, stamps, pushes, deletes } = await plan(entities)
  applyWrites({ writes, stamps, orphanPending })
  await pushBack(pushes)
  await deleteStale(deletes)
  // A trash row whose file is on disk (a content restore brought the row back
  // beside a live upload) is not acted on: deleting R2's copies would strip a
  // file the site serves. Warned instead; the app's restore reconciles it.
  const trashed = trashedUploads(db)
  for (const name of [...trashed]) {
    if (!fs.existsSync(path.join(UPLOADS_DIR, name))) continue
    trashed.delete(name)
    warn(`uploads/${name} is in the media library's trash but its file is on disk: R2's copies are kept (Media → Trash: Delete now, or restore a snapshot again)`)
  }
  await repairPendingUploads(trashed)
  await pullUploads(trashed)

  console.log(
    `${TAG} OK: pulled ${stats.pulled}, pushed ${stats.pushed}, unchanged ${stats.unchanged}, ` +
      `removed ${stats.removed}, invalid ${stats.invalid}, uploads ${stats.uploads}, settled ${stats.settled}, ` +
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
