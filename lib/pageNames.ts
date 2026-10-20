/**
 * The owner-written single pages of the content store (`pages` table) and
 * where each one is public — pure and client-safe.
 *
 *   now        /now         (an automatic version shows while it is empty)
 *   uses       /uses        (likewise)
 *   about      /about       the bio (no bio section while it is empty)
 *   about-zh   /zh/about    the Chinese bio (F3): /zh/about exists only
 *                           while it has text; it is edited beside the
 *                           English one (/admin/about, 中文)
 */

export type PageName = 'now' | 'uses' | 'about' | 'about-zh'

export const PAGE_NAMES: ReadonlyArray<PageName> = ['now', 'uses', 'about', 'about-zh']

export function isPageName(value: unknown): value is PageName {
  return typeof value === 'string' && (PAGE_NAMES as ReadonlyArray<string>).includes(value)
}

/** The public page that shows it (the bios link to their section). */
export function pagePublicPath(name: PageName): string {
  return name === 'about-zh' ? '/zh/about' : `/${name}`
}

/** Where the owner edits it. */
export function pageAdminPath(name: PageName): string {
  return name === 'about-zh' ? '/admin/about?lang=zh' : `/admin/${name}`
}

/** The language a page is written in, when it is fixed by its name (the Chinese bio); null otherwise. */
export function pageFixedLang(name: PageName): string | null {
  return name === 'about-zh' ? 'zh-Hans' : null
}
