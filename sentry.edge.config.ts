// Edge-runtime Sentry initialisation (middleware) — loaded from
// instrumentation.ts when the runtime is 'edge' and a DSN is configured.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
  })
}
