/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports -- CommonJS config file */
const fs = require('fs')
const path = require('path')
const { buildCsp } = require('./lib/csp')

/**
 * Installed version of every direct dependency, read from node_modules when
 * the build starts. lib/stack.ts (/uses, /colophon, /api/stack) shows these
 * instead of the floors of the semver ranges in package.json; the standalone
 * server only ships the node_modules it traced, so build- and browser-only
 * packages (typescript, @tiptap/*, @dnd-kit/*) could not be read at runtime.
 */
function installedDependencyVersions() {
  const out = {}
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))
    for (const name of Object.keys({ ...pkg.devDependencies, ...pkg.dependencies })) {
      try {
        const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, 'node_modules', name, 'package.json'), 'utf8'))
        if (typeof version === 'string') out[name] = version
      } catch {
        // Not installed: lib/stack.ts shows no version for it.
      }
    }
  } catch {
    // No readable package.json: lib/stack.ts falls back to node_modules.
  }
  return out
}

// Bundler: webpack. Next 16 defaults to Turbopack; package.json passes
// --webpack to `next dev` and `next build` (and so do the Dockerfile and CI,
// through `yarn build`), keeping the chunking that scripts/perf-budget.mjs
// measures, the standalone trace this image was verified with and the
// `webpack` hook below (a plain `next build` would use Turbopack and ignore it).
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Inlined at build time wherever process.env.STACK_INSTALLED_VERSIONS is
  // read — only lib/stack.ts, which is server code.
  env: { STACK_INSTALLED_VERSIONS: JSON.stringify(installedDependencyVersions()) },
  // Pin the tracing root to this project: a stray lockfile in a parent
  // directory would otherwise make Next trace from there and nest the
  // standalone output (server.js) under the parent's relative path.
  outputFileTracingRoot: path.join(__dirname),
  // /api/og (Node runtime) reads its brand fonts from assets/og at request
  // time; make sure the standalone output carries them.
  outputFileTracingIncludes: { '/api/og': ['./assets/og/*.ttf'] },
  reactStrictMode: true,
  // ISR pages answer `s-maxage=<revalidate>, stale-while-revalidate=<expireTime
  // - revalidate>`: a CDN may serve a stale copy for at most a day after it
  // went stale (the default is a year), while it refetches in the background.
  expireTime: 86400,
  // Don't publish full client source (incl. the admin UI) as .map files.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // No on-request image optimization: /_next/image runs sharp/libheif on
  // arbitrary requests (the AVIF RCE GHSA-2xp9-vwfh-vxw4 and memory-DoS
  // advisories). Images are resized and converted at upload time instead, so
  // next/image emits original URLs and /_next/image answers 404.
  images: { unoptimized: true },
  experimental: {
    // Back / Forward return to the previous scroll position instead of the
    // top. Next saves each history entry's position and restores it in the
    // commit that renders the page; pages/_app.tsx re-applies it after the
    // framer-motion page swap (components/Common/scrollRestore.ts).
    scrollRestoration: true,
  },
  // Next 16's `next/server` entry (middleware.ts imports NextResponse from it)
  // re-exports App Router helpers whose module calls process.cwd() on a code
  // path that never runs in middleware, so the edge compiler warns "A Node.js
  // API is used (process.cwd …) which is not supported in the Edge Runtime"
  // (still so in Next 16.4). Silence exactly that warning from exactly that
  // Next module: any other Node API in edge code still surfaces.
  webpack(webpackConfig) {
    webpackConfig.ignoreWarnings = [
      ...(webpackConfig.ignoreWarnings || []),
      {
        module: /[\\/]node_modules[\\/]next[\\/]dist[\\/]esm[\\/]server[\\/]app-render[\\/]dynamic-rendering\.js/,
        message: /A Node\.js API is used \(process\.cwd /,
      },
    ]
    return webpackConfig
  },
  // Route every /uploads/* request to the runtime file server BEFORE Next's
  // static handler runs. With `output: 'standalone'`, that static handler only
  // knows about files present in public/ at BUILD time, so runtime-uploaded
  // images 404. `beforeFiles` runs ahead of the filesystem check; the
  // destination (/api/uploads/*) doesn't match `/uploads/:path*`, so there is
  // no rewrite loop.
  // /.well-known/security.txt (RFC 9116) is generated per request from the
  // public CV contact and a rolling expiry date (pages/api/security-txt.ts).
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/uploads/:path*', destination: '/api/uploads/:path*' },
        { source: '/.well-known/security.txt', destination: '/api/security-txt' },
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

module.exports = nextConfig
