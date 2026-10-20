/**
 * The language props of a page (F3). SERVER-ONLY (content store).
 *
 *   lang        <html lang> (contract E: pages/_app, pages/_document)
 *   chromeUi    the chrome's words, on a page in another interface language
 *               than English (lib/uiStrings/chrome; the shared bundle has
 *               only the English ones)
 *   chromeZh    on a Chinese page, the English paths whose Chinese page
 *               exists: its nav leads there (lib/zhRoutes zhHref)
 *   langLinks   the page in its other language(s): the header's language
 *               switch (absent when there is none)
 *   alternates  hreflang alternates for CustomHead (both versions and an
 *               English x-default; empty without a counterpart)
 */

import type { Alternate } from './schema'
import { chromeUiFor, type ChromeUi } from './uiStrings/chrome'
import { ZH_LANG, enPageLanguages, zhPageLanguages, type LangLink } from './zhRoutes'
import { zhAvailable } from './zhSite'

export type ChromeLanguageProps = { chromeUi?: ChromeUi; chromeZh?: string[] }

export type PageLanguageProps = ChromeLanguageProps & {
  lang: string
  langLinks: LangLink[]
  alternates: Alternate[]
}

/** The chrome's words and Chinese routes for a page in `lang` (nothing for an English page). */
export function chromeLanguageProps(lang: string, available?: readonly string[]): ChromeLanguageProps {
  const chromeUi = chromeUiFor(lang)
  if (!chromeUi) return {}
  return { chromeUi, chromeZh: [...(available ?? zhAvailable())] }
}

/**
 * The language props of a page of an EN / ZH pair (lib/zhRoutes ZH_PAGES):
 * `enPath` is the English page ('/about'), `lang` the version rendered.
 * The English page links and announces its Chinese page only while it
 * exists (zhAvailable); the Chinese page always links its English one.
 */
export function pairLanguageProps(enPath: string, lang: 'en' | typeof ZH_LANG, available: readonly string[] = zhAvailable()): PageLanguageProps {
  const versions = lang === 'en' ? enPageLanguages(enPath, available) : zhPageLanguages(enPath)
  return { lang, ...chromeLanguageProps(lang, available), ...versions }
}

/** The owner's Chinese name from the public CV ("李彦霈"; '' when hidden or unset) — the title suffix of Chinese pages. */
export async function ownerNameZh(): Promise<string> {
  try {
    const [{ readPublicCvSections }, { publicNameZh }] = await Promise.all([import('./cvdata'), import('../components/CVViewerPage/cvName')])
    return publicNameZh(readPublicCvSections('website', ['personalInformation'], ['zh']).zh)
  } catch {
    return ''
  }
}
