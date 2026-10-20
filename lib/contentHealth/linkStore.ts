import fs from 'fs'
import path from 'path'
import type { LinkRecord } from './linkCheck'
import type { LinkRunInfo, LinkTrigger } from './types'

/**
 * Where link-check results live (SERVER-ONLY): data/content-health/links.json.
 *
 * Why a file of its own and not the content store's kv table: every kv write
 * is mirrored to R2 and moves the content fingerprint the scheduled backups
 * compare (lib/backupSchedule), so a daily link check stored there would
 * upload to R2 and force a full-site backup every day although no content
 * changed. The results are derived data — losing them only means the next
 * run checks everything again — so they stay on the server: a file under
 * data/ survives restarts and deploys (the data volume), is never mirrored
 * to R2 and never goes into backups (lib/backup packs content.db, the
 * version snapshots, uploads and the inbox only). Written atomically
 * (temp file + rename); a missing or unreadable file reads as empty.
 */

export type LinkStoreFile = {
  version: 1
  lastRun: LinkRunInfo | null
  links: Record<string, LinkRecord>
}

const EMPTY: LinkStoreFile = { version: 1, lastRun: null, links: {} }

export function linkStorePath(): string {
  return path.join(process.cwd(), 'data', 'content-health', 'links.json')
}

const isObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

export function readLinkStore(): LinkStoreFile {
  let raw: string
  try {
    raw = fs.readFileSync(linkStorePath(), 'utf8')
  } catch {
    return { ...EMPTY, links: {} }
  }
  try {
    const data = JSON.parse(raw)
    if (!isObject(data) || data.version !== 1) return { ...EMPTY, links: {} }
    const links: Record<string, LinkRecord> = {}
    if (isObject(data.links)) {
      for (const [k, v] of Object.entries(data.links)) {
        if (isObject(v) && typeof v.outcome === 'string' && typeof v.checkedAt === 'number')
          links[k] = v as LinkRecord
      }
    }
    return {
      version: 1,
      lastRun: isObject(data.lastRun) ? (data.lastRun as LinkRunInfo) : null,
      links,
    }
  } catch {
    return { ...EMPTY, links: {} }
  }
}

export function writeLinkStore(data: LinkStoreFile): void {
  const file = linkStorePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8')
  fs.renameSync(tmp, file)
}

// ── Process state (globalThis: instrumentation and the API routes are separate webpack runtimes) ──

export type LinkRuntime = {
  running: boolean
  trigger: LinkTrigger | null
  startedAt: number | null
  done: number
  total: number
}

type RuntimeGlobal = typeof globalThis & { __contentHealthLinks?: LinkRuntime }

export function linkRuntime(): LinkRuntime {
  const g = globalThis as RuntimeGlobal
  if (!g.__contentHealthLinks)
    g.__contentHealthLinks = { running: false, trigger: null, startedAt: null, done: 0, total: 0 }
  return g.__contentHealthLinks
}
