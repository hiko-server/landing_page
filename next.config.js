/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports -- CommonJS config file */
const fs = require('fs')
const path = require('path')
const { STATIC_SECURITY_HEADERS, crossOriginResourcePolicy } = require('./lib/securityHeaders')

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
// measures and the standalone trace this image was verified with.
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
  reactStrictMode: true,
  // ISR pages send `s-maxage=<revalidate>, stale-while-revalidate=<expireTime
  // − revalidate>`. A day bounds how long the edge may keep serving a stale
  // copy when the origin cannot regenerate (default: a year), while it
  // refetches in the background; saves purge the edge immediately anyway
  // (lib/revalidate notifyEdge).
  expireTime: 86400,
  // The PDF CV renderer (lib/cvExport/pdf.ts, /api/cv/export) stays a plain
  // Node require at runtime: pdfkit reads its own data files relative to its
  // install location, and the fonts it embeds are read from assets/ (traced
  // into the standalone build below).
  serverExternalPackages: ['pdfkit', 'fontkit', 'linebreak'],
  // Runtime assets read from disk at request time, so the standalone output
  // carries them: /api/og (Node runtime) reads its brand fonts from
  // assets/og; the PDF CV embeds Geist and the Noto Sans SC subset.
  outputFileTracingIncludes: {
    '/api/og': ['./assets/og/*.ttf'],
    '/api/cv/export': ['./assets/og/Geist-Regular.ttf', './assets/og/Geist-SemiBold.ttf', './assets/pdf/**/*'],
  },
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
  // Route every /uploads/* request to the runtime file server BEFORE Next's
  // static handler runs. With `output: 'standalone'`, that static handler only
  // knows about files present in public/ at BUILD time, so runtime-uploaded
  // images 404. `beforeFiles` runs ahead of the filesystem check; the
  // destination (/api/uploads/*) doesn't match `/uploads/:path*`, so there is
  // no rewrite loop.
  // /.well-known/security.txt (RFC 9116) is generated per request from the
  // public CV contact and a rolling expiry date (pages/api/security-txt.ts).
  // The downloadable CVs keep stable URLs (/cv.pdf, /cv/zh.json, …) served by
  // /api/cv/export (lib/cvExport/files.ts lists them).
  async rewrites() {
    const cvFiles = ['pdf', 'txt', 'json'].flatMap((format) => [
      { source: `/cv.${format}`, destination: `/api/cv/export?lang=en&format=${format}` },
      { source: `/cv/zh.${format}`, destination: `/api/cv/export?lang=zh&format=${format}` },
    ])
    return {
      beforeFiles: [
        { source: '/uploads/:path*', destination: '/api/uploads/:path*' },
        { source: '/.well-known/security.txt', destination: '/api/security-txt' },
        ...cvFiles,
        // The Markdown twin of every published post and case study, at its
        // address plus ".md" (llmstxt.org), served by /api/md (G9).
        { source: '/blog/:slug.md', destination: '/api/md?collection=blog&slug=:slug' },
        { source: '/work/:slug.md', destination: '/api/md?collection=work&slug=:slug' },
      ],
    }
  },
  async headers() {
    // The page-independent security headers (lib/securityHeaders.js) on
    // everything: proxy.ts sends the same values plus the hash-based CSP, the
    // Trusted Types report-only policy and the per-path
    // Cross-Origin-Resource-Policy on every route it handles. It skips the
    // fingerprinted /_next/static assets and /favicon.ico (not documents, no
    // script runs in them), which get their CORP here. No CSP here: it carries
    // the hashes of the inline scripts, computed from TypeScript constants this
    // file cannot load (lib/csp.js), and a second, hash-less CSP would be
    // enforced as an intersection.
    return [
      { source: '/:path*', headers: STATIC_SECURITY_HEADERS },
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cross-Origin-Resource-Policy', value: crossOriginResourcePolicy('/_next/static/') }],
      },
      {
        source: '/favicon.ico',
        headers: [{ key: 'Cross-Origin-Resource-Policy', value: crossOriginResourcePolicy('/favicon.ico') }],
      },
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
