import type { Alternate } from './schema'

/**
 * The bilingual site's routes (F3) — pure and client-safe.
 *
 * Five English pages have a Chinese page of their own, which exists only
 * while the owner has written its Chinese copy (lib/zhSite decides on the
 * server; nothing is machine-translated and nothing stands in for missing
 * copy):
 *
 *   /          /zh            the home page's Chinese tagline (Home editor)
 *   /about     /zh/about      the Chinese bio (About editor → 中文)
 *   /work      /zh/work       a published case study in Chinese
 *   /blog      /zh/blog       a published post in Chinese
 *   /contact   /zh/contact    the Chinese contact heading or blurb
 *
 * The CV has had its own pair all along (/cv, /cv/zh); posts and case
 * studies pair through their translationKey (lib/translations). Every pair
 * carries reciprocal hreflang alternates with an English x-default, and
 * the header's language switch links the counterpart of the page on screen
 * — only when it exists.
 */

/** English page → its Chinese page. */
export const ZH_PAGES: Readonly<Record<string, string>> = {
  '/': '/zh',
  '/about': '/zh/about',
  '/work': '/zh/work',
  '/blog': '/zh/blog',
  '/contact': '/zh/contact',
}

/** The English pages that can have a Chinese page, in navigation order (the keys of ZH_PAGES). */
export const ZH_PAIRED: readonly string[] = ['/', '/about', '/work', '/blog', '/contact']

/** Every Chinese page path (the values of ZH_PAGES). */
export const ZH_PATHS: readonly string[] = ['/zh', '/zh/about', '/zh/work', '/zh/blog', '/zh/contact']

/** The language of the Chinese pages (the owner writes Simplified Chinese; the CV's zh is too). */
export const ZH_LANG = 'zh-Hans'

/** The Chinese CV (always a page of its own; it says so when it is empty). */
export const CV_ZH_PATH = '/cv/zh'

/** The Chinese page of an English path ('/about' → '/zh/about'); null when it has none. */
export function zhPathOf(enPath: string): string | null {
  return Object.prototype.hasOwnProperty.call(ZH_PAGES, enPath) ? ZH_PAGES[enPath] : null
}

/** The English page of a Chinese path ('/zh/about' → '/about'); null when it is not one. */
export function enPathOf(zhPath: string): string | null {
  for (const [en, zh] of Object.entries(ZH_PAGES)) if (zh === zhPath) return en
  return null
}

/** True for a path under the Chinese site (/zh, /zh/…). */
export function isZhSitePath(path: string): boolean {
  const p = (path || '').split(/[?#]/)[0]
  return p === '/zh' || p.startsWith('/zh/')
}

/** A Chinese page and whether it exists now (GET /api/admin/zh-pages, the editors' Chinese sections). */
export type ZhPageStatus = { path: string; en: string; live: boolean }

/** Another language version of the page on screen: the header's language switch. */
export type LangLink = {
  /** BCP-47 language of that version ('en', 'zh-Hans', 'zh-Hant'). */
  lang: string
  /** Site path of that version. */
  href: string
}

/**
 * hreflang alternates of an English page and its Chinese page: both
 * versions plus x-default (the English one), as site paths — CustomHead
 * (withXDefault) and the sitemap make them absolute on the canonical
 * origin. (No lib/schema import: the chrome bundles this module.)
 */
export function pairAlternates(enPath: string, zhPath: string): Alternate[] {
  return [
    { hrefLang: 'en', href: enPath },
    { hrefLang: ZH_LANG, href: zhPath },
    { hrefLang: 'x-default', href: enPath },
  ]
}

/** What an English page of a pair links and announces: its Chinese page when it exists. */
export function enPageLanguages(enPath: string, available: readonly string[]): { langLinks: LangLink[]; alternates: Alternate[] } {
  const zh = zhPathOf(enPath)
  if (!zh || !available.includes(enPath)) return { langLinks: [], alternates: [] }
  return { langLinks: [{ lang: ZH_LANG, href: zh }], alternates: pairAlternates(enPath, zh) }
}

/** What a Chinese page links and announces: its English page (which always exists). */
export function zhPageLanguages(enPath: string): { langLinks: LangLink[]; alternates: Alternate[] } {
  const zh = zhPathOf(enPath)
  if (!zh) return { langLinks: [], alternates: [] }
  return { langLinks: [{ lang: 'en', href: enPath }], alternates: pairAlternates(enPath, zh) }
}

/**
 * Where a site link goes from a Chinese page: the Chinese page of a paired
 * English page when it exists (`available`: the English paths whose Chinese
 * page exists, pageProps.chromeZh), the Chinese CV for the CV, else the
 * link itself (an English page: the switch on it leads back). Query strings
 * and fragments are kept.
 */
export function zhHref(href: string, available: readonly string[]): string {
  const m = /^([^?#]*)(.*)$/.exec(href)
  const path = m ? m[1] : href
  const rest = m ? m[2] : ''
  if (path === '/cv') return `${CV_ZH_PATH}${rest}`
  const zh = zhPathOf(path)
  return zh && available.includes(path) ? `${zh}${rest}` : href
}
