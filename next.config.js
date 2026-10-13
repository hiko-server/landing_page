/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS config file */
const path = require('path')
const { buildCsp } = require('./lib/csp')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Pin the tracing root to this project: a stray lockfile in a parent
  // directory would otherwise make Next 15 trace from there and nest the
  // standalone output (server.js) under the parent's relative path.
  outputFileTracingRoot: path.join(__dirname),
  reactStrictMode: true,
  // Don't publish full client source (incl. the admin UI) as .map files.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // No on-request image optimization: /_next/image runs sharp/libheif on
  // arbitrary requests (the AVIF RCE GHSA-2xp9-vwfh-vxw4 and memory-DoS
  // advisories). Images are resized and converted at upload time instead, so
  // next/image emits original URLs and /_next/image answers 404.
  images: { unoptimized: true },
  // instrumentation.ts is stable in Next 15 (no flag needed).
  experimental: {
    // Back / Forward return to the previous scroll position instead of the
    // top. Next saves each history entry's position and restores it in the
    // commit that renders the page; pages/_app.tsx re-applies it after the
    // framer-motion page swap (components/Common/scrollRestore.ts).
    scrollRestoration: true,
  },
  // The server SDK (imported by instrumentation.ts) pulls in OpenTelemetry's
  // runtime instrumentation, which loads modules through a computed require.
  // Webpack flags that as "Critical dependency" although it is intended and
  // harmless on Node. withSentryConfig silences exactly these two; do the same
  // when the build is not wrapped, so the build output stays warning-free.
  webpack(webpackConfig) {
    webpackConfig.ignoreWarnings = [
      ...(webpackConfig.ignoreWarnings || []),
      { module: /@opentelemetry[\\/]instrumentation/, message: /Critical dependency/ },
      { module: /require-in-the-middle/, message: /Critical dependency/ },
    ]
    return webpackConfig
  },
  // Route every /uploads/* request to the runtime file server BEFORE Next's
  // static handler runs. With `output: 'standalone'`, that static handler only
  // knows about files present in public/ at BUILD time, so runtime-uploaded
  // images 404. `beforeFiles` runs ahead of the filesystem check; the
  // destination (/api/uploads/*) doesn't match `/uploads/:path*`, so there is
  // no rewrite loop.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/uploads/:path*', destination: '/api/uploads/:path*' },
      ],
    }
  },
  async headers() {
    // Single source of truth shared with middleware.ts (see lib/csp.js) so the
    // two CSP headers can no longer drift into a surprising intersection.
    const csp = buildCsp()

    const headers = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'Content-Security-Policy', value: csp },
    ]

    return [
      { source: '/:path*', headers },
      // Static brand imagery rarely changes — cache hard at the browser + CDN.
      // (Not fingerprinted, so 30d + SWR rather than immutable, so an updated
      // image still propagates without forcing a filename change.)
      {
        source: '/images/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }],
      },
    ]
  },
}

// Sentry is opt-in at BUILD time. NEXT_PUBLIC_SENTRY_DSN is inlined into the
// client bundle (it arrives as a Docker build arg), so without it there is
// nothing the browser SDK could report to — and then the build is not wrapped
// at all: no client SDK in the shared _app chunk (~120 KB raw / ~40 KB gzip),
// no auto-instrumentation loaders. The server/edge SDK still initialises from
// instrumentation.ts whenever SENTRY_DSN is present at runtime.
//
// When enabled, unused SDK code paths are compiled out: debug logging and
// Session Replay (the app never adds the replay integration) everywhere, and
// browser tracing in the CLIENT bundle unless a non-zero
// NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE is set. Server/edge tracing is left
// intact because SENTRY_TRACES_SAMPLE_RATE is a runtime setting. Source maps
// upload only when SENTRY_ORG + SENTRY_PROJECT + SENTRY_AUTH_TOKEN are all set.
const sentryDsn = (process.env.NEXT_PUBLIC_SENTRY_DSN || '').trim()
const clientTracing = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0) > 0

if (sentryDsn) {
  const { withSentryConfig } = require('@sentry/nextjs')
  const config = clientTracing
    ? nextConfig
    : {
        ...nextConfig,
        webpack(webpackConfig, context) {
          const cfg = nextConfig.webpack(webpackConfig, context)
          if (!context.isServer) cfg.plugins.push(new context.webpack.DefinePlugin({ __SENTRY_TRACING__: false }))
          return cfg
        },
      }
  module.exports = withSentryConfig(config, {
    silent: true,
    telemetry: false,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    widenClientFileUpload: false,
    disableLogger: true,
    bundleSizeOptimizations: {
      excludeDebugStatements: true,
      excludeReplayShadowDom: true,
      excludeReplayIframe: true,
      excludeReplayWorker: true,
    },
  })
} else {
  module.exports = nextConfig
}
