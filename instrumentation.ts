// Next.js instrumentation hook (enabled via experimental.instrumentationHook in
// next.config.js for Next 14). Runs once per server/edge runtime on startup and
// loads the matching Sentry init — only when a DSN is configured, so a
// deployment without Sentry never even loads the SDK.
export async function register() {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
