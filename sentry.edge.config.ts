// Edge-runtime Sentry initialisation (middleware) — loaded from
// instrumentation.ts when the runtime is 'edge'. Inert unless a DSN is set.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
})
