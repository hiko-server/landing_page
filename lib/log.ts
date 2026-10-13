/**
 * Structured server logging.
 *
 * Production: one JSON object per line on stdout/stderr (docker logs, any
 * log shipper can parse it). Development: a compact human-readable line.
 * Secret-looking fields are redacted before anything is written, and Error
 * values are expanded to {name, message, stack}.
 *
 *   log.info('backup created', { key, bytes })
 *   log.error('upload failed', { err, requestId })
 *   const l = log.child({ requestId }); l.warn('slow', { ms })
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|private[-_]?key|credential/i

function threshold(): number {
  const raw = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel
  return ORDER[raw] ?? (process.env.NODE_ENV === 'production' ? ORDER.info : ORDER.debug)
}

function serializeError(err: Error): Record<string, unknown> {
  const out: Record<string, unknown> = { name: err.name, message: err.message }
  if (err.stack) out.stack = err.stack.split('\n').slice(0, 12).join('\n')
  const code = (err as { code?: unknown }).code
  if (code !== undefined) out.code = code
  return out
}

/** Redact secrets and make values JSON-safe (depth-limited, cycle-safe). */
export function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) return serializeError(value)
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'string' && value.length > 4000) return `${value.slice(0, 4000)}…`
    return value
  }
  if (seen.has(value)) return '[circular]'
  if (depth > 5) return '[depth]'
  seen.add(value)
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1, seen))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) ? '[redacted]' : sanitize(v, depth + 1, seen)
  }
  return out
}

function write(level: LogLevel, msg: string, base: LogFields, fields?: LogFields) {
  if (ORDER[level] < threshold()) return
  const data = sanitize({ ...base, ...(fields || {}) }) as LogFields
  const sink = level === 'error' || level === 'warn' ? console.error : console.log
  if (process.env.NODE_ENV === 'production') {
    sink(JSON.stringify({ t: new Date().toISOString(), level, msg, ...data }))
  } else {
    const extra = Object.keys(data).length ? ` ${JSON.stringify(data)}` : ''
    sink(`[${level}] ${msg}${extra}`)
  }
}

export type Logger = {
  debug: (msg: string, fields?: LogFields) => void
  info: (msg: string, fields?: LogFields) => void
  warn: (msg: string, fields?: LogFields) => void
  error: (msg: string, fields?: LogFields) => void
  child: (fields: LogFields) => Logger
}

function make(base: LogFields): Logger {
  return {
    debug: (m, f) => write('debug', m, base, f),
    info: (m, f) => write('info', m, base, f),
    warn: (m, f) => write('warn', m, base, f),
    error: (m, f) => write('error', m, base, f),
    child: (f) => make({ ...base, ...f }),
  }
}

export const log: Logger = make({})
