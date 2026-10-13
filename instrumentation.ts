// Next.js instrumentation hook. `register` runs once per server/edge runtime
// on startup; only the Node runtime has work to do:
//   - starts the scheduled, change-aware backups (lib/backupSchedule) — never
//     during `next build`, and only once per process;
//   - adds `Cache-Control: no-transform` to HTML documents
//     (lib/htmlNoTransform: keeps Cloudflare from injecting its analytics
//     beacon).
// Both imports are dynamic and sit inside the `NEXT_RUNTIME === 'nodejs'`
// block (keep that shape: the bundler drops the block from the edge bundle
// only when the import is nested in it), so the edge bundle never contains
// fs/SQLite code.

type InstrumentationGlobal = typeof globalThis & { __backupScheduleStarted?: boolean }

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
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      const { installHtmlNoTransform } = await import('./lib/htmlNoTransform')
      installHtmlNoTransform()
    }
  }
}
