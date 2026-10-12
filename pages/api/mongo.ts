import { MongoClient, GridFSBucket } from 'mongodb'
import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'
import dns from 'node:dns'
import matter from 'gray-matter'
import { getMongoConfig } from '../../lib/env'
import { resolveMongoSrvUrl } from '../../lib/srvResolve'
import { isAdminRequest } from '../../lib/auth'
import { readCvData, writeCvData, saveSnapshot } from '../../lib/cvdata'
import { readHome, writeHome, saveHomeSnapshot } from '../../lib/home'
import { getPage, listItems, putItem, putPage } from '../../lib/contentStore'

/**
 * POST /api/mongo — optional MongoDB backup target (admin only).
 *
 * Backs up the LIVE content (SQLite store: CV, home, blog/work posts,
 * now/uses pages), uploaded + brand images (GridFS) and version-history
 * snapshots; restores them back through the same store API the editors use,
 * so a restore is immediately visible and mirrored to R2.
 *
 * Deliberately never backs up or restores admin credentials: whoever can
 * write to the Mongo database must not be able to set the admin password.
 * (The full-site tarball in Admin → Storage covers disaster recovery.)
 */

const CONFIG_PATH = path.join(process.cwd(), 'data', 'mongo_config.json')
const IMAGE_DIR = path.join(process.cwd(), 'public', 'images')
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')
const SNAPSHOT_DIRS = ['cv_snapshots', 'home_snapshots', 'blog_snapshots', 'work_snapshots', 'page_snapshots'].map((d) =>
  path.join(process.cwd(), 'data', d),
)
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|svg|ico)$/i
const PAGES = ['now', 'uses'] as const
const COLLECTIONS = ['blog', 'work'] as const

let dnsConfigured = false
/**
 * Atlas mongodb+srv URLs need SRV lookups, which some resolvers refuse.
 * Point the resolve* API at public DNS — lazily, only when this route is
 * actually used, instead of changing process-wide DNS at import time.
 */
function configureDnsOnce() {
  if (dnsConfigured) return
  dnsConfigured = true
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4', '1.0.0.1'])
  } catch {
    /* platform refused — keep system resolvers */
  }
}

/** "mongodb+srv://user:secret@host/db" → "mongodb+srv://user:••••@host/db" */
function maskUri(uri: string): string {
  return uri.replace(/(\/\/[^:/@]+):([^@]+)@/, '$1:••••@')
}

const getAllFiles = (dirPath: string, out: string[] = []): string[] => {
  if (!fs.existsSync(dirPath)) return out
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name)
    if (entry.isDirectory()) getAllFiles(full, out)
    else out.push(full)
  }
  return out
}

/** Resolve `rel` under `base`, or null if it would escape / is not a plain relative path. */
function safeJoin(base: string, rel: string): string | null {
  const clean = String(rel || '').replace(/\\/g, '/')
  if (!clean || clean.startsWith('/') || clean.split('/').some((s) => s === '..' || s === '')) return null
  const dest = path.resolve(base, clean)
  return dest.startsWith(path.resolve(base) + path.sep) ? dest : null
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

function readStoredConfig(): { url: string; dbName: string } | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null
    const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
    return typeof c?.url === 'string' ? { url: c.url, dbName: String(c.dbName || '') } : null
  } catch {
    return null
  }
}

/** Config for the browser — credentials are always masked, never sent back. */
function readConfig(env: ReturnType<typeof getMongoConfig>) {
  if (env.fromEnv) {
    return { fromEnv: true, config: { url: maskUri(env.uri), username: '', password: '', dbName: env.dbName } }
  }
  const stored = readStoredConfig()
  if (stored) return { fromEnv: false, config: { url: maskUri(stored.url), username: '', password: '', dbName: stored.dbName } }
  return { fromEnv: false, config: null }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAdminRequest(req, res)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' })
  }
  res.setHeader('Cache-Control', 'private, no-store')
  const env = getMongoConfig()

  if (req.method === 'GET') {
    // Priority: env (MONGODB_URI, credentials masked) > data/mongo_config.json > null.
    try {
      return res.status(200).json({ ok: true, ...readConfig(env) })
    } catch {
      return res.status(500).json({ ok: false, message: 'Failed to read config' })
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET,POST')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { action, config: bodyConfig, type } = req.body || {}

  // When MONGODB_URI is set in .env, env wins: ignore any url/dbName the
  // client tries to push and never persist a file copy, so the admin GUI
  // cannot silently change the production connection string.
  let cfg = env.fromEnv ? { ...(bodyConfig || {}), url: env.uri, dbName: env.dbName } : bodyConfig
  // The browser only ever sees the masked stored URL; swap the real one back in.
  if (!env.fromEnv && cfg && typeof cfg.url === 'string' && cfg.url.includes('••••')) {
    const stored = readStoredConfig()
    if (stored) cfg = { ...cfg, url: stored.url }
  }

  if (action === 'get_config') {
    try {
      return res.status(200).json({ ok: true, ...readConfig(env) })
    } catch {
      return res.status(500).json({ ok: false, message: 'Failed to read config' })
    }
  }

  if (action === 'save_config') {
    if (env.fromEnv) {
      return res.status(403).json({
        ok: false,
        message: 'MongoDB connection is managed by .env (MONGODB_URI). Edit the env file to change it.',
      })
    }
    if (!cfg || typeof cfg.url !== 'string') return res.status(400).json({ message: 'No config provided' })
    try {
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
      fs.writeFileSync(CONFIG_PATH, JSON.stringify({ url: cfg.url, dbName: cfg.dbName || '' }, null, 2), { mode: 0o600 })
      return res.status(200).json({ ok: true, message: 'Config saved' })
    } catch {
      return res.status(500).json({ ok: false, message: 'Failed to save config' })
    }
  }

  if (!cfg || typeof cfg.url !== 'string' || !/^mongodb(\+srv)?:\/\//.test(cfg.url)) {
    return res.status(400).json({ message: 'Missing or invalid database configuration' })
  }
  if (!['test', 'backup', 'restore'].includes(action)) {
    return res.status(400).json({ message: 'Invalid action' })
  }

  const scope: string = typeof type === 'string' ? type : 'all'
  const wants = (part: string) => scope === 'all' || scope === part || (part === 'configs' && (scope === 'cv' || scope === 'home'))

  let client: MongoClient | null = null
  try {
    configureDnsOnce()
    // mongodb+srv:// requires a working DNS SRV lookup. Resolve via
    // DNS-over-HTTPS first and hand the driver the explicit mongodb:// form.
    let effectiveUrl = cfg.url
    try {
      effectiveUrl = await resolveMongoSrvUrl(cfg.url)
    } catch (srvErr: any) {
      const msg = srvErr?.message || String(srvErr)
      throw new Error(
        `SRV resolution failed (${msg}). Use the non-SRV connection string from Atlas (Connect → Drivers → URL format).`,
      )
    }

    // Short timeouts so the UI fails fast instead of hanging for 30s.
    client = new MongoClient(effectiveUrl, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 15000,
      connectTimeoutMS: 8000,
    })
    await client.connect()
    const db = client.db(cfg.dbName || 'site_backup_db')

    // ── TEST ──────────────────────────────────────────────────────────
    if (action === 'test') {
      await db.command({ ping: 1 })
      return res.status(200).json({ message: 'Connection successful', ok: true })
    }

    // ── BACKUP (site → DB) ────────────────────────────────────────────
    if (action === 'backup') {
      const timestamp = new Date()
      const counts: Record<string, number> = {}

      if (wants('configs')) {
        await db.collection('configs').insertOne({
          cv: readCvData(),
          home: readHome(),
          meta: { backupDate: timestamp, type: scope, version: 2 },
        })
        counts.configs = 1
      }

      if (wants('images')) {
        try {
          await db.collection('images.files').drop()
        } catch {
          /* first backup — nothing to drop */
        }
        try {
          await db.collection('images.chunks').drop()
        } catch {
          /* first backup — nothing to drop */
        }
        const bucket = new GridFSBucket(db, { bucketName: 'images' })
        const sources: Array<{ dir: string; prefix: string }> = [
          { dir: IMAGE_DIR, prefix: '' },
          { dir: UPLOADS_DIR, prefix: 'uploads/' },
        ]
        let n = 0
        for (const { dir, prefix } of sources) {
          for (const file of getAllFiles(dir).filter((f) => IMAGE_EXT.test(f))) {
            const rel = prefix + path.relative(dir, file).replace(/\\/g, '/')
            await new Promise((resolve, reject) => {
              fs.createReadStream(file)
                .pipe(bucket.openUploadStream(rel))
                .on('error', reject)
                .on('finish', () => resolve(true))
            })
            n++
          }
        }
        counts.images = n
      }

      if (wants('content')) {
        try {
          await db.collection('mdx_content').drop()
        } catch {
          /* first backup */
        }
        const docs: Array<{ relPath: string; body: string; backupDate: Date }> = []
        for (const name of PAGES) {
          const page = getPage(name)
          if (page) docs.push({ relPath: `${name}.mdx`, body: matter.stringify(page.body || '\n', page.frontmatter || {}), backupDate: timestamp })
        }
        for (const c of COLLECTIONS) {
          for (const item of listItems(c)) {
            docs.push({
              relPath: `${c}/${item.slug}.mdx`,
              body: matter.stringify(item.body || '\n', item.frontmatter || {}),
              backupDate: timestamp,
            })
          }
        }
        if (docs.length) await db.collection('mdx_content').insertMany(docs)
        counts.content = docs.length
      }

      if (wants('snapshots')) {
        try {
          await db.collection('snapshots').drop()
        } catch {
          /* first backup */
        }
        const docs: any[] = []
        for (const snapDir of SNAPSHOT_DIRS) {
          const dirName = path.basename(snapDir)
          for (const file of getAllFiles(snapDir)) {
            docs.push({
              dir: dirName,
              relPath: path.relative(snapDir, file).replace(/\\/g, '/'),
              body: fs.readFileSync(file, 'utf-8'),
              backupDate: timestamp,
            })
          }
        }
        if (docs.length) await db.collection('snapshots').insertMany(docs)
        counts.snapshots = docs.length
      }

      return res.status(200).json({ ok: true, message: 'Backup successful', counts })
    }

    // ── RESTORE (DB → site) ───────────────────────────────────────────
    const counts: Record<string, number> = {}
    const warnings: string[] = []
    const note = (r: { ok: boolean; error?: string; r2Warning?: string } | any) => {
      if (r && r.ok === false && r.error) warnings.push(r.error)
      else if (r?.r2Warning) warnings.push(r.r2Warning)
    }

    if (wants('configs')) {
      const latest = await db.collection('configs').find().sort({ 'meta.backupDate': -1 }).limit(1).toArray()
      const doc = latest[0]
      if (doc) {
        if (doc.cv && (Array.isArray(doc.cv.en) || Array.isArray(doc.cv.zh))) {
          try {
            saveSnapshot()
          } catch {
            /* best effort */
          }
          note(await writeCvData({ en: Array.isArray(doc.cv.en) ? doc.cv.en : [], zh: Array.isArray(doc.cv.zh) ? doc.cv.zh : [] }))
          counts.cv = 1
        }
        if (doc.home && typeof doc.home === 'object') {
          try {
            saveHomeSnapshot()
          } catch {
            /* best effort */
          }
          note(await writeHome(doc.home))
          counts.home = 1
        }
      }
    }

    if (wants('images')) {
      const bucket = new GridFSBucket(db, { bucketName: 'images' })
      const files = await bucket.find({}).toArray()
      let n = 0
      for (const file of files) {
        const name = String(file.filename || '')
        if (!IMAGE_EXT.test(name)) continue
        const dest = name.startsWith('uploads/') ? safeJoin(UPLOADS_DIR, name.slice('uploads/'.length)) : safeJoin(IMAGE_DIR, name)
        if (!dest) continue // refuse traversal / absolute paths
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        await new Promise((resolve, reject) => {
          bucket
            .openDownloadStream(file._id)
            .pipe(fs.createWriteStream(dest))
            .on('error', reject)
            .on('finish', () => resolve(true))
        })
        n++
      }
      counts.images = n
    }

    if (wants('content')) {
      const docs = await db.collection('mdx_content').find({}).toArray()
      let n = 0
      for (const doc of docs) {
        const rel = String(doc.relPath || '').replace(/\\/g, '/')
        const parsed = matter(String(doc.body ?? ''))
        const page = rel.match(/^(now|uses)\.mdx?$/)
        const item = rel.match(/^(blog|work)\/([a-z0-9][a-z0-9-]*)\.mdx?$/i)
        if (page) note(await putPage(page[1], parsed.data, parsed.content))
        else if (item) note(await putItem(item[1], item[2], parsed.data, parsed.content))
        else continue
        n++
      }
      counts.content = n
    }

    if (wants('snapshots')) {
      const allowed = new Map(SNAPSHOT_DIRS.map((d) => [path.basename(d), d]))
      const docs = await db.collection('snapshots').find({}).toArray()
      let n = 0
      for (const doc of docs) {
        const base = allowed.get(String(doc.dir || ''))
        const dest = base ? safeJoin(base, String(doc.relPath || '')) : null
        if (!dest) continue
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, String(doc.body ?? ''), 'utf-8')
        n++
      }
      counts.snapshots = n
    }

    return res.status(200).json({
      ok: warnings.length === 0,
      message: warnings.length ? `Restored with warnings: ${warnings.join('; ')}` : 'Restore successful',
      counts,
    })
  } catch (error: any) {
    console.error('Mongo Error:', error?.message || error)
    const raw = maskUri(error?.message || String(error))
    const code = error?.code || error?.codeName || error?.name
    let hint: string | undefined
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(raw)) {
      hint = 'DNS lookup failed — check the host portion of the connection string.'
    } else if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(raw)) {
      hint = 'Network blocked — add this server’s IP to your Atlas allowlist.'
    } else if (/Authentication failed|bad auth/i.test(raw)) {
      hint = 'Authentication failed — verify the user and password in the connection string.'
    } else if (/Server selection timed out|ServerSelection/i.test(raw)) {
      hint = 'Atlas did not accept the connection in time — the IP allowlist is the most common cause.'
    } else if (/TLS|SSL/i.test(raw)) {
      hint = 'TLS handshake failed — make sure mongodb+srv is used and the cluster is running.'
    }
    return res.status(500).json({ ok: false, message: hint || raw, error: raw, code, hint })
  } finally {
    if (client) await client.close().catch(() => {})
  }
}
