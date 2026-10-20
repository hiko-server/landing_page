import { setLogObserver, type LogFields, type LogLevel } from '../log'
import { pushLogEntry } from '../logBuffer'
import {
  fingerprintOf,
  groupingMessage,
  normalizeErrorPath,
  normalizeRelease,
  scrubStack,
  scrubText,
  topFrame,
} from './scrub'
import { recordError } from './store'

/**
 * Server side of the first-party error monitor.
 *
 *   installServerErrorCapture()   once per process (instrumentation.ts):
 *                                 every warn / error log entry goes to the
 *                                 System panel's recent-log ring
 *                                 (lib/logBuffer.ts), and every error entry
 *                                 that carries an Error (`err`) — the
 *                                 unhandled-API-error line of lib/apiHandler,
 *                                 a failed backup, a failed credential check —
 *                                 is recorded as a server error
 *   captureServerError(err, ctx)  direct capture (instrumentation's
 *                                 onRequestError: page render / data errors)
 *
 * Recorded: error name, scrubbed message and stack (paths relative to the
 * app, no secrets — lib/errors/scrub.ts), the route, the request path without
 * its query, the build. Never the request, its headers or its body. A
 * failure to record is written to stderr directly (not through the logger,
 * which would loop back here).
 */

export type ServerErrorContext = {
  /** 'api' | 'render' | 'log' | 'proxy' … (short slug). */
  kind: string
  route?: string | null
  path?: string | null
  /** The log line that carried the error, prefixed to the message. */
  msg?: string | null
}

type CaptureGlobal = typeof globalThis & {
  __errorCaptureBusy?: boolean
  __errorCaptureInstalled?: boolean
}

function appOrigins(): string[] {
  const cwd = process.cwd()
  return [`${cwd}/.next/server/`, `${cwd}/`, 'file://']
}

/** Record one server error. Never throws. */
export function captureServerError(err: unknown, ctx: ServerErrorContext): void {
  const g = globalThis as CaptureGlobal
  if (g.__errorCaptureBusy) return
  g.__errorCaptureBusy = true
  try {
    const e =
      err instanceof Error
        ? err
        : new Error(typeof err === 'string' ? err : 'Non-Error value thrown')
    const name = /^[A-Za-z_$][\w$.]{0,63}$/.test(e.name) ? e.name : 'Error'
    const base = scrubText(e.message) || '(no message)'
    const message = scrubText(ctx.msg ? `${ctx.msg}: ${base}` : base)
    const stack = scrubStack(e.stack || '', appOrigins())
    const route = ctx.route ? scrubText(ctx.route, 120) : null
    recordError({
      fingerprint: fingerprintOf([
        'server',
        ctx.kind,
        name,
        groupingMessage(message),
        route,
        topFrame(stack),
      ]),
      source: 'server',
      kind: /^[a-z][a-z-]{0,23}$/.test(ctx.kind) ? ctx.kind : 'server',
      name,
      message,
      stack: stack || null,
      path: normalizeErrorPath(ctx.path),
      route,
      release: normalizeRelease(process.env.NEXT_PUBLIC_BUILD_SHA),
      browser: null,
    })
  } catch (recordErr) {
    try {
      process.stderr.write(
        `[errors] could not record a server error: ${recordErr instanceof Error ? recordErr.message : String(recordErr)}\n`
      )
    } catch {
      // stderr unavailable: nothing more to do.
    }
  } finally {
    g.__errorCaptureBusy = false
  }
}

/** The log observer: ring buffer for warn/error, error monitor for error entries carrying an Error. */
export function observeLogEntry(level: LogLevel, msg: string, fields: LogFields): void {
  pushLogEntry(level, msg, fields)
  if (level !== 'error') return
  const err = fields.err
  if (!(err instanceof Error)) return
  const route = typeof fields.route === 'string' ? fields.route : null
  captureServerError(err, { kind: route ? 'api' : 'log', route, msg })
}

/** Install the log observer for this process (idempotent). */
export function installServerErrorCapture(): void {
  const g = globalThis as CaptureGlobal
  if (g.__errorCaptureInstalled) return
  g.__errorCaptureInstalled = true
  setLogObserver(observeLogEntry)
}
