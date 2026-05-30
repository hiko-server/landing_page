import { MongoClient, GridFSBucket } from 'mongodb'
import type { NextApiRequest, NextApiResponse } from 'next'
import { getCookie } from 'cookies-next'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import dns from 'node:dns'
import { getJwtSecret, getMongoConfig } from '../../lib/env'
import { resolveMongoSrvUrl } from '../../lib/srvResolve'

// Atlas mongodb+srv URLs require a working SRV-record lookup. On Windows /
// some ISPs / VPNs the local DNS resolver refuses SRV queries
// (ECONNREFUSED querySrv). Force the resolve* API to use Google + Cloudflare
// public DNS so /admin/db-config works regardless of the host DNS state.
// Also prefer IPv4 for getaddrinfo to avoid IPv6 timeouts on hosts that
// announce AAAA records but can't reach them.
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4', '1.0.0.1'])
} catch {
  // setServers is fine to call repeatedly; ignore if the platform refuses
}
try {
  const setOrder = (dns as any).setDefaultResultOrder
  if (typeof setOrder === 'function') setOrder('ipv4first')
} catch {}

const CONFIG_PATH = path.join(process.cwd(), 'data', 'mongo_config.json')
const CV_DATA_Path = path.join(process.cwd(), 'data', 'cvdata.json')
const HOME_DATA_Path = path.join(process.cwd(), 'data', 'home.json')
const ADMIN_DATA_Path = path.join(process.cwd(), 'data', 'admin.json')
const IMAGE_DIR = path.join(process.cwd(), 'public', 'images')
// MDX content tree — now.mdx, uses.mdx, blog/*.mdx, work/*.mdx.
// Backed up as plain UTF-8 documents in the `mdx_content` collection so the
// /now, /uses, /blog and /work routes survive a clean redeploy.
const CONTENT_DIR = path.join(process.cwd(), 'content')
// Version-history snapshots written by lib/cvdata.ts, lib/home.ts and
// lib/mdx-admin.ts. Backed up so the /admin/dashboard?tab=versions UI can
// roll back to any prior state after a clean redeploy.
const SNAPSHOT_DIRS = [
  path.join(process.cwd(), 'data', 'cv_snapshots'),
  path.join(process.cwd(), 'data', 'home_snapshots'),
  path.join(process.cwd(), 'data', 'blog_snapshots'),
  path.join(process.cwd(), 'data', 'work_snapshots'),
  path.join(process.cwd(), 'data', 'page_snapshots'),
]

// Admin guard (same scheme as pages/api/cvdata.ts / home.ts)
function isAuthed(req: NextApiRequest, res: NextApiResponse): boolean {
  const token = getCookie('cv_admin_token', { req, res }) as string | undefined
  if (!token) return false
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { role?: string }
    return decoded?.role === 'admin'
  } catch {
    return false
  }
}

// Helper for file reading
const readFile = (p: string) => {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
    return null
}

// Helper to get all files recursively
const getAllFiles = (dirPath: string, arrayOfFiles: string[] = []) => {
  const files = fs.readdirSync(dirPath)

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles)
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file))
    }
  })

  return arrayOfFiles
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Adjust as needed
    },
  },
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // All mongo backup/restore + connection-config endpoints require admin auth.
  // (Previously unauthenticated — fixed in v6 phase A as a critical hardening.)
  if (!isAuthed(req, res)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' })
  }

  if (req.method === 'GET') {
     // Config retrieval (GET alias for action=get_config for simplicity).
     // Priority: env (MONGODB_URI) > data/mongo_config.json > null.
     try {
        const env = getMongoConfig()
        if (env.fromEnv) {
            return res.status(200).json({
                ok: true,
                fromEnv: true,
                config: { url: env.uri, username: '', password: '', dbName: env.dbName }
            })
        }
        if (fs.existsSync(CONFIG_PATH)) {
            const fileData = fs.readFileSync(CONFIG_PATH, 'utf-8')
            return res.status(200).json({ ok: true, fromEnv: false, config: JSON.parse(fileData) })
        }
        return res.status(200).json({ ok: true, fromEnv: false, config: null }) // No config yet
     } catch (e) {
        return res.status(500).json({ ok: false, message: 'Failed to read config' })
     }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { action, config: bodyConfig, type, data } = req.body

  // When MONGODB_URI is set in .env, env wins: ignore any url/dbName the
  // client tries to push and never persist a file copy. This is the core of
  // the "防呆 / fool-proof" guard — the admin GUI cannot silently change the
  // production connection string from the browser.
  const env = getMongoConfig()
  const config = env.fromEnv
    ? { ...(bodyConfig || {}), url: env.uri, dbName: env.dbName }
    : bodyConfig

  if (action === 'save_config') {
      if (env.fromEnv) {
          return res.status(403).json({
              ok: false,
              message: 'MongoDB connection is managed by .env (MONGODB_URI). Edit the env file to change it.'
          })
      }
      if (!config) return res.status(400).json({ message: 'No config provided' })
      try {
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
          return res.status(200).json({ ok: true, message: 'Config saved' })
      } catch (e) {
          return res.status(500).json({ ok: false, message: 'Failed to save config' })
      }
  }

  if (action === 'get_config') {
      try {
        if (env.fromEnv) {
            return res.status(200).json({
                ok: true,
                fromEnv: true,
                config: { url: env.uri, username: '', password: '', dbName: env.dbName }
            })
        }
        if (fs.existsSync(CONFIG_PATH)) {
            const fileData = fs.readFileSync(CONFIG_PATH, 'utf-8')
            return res.status(200).json({ ok: true, fromEnv: false, config: JSON.parse(fileData) })
        }
        return res.status(200).json({ ok: true, fromEnv: false, config: null })
     } catch (e) {
        return res.status(500).json({ ok: false, message: 'Failed to read config' })
     }
  }

  if (!config || !config.url) {
    return res.status(400).json({ message: 'Missing database configuration' })
  }

  const { url, dbName } = config

  let client: MongoClient | null = null

  try {
    // mongodb+srv:// requires a working DNS SRV lookup. On networks that
    // refuse outbound port 53 (corporate / VPN / China ISPs), this fails
    // with 'querySrv ECONNREFUSED'. Resolve via DNS-over-HTTPS first and
    // hand the driver the explicit mongodb:// form so it never touches the
    // local resolver.
    let effectiveUrl = url
    try {
      effectiveUrl = await resolveMongoSrvUrl(url)
    } catch (srvErr: any) {
      // Re-throw with a clearer message so the toast surfaces the right hint.
      const msg = srvErr?.message || String(srvErr)
      throw new Error(`SRV resolution failed (${msg}). Use the non-SRV connection string from Atlas (Connect → Drivers → URL format).`)
    }

    // Connect with explicit short timeouts so the UI fails fast instead of
    // hanging for the driver's 30s default. The most common Atlas failure
    // after this point is an IP that hasn't been allowlisted.
    client = new MongoClient(effectiveUrl, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 10000,
      connectTimeoutMS: 8000,
    })
    await client.connect()

    const db = client.db(dbName || 'site_backup_db')

    // -------------------------------------------------------------------------
    // TEST CONNECTION
    // -------------------------------------------------------------------------
    if (action === 'test') {
      await db.command({ ping: 1 })
      return res.status(200).json({ message: 'Connection successful', ok: true })
    }

    // -------------------------------------------------------------------------
    // BACKUP (Site -> DB)
    // -------------------------------------------------------------------------
    if (action === 'backup') {
        const timestamp = new Date()
        
        // 1. Configs (CV, Home, Admin)
        if (['all', 'cv', 'home'].includes(type)) {
            const cv = readFile(CV_DATA_Path)
            const home = readFile(HOME_DATA_Path)
            const admin = readFile(ADMIN_DATA_Path)
            
            await db.collection('configs').insertOne({
                cv,
                home,
                admin,
                meta: { backupDate: timestamp, type: type || 'full' }
            })
        }

        // 2. Images
        if (['all', 'images'].includes(type)) {
            // Need to drop existing bucket to avoid duplication or name collision logic?
            // GridFS allows multiple files with same name.
            // Let's drop for a clean 'current state' backup.
            if (type === 'images' || type === 'all') {
                try { await db.collection('images.files').drop() } catch(e){}
                try { await db.collection('images.chunks').drop() } catch(e){}
            }

            const bucket = new GridFSBucket(db, { bucketName: 'images' })
            const files = getAllFiles(IMAGE_DIR)

            for (const file of files) {
                const relativePath = path.relative(IMAGE_DIR, file).replace(/\\/g, '/') // Ensure forward slashes
                const stream = fs.createReadStream(file)
                const uploadStream = bucket.openUploadStream(relativePath)
                
                await new Promise((resolve, reject) => {
                    stream.pipe(uploadStream)
                        .on('error', reject)
                        .on('finish', () => resolve(true))
                })
            }
        }

        // 3. MDX content (now.mdx, uses.mdx, blog/*.mdx, work/*.mdx).
        // Stored as one document per file in `mdx_content`. We drop the
        // collection first so deleted local files don't reappear on restore.
        if (['all', 'content'].includes(type)) {
            try { await db.collection('mdx_content').drop() } catch(e){}
            if (fs.existsSync(CONTENT_DIR)) {
                const files = getAllFiles(CONTENT_DIR).filter((f) => /\.(mdx|md)$/i.test(f))
                const docs = files.map((file) => ({
                    relPath: path.relative(CONTENT_DIR, file).replace(/\\/g, '/'),
                    body: fs.readFileSync(file, 'utf-8'),
                    backupDate: timestamp,
                }))
                if (docs.length > 0) {
                    await db.collection('mdx_content').insertMany(docs)
                }
            }
        }

        // 4. Version-history snapshots (data/{cv,home,blog,work,page}_snapshots/**).
        // Stored as { dir, relPath, body, backupDate } in `snapshots`. dir is
        // the snapshot folder name (e.g. "cv_snapshots") so restore can route
        // back to the correct directory under data/.
        if (['all', 'snapshots'].includes(type)) {
            try { await db.collection('snapshots').drop() } catch(e){}
            const docs: any[] = []
            for (const snapDir of SNAPSHOT_DIRS) {
                if (!fs.existsSync(snapDir)) continue
                const dirName = path.basename(snapDir)
                const files = getAllFiles(snapDir)
                for (const file of files) {
                    docs.push({
                        dir: dirName,
                        relPath: path.relative(snapDir, file).replace(/\\/g, '/'),
                        body: fs.readFileSync(file, 'utf-8'),
                        backupDate: timestamp,
                    })
                }
            }
            if (docs.length > 0) {
                await db.collection('snapshots').insertMany(docs)
            }
        }

        return res.status(200).json({ ok: true, message: 'Backup successful' })
    }

    // -------------------------------------------------------------------------
    // RESTORE (DB -> Site)
    // -------------------------------------------------------------------------
    if (action === 'restore') {
        // 1. Configs
        if (['all', 'cv', 'home'].includes(type) || type === undefined) {
             const latest = await db.collection('configs').find().sort({ 'meta.backupDate': -1 }).limit(1).toArray()
             if (latest && latest.length > 0) {
                 const config = latest[0]
                 if (config.cv) fs.writeFileSync(CV_DATA_Path, JSON.stringify(config.cv, null, 2))
                 if (config.home) fs.writeFileSync(HOME_DATA_Path, JSON.stringify(config.home, null, 2))
                 if (config.admin) fs.writeFileSync(ADMIN_DATA_Path, JSON.stringify(config.admin, null, 2))
             }
        }

        // 2. Images
        if (['all', 'images'].includes(type)) {
            const bucket = new GridFSBucket(db, { bucketName: 'images' })
            const files = await bucket.find({}).toArray()
            
            // Ensure Image Dir exists
            if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true })

            for (const file of files) {
                const relativePath = file.filename
                const destPath = path.join(IMAGE_DIR, relativePath)
                
                // Ensure subdir exists
                const destDir = path.dirname(destPath)
                if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

                const downloadStream = bucket.openDownloadStream(file._id)
                const fileStream = fs.createWriteStream(destPath)
                
                await new Promise((resolve, reject) => {
                    downloadStream.pipe(fileStream)
                        .on('error', reject)
                        .on('finish', () => resolve(true))
                })
            }
        }

        // 3. MDX content
        if (['all', 'content'].includes(type)) {
            const docs = await db.collection('mdx_content').find({}).toArray()
            for (const doc of docs) {
                const rel = String(doc.relPath || '').replace(/\\/g, '/')
                // 防呆: refuse path traversal — keep restores inside content/.
                if (!rel || rel.includes('..') || path.isAbsolute(rel)) continue
                if (!/\.(mdx|md)$/i.test(rel)) continue
                const destPath = path.join(CONTENT_DIR, rel)
                const destDir = path.dirname(destPath)
                if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
                fs.writeFileSync(destPath, String(doc.body ?? ''), 'utf-8')
            }
        }

        // 4. Snapshots (cv/home/blog/work history). This is a sibling of the
        // sections above. It was previously spliced INSIDE the image-download
        // loop, so it restored 0x when type='snapshots' (the images guard was
        // false) and Nx under type='all' (once per image file) — neither correct.
        if (['all', 'snapshots'].includes(type)) {
            const allowedDirs = new Set(SNAPSHOT_DIRS.map((d) => path.basename(d)))
            const docs = await db.collection('snapshots').find({}).toArray()
            for (const doc of docs) {
                const dir = String(doc.dir || '')
                const rel = String(doc.relPath || '').replace(/\\/g, '/')
                // 防呆: only restore into known snapshot dirs, no traversal.
                if (!allowedDirs.has(dir)) continue
                if (!rel || rel.includes('..') || path.isAbsolute(rel)) continue
                const destPath = path.join(process.cwd(), 'data', dir, rel)
                const destDir = path.dirname(destPath)
                if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
                fs.writeFileSync(destPath, String(doc.body ?? ''), 'utf-8')
            }
        }

        return res.status(200).json({ ok: true, message: 'Restore successful' })
    }

    // -------------------------------------------------------------------------
    // OLD SNAPSHOT FUNCTIONALITY (Keep for compatibility)
    // -------------------------------------------------------------------------
    if (action === 'save') {
      if (!data) {
        return res.status(400).json({ message: 'No data provided to save' })
      }
      
      const collection = db.collection('cv_snapshots')
      
      // We save a new snapshot with timestamp
      const doc = {
        timestamp: new Date(),
        data: data.data, // Expecting { en: ..., zh: ... } structure or similar
        note: data.note || 'Manual save from Admin Panel',
        source: 'admin-gui-v2'
      }

      const result = await collection.insertOne(doc)
      
      return res.status(200).json({ 
        message: 'Saved successfully', 
        id: result.insertedId,
        ok: true 
      })
    }

    if (action === 'list') {
      const collection = db.collection('cv_snapshots')
      const snapshots = await collection
        .find({}) 
        .project({ data: 0 })
        .sort({ timestamp: -1 })
        .limit(20)
        .toArray()
      return res.status(200).json({ ok: true, snapshots })
    }

    if (action === 'load') {
      if (!data || !data.id) {
        return res.status(400).json({ message: 'No snapshot ID provided' })
      }
      const { ObjectId } = require('mongodb')
      const collection = db.collection('cv_snapshots')
      const snapshot = await collection.findOne({ _id: new ObjectId(data.id) })

      if (!snapshot) {
        return res.status(404).json({ message: 'Snapshot not found' })
      }
      return res.status(200).json({ ok: true, data: snapshot.data })
    }

    return res.status(400).json({ message: 'Invalid action' })

  } catch (error: any) {
    console.error('Mongo Error:', error)

    // Surface the most useful piece of the driver error so the admin GUI can
    // show actionable text (and not just 'Database operation failed').
    const raw = error?.message || String(error)
    const code = error?.code || error?.codeName || error?.name
    let hint: string | undefined
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(raw)) {
      hint = 'DNS lookup failed — check the host portion of the connection string.'
    } else if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(raw)) {
      hint = 'Network blocked — add this IP to your Atlas allowlist, or set 0.0.0.0/0 for testing.'
    } else if (/Authentication failed|bad auth|password|user/i.test(raw)) {
      hint = 'Authentication failed — verify the user and password in the connection string.'
    } else if (/Server selection timed out|ServerSelection/i.test(raw)) {
      hint = 'Atlas did not accept the connection in time — IP allowlist is the most common cause.'
    } else if (/TLS|SSL/i.test(raw)) {
      hint = 'TLS handshake failed — make sure mongodb+srv is used and the cluster is running.'
    }

    return res.status(500).json({
      ok: false,
      message: hint || raw,
      error: raw,
      code,
      hint,
    })
  } finally {
    if (client) {
      await client.close()
    }
  }
}
