/** @type {import('next').NextConfig} */
const { i18n } = require('./next-i18next.config')
const path = require('path')

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
  poweredByHeader: false,
  // Ensure styled-components renders consistently on SSR to avoid layout
  // mismatches when landing directly on routes like /cv.
  compiler: { styledComponents: true },
  async headers() {
    const csp = [
      "default-src 'self'",
      // Inline JSON-LD and Chakra SSR styles. 'unsafe-eval' is required by
      // next-mdx-remote, which evaluates compiled MDX on the client via
      // new Function() (/now, /uses, /blog/*, /work/*). This header and the
      // one in middleware.ts are both emitted; the browser enforces their
      // intersection, so 'unsafe-eval' must be present in BOTH.
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://api.github.com https://hcaptcha.com https://*.hcaptcha.com wss://stream.binance.com https://api.binance.com",
      "frame-src https://hcaptcha.com https://*.hcaptcha.com",
      "font-src 'self' https: data:",
      "media-src 'self' https: blob:",
      'upgrade-insecure-requests',
    ].join('; ')

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
