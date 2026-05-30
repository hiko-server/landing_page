/** @type {import('next').NextConfig} */
const { i18n } = require('./next-i18next.config')
const path = require('path')
const { buildCsp } = require('./lib/csp')

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
  poweredByHeader: false,
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

module.exports = nextConfig


// module.exports = {
    
// }
