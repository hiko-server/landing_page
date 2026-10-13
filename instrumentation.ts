// Next.js instrumentation hook. `register` runs once per server/edge runtime
// on startup; only the Node runtime has work to do:
//   - installs the first-party error capture (lib/errors/server): warn / error
//     log entries feed the admin System panel's recent-log ring, and errors
//     carrying an exception are recorded in the error monitor;
//   - migrates the SQLite stores (content.db, analytics.db, auth.db) at boot
//     instead of on the first request (scripts/db; each migration is
//     transactional and idempotent) — never during `next build`;
//   - starts the scheduled, change-aware backups (lib/backupSchedule) and the
//     weekly restore drill (lib/restoreDrill) — never during `next build`,
//     and only once per process;
//   - adds `Cache-Control: no-transform` to HTML documents
//     (lib/htmlNoTransform: keeps Cloudflare from injecting its analytics
//     beacon).
// `onRequestError` records errors thrown while rendering a page or running
// its data function (API routes catch their own errors in lib/apiHandler,
// whose log line the capture above records).
// Every import is dynamic and sits inside the `NEXT_RUNTIME === 'nodejs'`
// block (keep that shape: the bundler drops the block from the edge bundle
// only when the import is nested in it), so the edge bundle never contains
// fs/SQLite code.

type InstrumentationGlobal = typeof globalThis & { __backupScheduleStarted?: boolean; __restoreDrillStarted?: boolean }

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const g = globalThis as InstrumentationGlobal
    const building = process.env.NEXT_PHASE === 'phase-production-build'
    if (!building) {
      const { installServerErrorCapture } = await import('./lib/errors/server')
      installServerErrorCapture()
      const { log } = await import('./lib/log')
      try {
        const [{ getDb }, { getAnalyticsDb }, { getAuthDb }] = await Promise.all([
          import('./lib/db'),
          import('./lib/analytics/db'),
          import('./lib/adminAuth/db'),
        ])
        getDb()
        getAnalyticsDb()
        getAuthDb()
      } catch (err) {
        log.error('could not open or migrate a database at startup', { err })
      }
    }
    if (!building && !g.__backupScheduleStarted) {
      g.__backupScheduleStarted = true
      try {
        const { startBackupSchedule } = await import('./lib/backupSchedule')
        startBackupSchedule()
      } catch (err) {
        const { log } = await import('./lib/log')
        log.error('could not start the backup schedule', { err })
      }
    }
    if (!building && !g.__restoreDrillStarted) {
      g.__restoreDrillStarted = true
      try {
        const { startRestoreDrillSchedule } = await import('./lib/restoreDrill')
        startRestoreDrillSchedule()
      } catch (err) {
        const { log } = await import('./lib/log')
        log.error('could not start the restore drill schedule', { err })
      }
    }
    if (!building) {
      const { installHtmlNoTransform } = await import('./lib/htmlNoTransform')
      installHtmlNoTransform()
    }
  }
}

type RequestInfo = { path?: string; method?: string }
type ErrorContext = { routerKind?: string; routePath?: string; routeType?: string }

export async function onRequestError(error: unknown, request: RequestInfo, context: ErrorContext) {
  // Same shape as register(): the import must sit inside the nodejs block.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { captureServerError } = await import('./lib/errors/server')
      captureServerError(error, {
        kind: context?.routeType === 'route' ? 'route' : context?.routeType === 'middleware' ? 'middleware' : 'render',
        route: context?.routePath || null,
        path: request?.path || null,
      })
    } catch {
      // The error monitor must never turn one failure into two.
    }
  }
}
