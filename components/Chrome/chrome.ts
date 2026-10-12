/**
 * Pure helpers + shared data for the persistent site chrome (header, footer,
 * mobile drawer). Framework-free so they are unit-tested in
 * tests/s5-chrome.test.ts.
 */

export type NavLink = { name: string; url: string }

/** Primary navigation — header (lg+), mobile drawer and footer all render this list. */
export const PRIMARY_LINKS: readonly NavLink[] = [
  { name: 'Home', url: '/' },
  { name: 'About', url: '/about' },
  { name: 'Work', url: '/work' },
  { name: 'Writing', url: '/blog' },
  { name: 'CV', url: '/cv' },
  { name: 'Now', url: '/now' },
  { name: 'Uses', url: '/uses' },
  { name: 'Contact', url: '/contact' },
]

export const SOCIAL_LINKS = [
  { name: 'GitHub', url: 'https://github.com/HikoPLi' },
  { name: 'GitLab', url: 'https://gitlab.com/HikoPLi' },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/in/liyanpeihiko/' },
  { name: 'WhatsApp', url: 'https://wa.me/85200000000' },
] as const

export type SocialName = (typeof SOCIAL_LINKS)[number]['name']

/**
 * Routes that render WITHOUT the persistent header/footer (matched against
 * router.pathname, i.e. the page file's route pattern):
 *  - /admin/db-config is a standalone setup screen with its own back button;
 *  - /500 and /_error stay dependency-light so they render even when
 *    something upstream is failing.
 */
export const CHROMELESS_ROUTES: readonly string[] = ['/admin/db-config', '/500', '/_error']

export function routeHasChrome(pathname: string): boolean {
  return !CHROMELESS_ROUTES.includes(pathname)
}

/** Current route matches a nav link (exact for "/", segment prefix otherwise). */
export function isActiveRoute(pathname: string, url: string): boolean {
  if (url === '/') return pathname === '/'
  return pathname === url || pathname.startsWith(`${url}/`)
}

/** Sign-in flow screens: crossing one of these can change the session. */
export const AUTH_ROUTES: readonly string[] = ['/admin/login', '/admin/reset', '/admin/forgot']

const isAdminArea = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/')

/**
 * The header asks /api/admin/session once on mount. Because the chrome is now
 * persistent it must not re-ask on every page; it re-checks only when a
 * navigation can actually have changed the answer: entering or leaving a
 * sign-in screen, or entering the admin area while not known to be signed in.
 */
export function shouldRecheckSession(prevPathname: string, nextPathname: string, isAdmin: boolean): boolean {
  if (prevPathname === nextPathname) return false
  if (AUTH_ROUTES.includes(prevPathname) || AUTH_ROUTES.includes(nextPathname)) return true
  return isAdminArea(nextPathname) && !isAdmin
}

/** `<html lang>` value from a page's `props.lang` (contract E); 'en' unless a valid BCP-47 tag. */
export function resolveHtmlLang(lang: unknown): string {
  if (typeof lang !== 'string') return 'en'
  const tag = lang.trim()
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(tag) ? tag : 'en'
}

/** Strip a leading "www." and any ":port" so the wordmark reads as the bare domain. */
export function normalizeHost(host: string): string {
  return host.replace(/^www\./i, '').replace(/:\d+$/, '')
}

/** Split "lucian-dev.com" into ["lucian-dev", ".com"] so the suffix can take the accent. */
export function splitBrand(brand: string): [head: string, tail: string] {
  const dot = brand.lastIndexOf('.')
  return dot > 0 ? [brand.slice(0, dot), brand.slice(dot)] : [brand, '']
}

/** Human "time since" label for the header's last-commit pill. */
export function formatAge(fromIso: string, now: number): string | null {
  const then = new Date(fromIso).getTime()
  if (!Number.isFinite(then)) return null
  const minutes = Math.max(0, Math.floor((now - then) / 60000))
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 60 / 24)}d ago`
}
