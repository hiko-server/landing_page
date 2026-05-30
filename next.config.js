/** @type {import('next').NextConfig} */
const { i18n } = require('./next-i18next.config')
const path = require('path')
const { buildCsp } = require('./lib/csp')
const { withSentryConfig } = require('@sentry/nextjs')

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
  poweredByHeader: false,
  // Required on Next 14 so instrumentation.ts runs on server/edge startup and
  // loads the Sentry init for each runtime. (Stable/removed in Next 15.)
  experimental: { instrumentationHook: true },
  // Ensure styled-components renders consistently on SSR to avoid layout
  // mismatches when landing directly on routes like /cv.
  compiler: { styledComponents: true },
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
    ]
  },
}

// Wrap with Sentry. Fully inert without a DSN; source maps upload only when
// SENTRY_ORG + SENTRY_PROJECT + SENTRY_AUTH_TOKEN are all set, otherwise the
// plugin just instruments the build and skips upload. `silent` keeps logs clean.
module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: false,
  disableLogger: true,
})


// module.exports = {
    
// }
