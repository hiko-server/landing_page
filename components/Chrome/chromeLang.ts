import { createContext, useContext } from 'react'
import { uiLangOf, type UiLang } from '../../lib/uiStrings'
import { CHROME_EN, type ChromeStrings } from '../../lib/uiStrings/chrome-en'
import type { LangLink } from '../../lib/zhRoutes'

/**
 * The language of the site chrome — skip link, header and nav, the language
 * switch, footer, the mobile menu, the ⌘K palette, scroll-to-top and the
 * chrome's own toasts (F3).
 *
 * The chrome speaks the page's interface language (lib/uiStrings): Chinese
 * on a Chinese page (/zh/…, /cv/zh, a Chinese post or case study), English
 * everywhere else. The English words are in the shared bundle
 * (lib/uiStrings/chrome-en); a Chinese page ships its own words with its
 * props (pageProps.chromeUi), and pages/_app provides them here. Where the
 * chrome's words are not in the document's language (English chrome on a
 * Japanese post) those parts carry `lang` so screen readers switch voice
 * and pronunciation for them (WCAG 2.1 SC 3.1.2 Language of Parts); where
 * they are, no attribute is needed: the chrome inherits <html lang>.
 *
 * pages/_app.tsx provides the value from the same language that drives
 * <html lang>, so the server render and hydration agree.
 */

/** The chrome's default language (the site's). */
export const CHROME_LANG = 'en'

/** True for any English BCP-47 tag ("en", "en-GB"), case-insensitive. */
export function isEnglishLang(lang: string | null | undefined): boolean {
  return /^en(?:-|$)/i.test((lang || '').trim())
}

/**
 * The `lang` attribute the chrome needs inside a document of `documentLang`
 * when its words are in `chromeLang`: none when the document is in that
 * language already, else the chrome's language.
 */
export function chromeLangFor(documentLang: string | null | undefined, chromeLang: UiLang = CHROME_LANG): UiLang | undefined {
  if (chromeLang === 'en') return isEnglishLang(documentLang) ? undefined : 'en'
  return uiLangOf(documentLang) === chromeLang ? undefined : chromeLang
}

/** What the chrome renders with: its words, their language and the page's other-language versions. */
export type ChromeUiValue = {
  t: ChromeStrings
  /** Interface language of `t`. */
  lang: UiLang
  /** `lang` for the chrome's elements: set only when `t` is not in the document's language. */
  attr: UiLang | undefined
  /**
   * On a Chinese page, the English paths whose Chinese page exists (the
   * nav leads there, lib/zhRoutes zhHref); null on other pages.
   */
  zh: readonly string[] | null
  /** The page on screen in other languages (the header's language switch); empty when it has none. */
  links: readonly LangLink[]
}

export const DEFAULT_CHROME_UI: ChromeUiValue = { t: CHROME_EN, lang: 'en', attr: undefined, zh: null, links: [] }

export const ChromeUiContext = createContext<ChromeUiValue>(DEFAULT_CHROME_UI)

/** The chrome's words and language (English outside the provider). */
export function useChromeUi(): ChromeUiValue {
  return useContext(ChromeUiContext)
}

/** `lang` for an element of the chrome (undefined when the chrome speaks the document's language). */
export function useChromeLang(): UiLang | undefined {
  return useContext(ChromeUiContext).attr
}
