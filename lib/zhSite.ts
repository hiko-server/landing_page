/**
 * Which Chinese pages exist (F3). SERVER-ONLY (content store).
 *
 * A Chinese page is generated only while the owner has written its Chinese
 * copy — never machine-translated, never a placeholder (lib/zhRoutes lists
 * the pairs):
 *
 *   /zh           the home page's Chinese tagline (home.hero.tagline_zh)
 *   /zh/about     the Chinese bio (the `about-zh` page, About editor → 中文)
 *   /zh/work      at least one published case study in Chinese
 *   /zh/blog      at least one published post in Chinese
 *   /zh/contact   the Chinese contact heading or blurb (home.contact.*_zh)
 *
 * Read by every page of a pair (the English page links and announces its
 * Chinese page only while it exists), by the Chinese pages' getStaticProps
 * (404 otherwise) and by the chrome props of every Chinese page (its nav
 * leads to the Chinese pages that exist). It reads the store directly (no
 * lib/mdx), so lib/isrPages can use it at server start too.
 */

import { getKv, getPage, listItems, publishedItemSlugs } from './contentStore'
import { detectContentLang } from './toc'
import type { HomeData } from './homeShape'
import { ZH_PAIRED } from './zhRoutes'

/** The store name of the Chinese bio (the English one is `about`). */
export const ABOUT_ZH_PAGE = 'about-zh'

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** True for a Chinese language tag (Simplified or Traditional). */
export function isChineseLang(lang: unknown): boolean {
  const l = text(lang).toLowerCase()
  return l === 'zh' || l.startsWith('zh-')
}

/** The home page has its Chinese copy: the tagline (role line and phrases). */
export function hasZhHomeCopy(home: HomeData | null | undefined): boolean {
  return !!text(home?.hero?.tagline_zh)
}

/** /contact has its Chinese copy: a heading or a blurb. */
export function hasZhContactCopy(home: HomeData | null | undefined): boolean {
  return !!(text(home?.contact?.heading_zh) || text(home?.contact?.blurb_zh))
}

/** The Chinese bio has text. */
export function hasZhBio(): boolean {
  return !!text(getPage(ABOUT_ZH_PAGE)?.body)
}

/** A published item of the collection is in Chinese (frontmatter `lang`, else detected — lib/mdx's rule). */
export function hasChineseItem(collection: 'blog' | 'work'): boolean {
  const published = publishedItemSlugs(collection)
  return listItems(collection).some(
    (i) => published.has(i.slug) && isChineseLang(detectContentLang({ lang: i.frontmatter?.lang, title: i.frontmatter?.title, body: i.body })),
  )
}

/**
 * The English paths whose Chinese page exists, in ZH_PAIRED order. A store
 * that cannot be read has none (a Chinese page is never promised on a
 * guess).
 */
export function zhAvailable(): string[] {
  try {
    const home = getKv<HomeData>('home')
    const has: Record<string, () => boolean> = {
      '/': () => hasZhHomeCopy(home),
      '/about': hasZhBio,
      '/work': () => hasChineseItem('work'),
      '/blog': () => hasChineseItem('blog'),
      '/contact': () => hasZhContactCopy(home),
    }
    return ZH_PAIRED.filter((p) => {
      try {
        return has[p]?.() === true
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}
