import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function middleware(_req: NextRequest) {
  const res = NextResponse.next()
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')

  // CSP: keep permissive enough for Next.js runtime
  const isProd = process.env.NODE_ENV === 'production'
  const csp = [
    "default-src 'self'",
    "frame-ancestors 'none'",
    // Allow inline in both envs to avoid blocking Next hydration/scripts
    isProd
      ? "script-src 'self' 'unsafe-inline' https:"
      : "script-src 'self' 'unsafe-eval' 'unsafe-inline' https:",
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: https:",
    "font-src 'self' https: data:",
    "connect-src 'self' https: ws:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  res.headers.set('Content-Security-Policy', csp)
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
