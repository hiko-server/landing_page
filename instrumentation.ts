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
//   - removes the persisted copies of ISR pages whose content no longer
//     exists — deleted or unpublished posts and case studies, /publications
//     without a public paper (lib/isrPages: Next keeps the last 200 copy on
//     disk even after a page turned 404, and would serve it again). Like
//     everything imported here it must not reach React client APIs.
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
        const { forgetVanishedContentPages } = await import('./lib/isrPages')
        const { paths } = forgetVanishedContentPages()
        if (paths.length) {
          const { log } = await import('./lib/log')
          log.info('removed the persisted copies of pages that no longer exist; they answer 404', { paths })
        }
      } catch (err) {
        const { log } = await import('./lib/log')
        log.warn('could not remove the persisted copies of pages that no longer exist', { err })
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
        // Next 16 reports errors thrown in proxy.ts as routeType 'proxy' ('middleware' before).
        kind:
          context?.routeType === 'route'
            ? 'route'
            : context?.routeType === 'proxy' || context?.routeType === 'middleware'
              ? 'proxy'
              : 'render',
        route: context?.routePath || null,
        path: request?.path || null,
      })
    } catch {
      // The error monitor must never turn one failure into two.
    }
  }
}
