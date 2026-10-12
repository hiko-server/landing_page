// Browser-side Sentry initialisation.
//
// Only bundled when NEXT_PUBLIC_SENTRY_DSN is set at BUILD time: next.config.js
// applies withSentryConfig (which injects this file) only in that case, so a
// build without a DSN ships no client SDK at all.
//
// Tracing is opt-in via NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE (> 0); otherwise
// the build also tree-shakes the tracing code (bundleSizeOptimizations). Session
// Replay is not used — its integration is never added and its code is excluded.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0),
  })
}
