import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { buildCsp } from './lib/csp'

/**
 * Root middleware.
 *
 * Two responsibilities:
 *
 * 1.  **Security headers** for every response (frame deny, HSTS, CSP, etc).
 *     These are applied unconditionally.
 *
 * 2.  **Admin gate** for `/admin/*` and `/api/admin/*`. The cookie is
 *     httpOnly so we cannot read it from JavaScript on the page — and
 *     getServerSideProps was missing on most admin pages, which meant the
 *     UI shell rendered for unauthenticated visitors (the APIs still
 *     returned 401, so no data leak, but the screen still appeared and
 *     felt like a breach).
 *
 *     Edge middleware runs **before** any page or API route, verifies the
 *     JWT signature with `jose` (edge-compatible — `jsonwebtoken` is not),
 *     and redirects guests to `/admin/login?next=<original>`. Admin
 *     pages without auth never render even for a frame.
 *
 *     Whitelisted public admin routes (login, forgot, reset) stay
 *     reachable. The session/check endpoint stays public so the login
 *     page can poll it without a redirect loop.
 */

// Routes under /admin and /api/admin that MUST stay reachable while logged
// out. Anything else is gated.
const PUBLIC_ADMIN_PAGE_PATHS = new Set<string>([
  '/admin/login',
  '/admin/forgot',
  '/admin/reset',
])
const PUBLIC_ADMIN_API_PATHS = new Set<string>([
  '/api/admin/session', // /admin/login polls this; must be reachable to return 401
  '/api/admin/logout',  // logging out doesn't require an active session
])
// Auth lives under /api/auth/*, never /api/admin/*, so it's not gated here.

async function verifyAdminJwt(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const secret = process.env.JWT_SECRET
  if (!secret || secret === 'change-me') return false
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
    })
    return (payload as { role?: string })?.role === 'admin'
  } catch {
    return false
  }
}

function applySecurityHeaders(res: NextResponse, opts: { adminContext: boolean }) {
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')

  // CSP — single source of truth shared with next.config.js (see lib/csp.js),
  // so the two headers can no longer drift into a surprising intersection.
  res.headers.set('Content-Security-Policy', buildCsp())

  // Keep admin pages out of search indexes (defence-in-depth — even with
  // the gate, we don't want googlebot caching the login page).
  if (opts.adminContext) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    // Caches between us and the user shouldn't store admin responses.
    res.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate')
  }
  return res
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/')
  const isAdminApi = pathname.startsWith('/api/admin/')

  if (isAdminPage || isAdminApi) {
    const allowed = isAdminPage
      ? PUBLIC_ADMIN_PAGE_PATHS.has(pathname)
      : PUBLIC_ADMIN_API_PATHS.has(pathname)

    if (!allowed) {
      const token = req.cookies.get('cv_admin_token')?.value
      const ok = await verifyAdminJwt(token)
      if (!ok) {
        if (isAdminApi) {
          // APIs: return JSON 401 instead of redirecting (clients expect that).
          const res = NextResponse.json(
            { error: 'Unauthorized', code: 'NO_SESSION' },
            { status: 401 },
          )
          return applySecurityHeaders(res, { adminContext: true })
        }
        // Pages: redirect to login, preserve where they meant to go.
        const url = req.nextUrl.clone()
        url.pathname = '/admin/login'
        url.search = ''
        url.searchParams.set('next', pathname + (req.nextUrl.search || ''))
        const res = NextResponse.redirect(url)
        return applySecurityHeaders(res, { adminContext: true })
      }
    }
  }

  return applySecurityHeaders(NextResponse.next(), { adminContext: isAdminPage || isAdminApi })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
