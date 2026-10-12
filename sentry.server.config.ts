// Node (server) Sentry initialisation — loaded from instrumentation.ts when the
// runtime is 'nodejs' and a DSN is configured. Captures API-route /
// getServerSideProps / unhandled server errors.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
  })
}
