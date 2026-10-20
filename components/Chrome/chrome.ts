/**
 * Pure helpers + shared data for the persistent site chrome (header, footer,
 * mobile drawer). Framework-free so they are unit-tested in
 * tests/s5-chrome.test.ts.
 */

import { safeHref } from '../../lib/url'
import { ADMIN_HINT_COOKIE } from '../../lib/adminHint'
import { fillUi } from '../../lib/uiStrings'
import { CHROME_EN, type ChromeStrings, type NavStrings } from '../../lib/uiStrings/chrome-en'
import { zhHref } from '../../lib/zhRoutes'

/**
 * A navigation link. `base` is the English page it stands for when `url`
 * is another language's version of it ('/zh/blog' for '/blog'), so a
 * Chinese post still marks 文章 as the current section.
 */
export type NavLink = { name: string; url: string; base?: string }

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

/** The dictionary key of each primary page's label (lib/uiStrings/chrome NavStrings). */
export const NAV_KEYS: Readonly<Record<string, keyof NavStrings>> = {
  '/': 'home',
  '/about': 'about',
  '/work': 'work',
  '/blog': 'writing',
  '/cv': 'cv',
  '/publications': 'publications',
  '/now': 'now',
  '/uses': 'uses',
  '/contact': 'contact',
  '/colophon': 'colophon',
}

/**
 * The navigation in the chrome's language (F3): each label from the
 * dictionary and, on a Chinese page (`zh`: the English paths whose Chinese
 * page exists), each link to its Chinese page where there is one
 * (lib/zhRoutes zhHref: /about → /zh/about, /cv → /cv/zh).
 */
export function localizeNav(links: readonly NavLink[], t: ChromeStrings, zh: readonly string[] | null): NavLink[] {
  return links.map((l) => {
    const key = NAV_KEYS[l.url]
    const url = zh ? zhHref(l.url, zh) : l.url
    return { name: key ? t.nav[key] : l.name, url, ...(url !== l.url ? { base: l.url } : {}) }
  })
}

/** /publications: listed only while it has public papers (pageProps.chromePublications). */
export const PUBLICATIONS_LINK: NavLink = { name: 'Publications', url: '/publications' }

/**
 * The primary navigation for what currently exists: Publications follows CV
 * once /publications has a public paper (the page answers 404 until then).
 */
export function navLinksFor({ publications = false }: { publications?: boolean } = {}): readonly NavLink[] {
  if (!publications) return PRIMARY_LINKS
  const cv = PRIMARY_LINKS.findIndex((l) => l.url === '/cv')
  return [...PRIMARY_LINKS.slice(0, cv + 1), PUBLICATIONS_LINK, ...PRIMARY_LINKS.slice(cv + 1)]
}

/**
 * "G then <key>" navigation (Header listens; the ⌘K palette lists them).
 * Contact has no shortcut on purpose ('c' is the CV).
 */
export const NAV_SHORTCUTS: readonly { key: string; url: string }[] = [
  { key: 'h', url: '/' },
  { key: 'a', url: '/about' },
  { key: 'w', url: '/work' },
  { key: 'b', url: '/blog' },
  { key: 'c', url: '/cv' },
  { key: 'n', url: '/now' },
  { key: 'u', url: '/uses' },
]

/** Display label ("G H") of the shortcut for a URL, if it has one. */
export function shortcutLabelFor(url: string): string | undefined {
  const s = NAV_SHORTCUTS.find((n) => n.url === url)
  return s ? `G ${s.key.toUpperCase()}` : undefined
}

/** Target of the second key of a "G then …" sequence, or null. */
export function shortcutTarget(key: string): string | null {
  const k = key.toLowerCase()
  return NAV_SHORTCUTS.find((n) => n.key === k)?.url ?? null
}

/**
 * Built-in profile links, keyed like home.socials. They are only the fallback
 * for when the home document has no socials (see resolveSocialLinks); the
 * owner's Home editor values drive the header, footer and hero. WhatsApp has
 * no built-in link: a phone number belongs in the Home editor, never in the
 * (public) source.
 */
export const SOCIAL_LINKS = [
  { key: 'github', name: 'GitHub', url: 'https://github.com/HikoPLi' },
  { key: 'gitlab', name: 'GitLab', url: 'https://gitlab.com/HikoPLi' },
  { key: 'linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com/in/liyanpeihiko/' },
  { key: 'whatsapp', name: 'WhatsApp', url: '' },
] as const

export type SocialName = (typeof SOCIAL_LINKS)[number]['name']
export type SocialKey = (typeof SOCIAL_LINKS)[number]['key']
export type SocialLink = { key: SocialKey; name: SocialName; url: string }

/**
 * Profile links to render from the PUBLIC home.socials object:
 *   - no socials object at all (no home document yet) → the built-in links;
 *   - a channel whose key is missing → its built-in link, if it has one;
 *   - a channel whose key is present but blank → removed (the owner cleared it);
 *   - otherwise the owner's URL, if it is a safe href (else removed).
 */
export function resolveSocialLinks(socials: unknown): SocialLink[] {
  const builtIn = (s: (typeof SOCIAL_LINKS)[number]): SocialLink[] => (s.url ? [{ ...s }] : [])
  if (!socials || typeof socials !== 'object' || Array.isArray(socials)) return SOCIAL_LINKS.flatMap(builtIn)
  const own = socials as Record<string, unknown>
  const out: SocialLink[] = []
  for (const s of SOCIAL_LINKS) {
    if (!(s.key in own) || own[s.key] === undefined) {
      out.push(...builtIn(s))
      continue
    }
    const url = safeHref(own[s.key])
    if (url) out.push({ key: s.key, name: s.name, url })
  }
  return out
}

/**
 * Routes that render WITHOUT the persistent header/footer (matched against
 * router.pathname, i.e. the page file's route pattern): /500 and /_error stay
 * dependency-light so they render even when something upstream is failing.
 * Every other route, admin screens included, gets the persistent chrome.
 */
export const CHROMELESS_ROUTES: readonly string[] = ['/500', '/_error']

export function routeHasChrome(pathname: string): boolean {
  return !CHROMELESS_ROUTES.includes(pathname)
}

/** Current route matches a nav link (exact for the home pages "/" and "/zh", segment prefix otherwise). */
export function isActiveRoute(pathname: string, url: string): boolean {
  if (url === '/' || url === '/zh') return pathname === url
  return pathname === url || pathname.startsWith(`${url}/`)
}

/** A nav link is the current section: its own route or the English page it stands for (NavLink.base). */
export function isActiveLink(pathname: string, link: NavLink): boolean {
  return isActiveRoute(pathname, link.url) || (!!link.base && isActiveRoute(pathname, link.base))
}

/** Sign-in flow screens: crossing one of these can change the session. */
export const AUTH_ROUTES: readonly string[] = ['/admin/login', '/admin/reset', '/admin/forgot']

const isAdminArea = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/')

/**
 * The header asks /api/admin/session once on mount (when shouldProbeSession
 * allows it). Because the chrome is persistent it must not re-ask on every
 * page; it re-checks only when a navigation can actually have changed the
 * answer: entering or leaving a sign-in screen, or entering the admin area
 * while not known to be signed in.
 */
export function shouldRecheckSession(prevPathname: string, nextPathname: string, isAdmin: boolean): boolean {
  if (prevPathname === nextPathname) return false
  if (AUTH_ROUTES.includes(prevPathname) || AUTH_ROUTES.includes(nextPathname)) return true
  return isAdminArea(nextPathname) && !isAdmin
}

/**
 * Id given to the mobile menu <Drawer>; Chakra renders the dialog element as
 * `chakra-modal-<id>`, which the hamburger's aria-controls points at.
 */
export const MOBILE_MENU_ID = 'site-menu'
export const MOBILE_MENU_DIALOG_ID = `chakra-modal-${MOBILE_MENU_ID}`

/** Non-httpOnly hint cookie set next to the admin session (adminshell contract; grants nothing). */
export { ADMIN_HINT_COOKIE }

/** True when document.cookie carries the admin hint, i.e. a session check is worth a request. */
export function hasAdminHint(cookie: string): boolean {
  return cookie.split(/;\s*/).includes(`${ADMIN_HINT_COOKIE}=1`)
}

/**
 * The header probes /api/admin/session only when it can be signed in: the
 * hint cookie is present, or the visitor is inside the admin area (which the
 * proxy only serves to a valid session; this also heals a session that
 * predates the hint cookie).
 */
export function shouldProbeSession(cookie: string, pathname: string): boolean {
  return hasAdminHint(cookie) || isAdminArea(pathname)
}

export { adminEditTarget } from './adminEditTarget'

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

/** The words formatAge needs (lib/uiStrings/chrome; English by default). */
type AgeStrings = Pick<ChromeStrings, 'minutesAgo' | 'hoursAgo' | 'daysAgo'>

/** Human "time since" label for the header's last-commit pill ("2h ago", "2 小时前"). */
export function formatAge(fromIso: string, now: number, t: AgeStrings = CHROME_EN): string | null {
  const then = new Date(fromIso).getTime()
  if (!Number.isFinite(then)) return null
  const minutes = Math.max(0, Math.floor((now - then) / 60000))
  if (minutes < 60) return fillUi(t.minutesAgo, { n: minutes })
  if (minutes < 60 * 24) return fillUi(t.hoursAgo, { n: Math.floor(minutes / 60) })
  return fillUi(t.daysAgo, { n: Math.floor(minutes / 60 / 24) })
}
