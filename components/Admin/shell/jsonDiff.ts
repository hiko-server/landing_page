/**
 * Readable structural diff between two JSON documents.
 *
 * Objects are compared key by key, arrays index by index; a key or index
 * present on only one side is reported once as added / removed with its
 * whole value rather than recursing into it. Paths use JS accessor syntax
 * (`en.sections[2].experiences[0].companyName`) so they can be scanned and
 * searched.
 */

export type DiffKind = 'added' | 'removed' | 'changed'

export type DiffEntry = {
  path: string
  kind: DiffKind
  before?: unknown
  after?: unknown
}

export type DiffResult = {
  entries: DiffEntry[]
  /** Total number of differences, including any beyond `limit`. */
  total: number
  counts: Record<DiffKind, number>
}

type Json = unknown

const IDENT_RE = /^[A-Za-z_$][\w$]*$/

function isPlainObject(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function joinKey(base: string, key: string): string {
  if (IDENT_RE.test(key)) return base ? `${base}.${key}` : key
  return `${base}[${JSON.stringify(key)}]`
}

function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (isPlainObject(a)) {
    if (!isPlainObject(b)) return false
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
  }
  return false
}

export function diffJson(before: Json, after: Json, limit = 500): DiffResult {
  const entries: DiffEntry[] = []
  const counts: Record<DiffKind, number> = { added: 0, removed: 0, changed: 0 }
  let total = 0

  const push = (e: DiffEntry) => {
    total += 1
    counts[e.kind] += 1
    if (entries.length < limit) entries.push(e)
  }

  const walk = (a: Json, b: Json, path: string) => {
    if (Array.isArray(a) && Array.isArray(b)) {
      const n = Math.max(a.length, b.length)
      for (let i = 0; i < n; i++) {
        const p = `${path}[${i}]`
        if (i >= a.length) push({ path: p, kind: 'added', after: b[i] })
        else if (i >= b.length) push({ path: p, kind: 'removed', before: a[i] })
        else walk(a[i], b[i], p)
      }
      return
    }
    if (isPlainObject(a) && isPlainObject(b)) {
      const keys = [
        ...Object.keys(a),
        ...Object.keys(b).filter((k) => !Object.prototype.hasOwnProperty.call(a, k)),
      ]
      for (const k of keys) {
        const p = joinKey(path, k)
        const inA = Object.prototype.hasOwnProperty.call(a, k)
        const inB = Object.prototype.hasOwnProperty.call(b, k)
        if (!inA) push({ path: p, kind: 'added', after: b[k] })
        else if (!inB) push({ path: p, kind: 'removed', before: a[k] })
        else walk(a[k], b[k], p)
      }
      return
    }
    if (!deepEqual(a, b)) push({ path: path || '(root)', kind: 'changed', before: a, after: b })
  }

  walk(before, after, '')
  return { entries, total, counts }
}

/** Compact, single-line rendering of a JSON value for the diff table. */
export function formatDiffValue(v: unknown, max = 160): string {
  if (v === undefined) return '—'
  let s: string
  try {
    s = JSON.stringify(v) ?? String(v)
  } catch {
    s = String(v)
  }
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
