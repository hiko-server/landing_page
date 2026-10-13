import { createContext, useContext } from 'react'

/**
 * The site chrome — skip link, header and nav, footer, the mobile drawer, the
 * ⌘K palette, scroll-to-top and the chrome's own toasts — is written in
 * English on every page. On a page whose document language is something else
 * (/cv/zh, a Chinese post: <html lang="zh-Hans">) those parts carry
 * lang="en" so screen readers switch voice and pronunciation for them
 * (WCAG 2.1 SC 3.1.2 Language of Parts). On English pages no attribute is
 * needed: the chrome inherits <html lang>.
 *
 * pages/_app.tsx provides the value from the same language that drives
 * <html lang>, so the server render and hydration agree.
 */

/** The language the chrome is written in. */
export const CHROME_LANG = 'en'

/** True for any English BCP-47 tag ("en", "en-GB"), case-insensitive. */
export function isEnglishLang(lang: string | null | undefined): boolean {
  return /^en(?:-|$)/i.test((lang || '').trim())
}

/** The `lang` attribute the chrome needs inside a document of `documentLang`: 'en', or none when it inherits. */
export function chromeLangFor(documentLang: string | null | undefined): typeof CHROME_LANG | undefined {
  return isEnglishLang(documentLang) ? undefined : CHROME_LANG
}

export const ChromeLangContext = createContext<typeof CHROME_LANG | undefined>(undefined)

/** `lang` for an element of the English chrome (undefined on English pages). */
export function useChromeLang(): typeof CHROME_LANG | undefined {
  return useContext(ChromeLangContext)
}
