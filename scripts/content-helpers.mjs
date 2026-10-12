/**
 * Shared plumbing for the plain-Node content scripts (sync-from-r2,
 * sync-to-r2, migrate-files-to-db, list-r2).
 *
 * These scripts run outside Next (container boot, operator shell), so they
 * cannot import lib/*.ts. Everything that must agree with the app — the
 * SQLite schema, the R2 key layout, how MDX/JSON rows are serialised, the
 * R2 timeouts — lives here once instead of being copied into every script.
 * The pure helpers are unit-tested in tests/s3-sync.test.ts.
 */
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { S3Client } from '@aws-sdk/client-s3'

/** Names accepted for pages, collection slugs and kv keys mirrored to R2. */
export const SAFE_NAME = /^[a-z0-9][a-z0-9-_]*$/

/** Upload filenames accepted from / pushed to R2 (flat, no paths). */
// Must match lib/security/uploadName.ts UPLOAD_NAME_RE (this .mjs cannot import TS):
// only names the /uploads/* server serves and backups include are synced.
export const SAFE_UPLOAD = /^(?!.*\.\.)[A-Za-z0-9_-][A-Za-z0-9._-]{0,254}$/

export const COLLECTIONS = ['blog', 'work']

/** Clock-skew slack between this host and R2 when comparing timestamps. */
export const SKEW_MS = 5000

/** Same bounds as lib/r2.ts: connect 5 s, idle socket 10 s, 3 attempts. */
export const R2_TIMEOUTS = { connectionMs: 5000, requestMs: 10000, maxAttempts: 3 }

// Must match initSchema() in lib/db.ts (this .mjs cannot import TS).
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS pages (
    name TEXT PRIMARY KEY, frontmatter TEXT NOT NULL DEFAULT '{}',
    body TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS collection_items (
    collection TEXT NOT NULL, slug TEXT NOT NULL,
    frontmatter TEXT NOT NULL DEFAULT '{}', body TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL, PRIMARY KEY (collection, slug));
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS r2_pending (
    key TEXT PRIMARY KEY, op TEXT NOT NULL CHECK (op IN ('put', 'delete')),
    updated_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_collection_items_updated
    ON collection_items (collection, updated_at DESC);
`

/** Open (creating if needed) the content DB with the app's schema. */
export function openContentDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath, { timeout: 10_000 })
  try {
    if (String(db.pragma('journal_mode', { simple: true })).toLowerCase() !== 'wal') {
      db.pragma('journal_mode = WAL')
    }
    db.exec(SCHEMA_SQL)
  } catch (err) {
    db.close()
    throw err
  }
  return db
}

/** Number of real content rows (tombstone bookkeeping does not count). */
export function countContentRows(db) {
  const row = db
    .prepare(
      `SELECT (SELECT count(*) FROM pages)
            + (SELECT count(*) FROM collection_items)
            + (SELECT count(*) FROM kv WHERE key NOT LIKE 'tombstones:%') AS n`,
    )
    .get()
  return Number(row?.n || 0)
}

export function r2Env(env = process.env) {
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env
  if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null
  return {
    endpoint: R2_ENDPOINT,
    bucket: R2_BUCKET,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  }
}

export function createS3(cfg) {
  return new S3Client({
    region: 'auto',
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    maxAttempts: R2_TIMEOUTS.maxAttempts,
    retryMode: 'standard',
    requestHandler: {
      connectionTimeout: R2_TIMEOUTS.connectionMs,
      requestTimeout: R2_TIMEOUTS.requestMs,
    },
  })
}

// ── R2 key layout (mirrors lib/contentStore.ts) ──────────────────────────
export const pageKey = (name) => `pages/${name}.mdx`
export const itemKey = (collection, slug) => `${collection}/${slug}.mdx`
export const kvKey = (key) => `data/${key}.json`

/** `blog/foo.mdx` → `foo` when the basename is a valid name, else null. */
export function nameFromKey(key, ext = /\.(mdx|md)$/) {
  const base = String(key).split('/').pop() || ''
  if (!ext.test(base)) return null
  const name = base.replace(ext, '')
  return SAFE_NAME.test(name) ? name : null
}

// ── Serialisation (must match lib/contentStore.ts) ───────────────────────

/**
 * gray-matter turns unquoted YAML dates into Date objects; the app stores
 * midnight-UTC dates as "YYYY-MM-DD" and anything else as a full ISO string.
 */
export function jsonSafeFrontmatter(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const iso = value.toISOString()
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
  }
  if (Array.isArray(value)) return value.map(jsonSafeFrontmatter)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue
      out[k] = jsonSafeFrontmatter(v)
    }
    return out
  }
  return value
}

/** JSON with object keys sorted, so equal documents compare equal as strings. */
export function canonicalJson(value) {
  const norm = (v) => {
    if (Array.isArray(v)) return v.map(norm)
    if (v && typeof v === 'object') {
      const out = {}
      for (const k of Object.keys(v).sort()) {
        if (v[k] !== undefined) out[k] = norm(v[k])
      }
      return out
    }
    return v
  }
  return JSON.stringify(norm(value))
}

export function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Parse an MDX document into the shape stored in the DB. Throws on bad YAML. */
export function parseMdx(matter, raw) {
  const parsed = matter(raw)
  return { frontmatter: jsonSafeFrontmatter(parsed.data), body: parsed.content }
}

export function serializeMdx(matter, frontmatter, body) {
  return matter.stringify(body || '\n', frontmatter || {})
}

/**
 * Same document? Frontmatter is compared structurally, the body ignoring
 * trailing whitespace (gray-matter's stringify/parse round trip adds a
 * newline, which must not count as an edit).
 */
export function sameMdx(a, b) {
  return (
    canonicalJson(a.frontmatter || {}) === canonicalJson(b.frontmatter || {}) &&
    String(a.body || '').trimEnd() === String(b.body || '').trimEnd()
  )
}

export function sameJsonText(a, b) {
  const pa = parseJson(a)
  const pb = parseJson(b)
  if (!pa.ok || !pb.ok) return a === b
  return canonicalJson(pa.value) === canonicalJson(pb.value)
}

/** kv rows are mirrored to R2 as pretty-printed JSON. */
export function prettyJson(text) {
  const parsed = parseJson(text)
  return parsed.ok ? JSON.stringify(parsed.value, null, 2) : text
}

// ── Sync decision ────────────────────────────────────────────────────────

/**
 * What to do with one key, given what exists on each side.
 *
 *   local         { at, isSeed } | null   — DB row (isSeed: identical to the
 *                                            file bundled in git, i.e. it was
 *                                            auto-seeded with Date.now() and is
 *                                            NOT a real edit)
 *   remote        { at } | null           — R2 object (at = LastModified ms)
 *   tombstoneAt   number | null           — when the collection's tombstone
 *                                            list (containing this slug) was
 *                                            last written; null = not deleted
 *   pending       boolean                 — the key is in r2_pending: the app's
 *                                            last upload/delete of it failed,
 *                                            so R2 is known to be stale
 *
 * Returns one of:
 *   'pull'          fetch R2 and write it locally (when it differs)
 *   'push'          local row is a real, newer edit — upload it to R2
 *   'delete-remote' slug was deleted locally after R2 last saw it
 *   'none'          nothing to do
 *
 * A pending key is reconciled from the local side unconditionally (push the
 * row, or delete the remote object when the row is gone) — timestamps cannot
 * be trusted for it: a save that failed to reach R2 a few seconds after one
 * that succeeded is still "older" than R2 within the skew window.
 *
 * Equal timestamps mean the sync already proved both sides identical (it
 * stamps the row with the object's LastModified after a pull, a push, or a
 * content comparison), so nothing is fetched. Otherwise a seed row never wins
 * against R2, whatever its timestamp says, and ties within SKEW_MS go to R2
 * (the dual-write uploads right after the DB write, so R2's LastModified is
 * normally a few ms later than the row it mirrors, and the caller compares
 * content before writing anything).
 *
 * @param {{
 *   local: { at: number, isSeed: boolean } | null,
 *   remote: { at: number } | null,
 *   tombstoneAt?: number | null,
 *   pending?: boolean,
 *   skewMs?: number,
 * }} state
 * @returns {'pull' | 'push' | 'delete-remote' | 'none'}
 */
export function decideSync({ local, remote, tombstoneAt = null, pending = false, skewMs = SKEW_MS }) {
  if (pending) {
    if (local) return 'push'
    return remote ? 'delete-remote' : 'none'
  }
  if (remote && !local) {
    if (tombstoneAt !== null && tombstoneAt !== undefined) {
      return remote.at > tombstoneAt + skewMs ? 'pull' : 'delete-remote'
    }
    return 'pull'
  }
  if (local && !remote) return 'push'
  if (!local && !remote) return 'none'
  if (remote.at > 0 && local.at === remote.at) return 'none'
  if (local.isSeed) return 'pull'
  return local.at > remote.at + skewMs ? 'push' : 'pull'
}

/** Log line for an item imported from R2 that the local DB has no record of. */
export function remoteOnlyNotice(label) {
  return `remote-only item imported: ${label} — delete it in the admin if it was removed on purpose`
}

/** Run `fn` over `items` with at most `limit` in flight; results keep order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export async function streamToBuffer(stream) {
  const chunks = []
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
  return Buffer.concat(chunks)
}

export function inferMime(filename) {
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.txt': 'text/plain',
  }
  return map[path.extname(filename).toLowerCase()] || 'application/octet-stream'
}
