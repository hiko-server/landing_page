// Next.js instrumentation hook (enabled via experimental.instrumentationHook in
// next.config.js for Next 14). Runs once per server/edge runtime on startup and
// loads the matching Sentry init. Both inits are inert without a DSN.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
