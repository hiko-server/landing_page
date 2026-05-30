// Browser-side Sentry initialisation.
//
// Inert by default: NEXT_PUBLIC_SENTRY_DSN is inlined into the client bundle at
// BUILD time, and with no DSN the SDK initialises disabled and sends nothing.
// To activate, set NEXT_PUBLIC_SENTRY_DSN and rebuild.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: !!dsn,
  // Performance tracing is opt-in via env (0 = off) to avoid overhead/quota.
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0),
  // Session Replay off by default (bundle weight + privacy); enable later.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
})
