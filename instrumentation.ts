// Next.js instrumentation hook (stable in Next 15). `register` runs once per
// server/edge runtime on startup:
//   - Node runtime: starts the scheduled, change-aware backups (lib/backupSchedule)
//     — never during `next build`, and only once per process — and loads the
//     server Sentry init when a DSN is configured.
//   - Edge runtime: loads the edge Sentry init when a DSN is configured.
// Both imports are dynamic and sit behind the NEXT_RUNTIME checks, so the edge
// bundle never contains fs/SQLite code and a deployment without Sentry never
// loads the SDK.

type InstrumentationGlobal = typeof globalThis & { __backupScheduleStarted?: boolean }

const sentryDsn = () => process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const g = globalThis as InstrumentationGlobal
    if (process.env.NEXT_PHASE !== 'phase-production-build' && !g.__backupScheduleStarted) {
      g.__backupScheduleStarted = true
      try {
        const { startBackupSchedule } = await import('./lib/backupSchedule')
        startBackupSchedule()
      } catch (err) {
        const { log } = await import('./lib/log')
        log.error('could not start the backup schedule', { err })
      }
    }
    if (sentryDsn()) await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge' && sentryDsn()) {
    await import('./sentry.edge.config')
  }
}

/**
 * Server-side request errors (API routes, getServerSideProps, middleware)
 * go to Sentry when a DSN is configured; the SDK is loaded only then.
 */
export async function onRequestError(...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>) {
  if (!sentryDsn()) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
