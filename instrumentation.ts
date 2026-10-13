// Next.js instrumentation hook. `register` runs once per server/edge runtime
// on startup; only the Node runtime has work to do:
//   - installs the first-party error capture (lib/errors/server): warn / error
//     log entries feed the admin System panel's recent-log ring, and errors
//     carrying an exception are recorded in the error monitor;
//   - migrates the SQLite stores (content.db, analytics.db, auth.db) at boot
//     instead of on the first request (scripts/db; each migration is
//     transactional and idempotent) — never during `next build`;
//   - starts the scheduled, change-aware backups (lib/backupSchedule), the
//     weekly restore drill (lib/restoreDrill) and the nightly expiry of
//     contact messages (lib/inboxRetention) — never during `next build`, and
//     only once per process;
//   - adds `Cache-Control: no-transform` to HTML documents
//     (lib/htmlNoTransform: keeps Cloudflare from injecting its analytics
//     beacon);
//   - drops the persisted /publications page, which then renders afresh
//     (lib/publicationsCache: Next keeps a 200 copy on disk even after the
//     page turned 404).
// `onRequestError` records errors thrown while rendering a page or running
// its data function (API routes catch their own errors in lib/apiHandler,
// whose log line the capture above records).
// Every import is dynamic and sits inside the `NEXT_RUNTIME === 'nodejs'`
// block (keep that shape: the bundler drops the block from the edge bundle
// only when the import is nested in it), so the edge bundle never contains
// fs/SQLite code.

type InstrumentationGlobal = typeof globalThis & {
  __backupScheduleStarted?: boolean
  __restoreDrillStarted?: boolean
  __inboxRetentionStarted?: boolean
}

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
    if (!building && !g.__inboxRetentionStarted) {
      g.__inboxRetentionStarted = true
      try {
        const { startInboxRetention } = await import('./lib/inboxRetention')
        startInboxRetention()
      } catch (err) {
        const { log } = await import('./lib/log')
        log.error('could not start the contact message expiry', { err })
      }
    }
    if (!building) {
      const { installHtmlNoTransform } = await import('./lib/htmlNoTransform')
      installHtmlNoTransform()
      try {
        const { forgetPersistedPublicationsPage } = await import('./lib/publicationsCache')
        const removed = forgetPersistedPublicationsPage()
        if (removed.length) {
          const { log } = await import('./lib/log')
          log.info('removed the persisted /publications page; it renders afresh', { files: removed.length })
        }
      } catch (err) {
        const { log } = await import('./lib/log')
        log.warn('could not remove the persisted /publications page', { err })
      }
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
