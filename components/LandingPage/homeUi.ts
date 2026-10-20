import { createContext, useCallback, useContext } from 'react'
import type { HomeStrings } from '../../lib/uiStrings/home'
import { langWithin } from '../../lib/toc'

/**
 * The home page's words and language for the components deep inside it —
 * the hero, the section headings, the GitHub widgets, projects, writing,
 * the field notes (F3). The page ships its words with its props
 * (lib/uiStrings/home homeUiFor) and LandingContent provides them, so the
 * home page's JavaScript carries no language table.
 *
 *   lang     the page's language ('en', 'zh-Hans'): text in another script
 *            is marked with its own `lang` (lib/toc langWithin)
 *   cvLang   the CV the page shows ('en' on /, 'zh' on /zh)
 *   links    where its links lead: the Chinese pages that exist from /zh
 */
export type HomeLinks = { cv: string; contact: string; blog: string; work: string; publications: string }

export type HomeUiValue = {
  t: HomeStrings
  lang: string
  cvLang: 'en' | 'zh'
  links: HomeLinks
}

export const HomeUiContext = createContext<HomeUiValue | null>(null)

/** The home page's words; only for components the home page renders (it provides them). */
export function useHomeUi(): HomeUiValue {
  const value = useContext(HomeUiContext)
  if (!value) throw new Error('useHomeUi: rendered outside the home page (LandingContent provides the words)')
  return value
}

/** English pages' links (and the default of every page that is not Chinese). */
export const EN_HOME_LINKS: HomeLinks = { cv: '/cv', contact: '/contact', blog: '/blog', work: '/work', publications: '/publications' }

/**
 * `lang` for the owner's text inside the home page: set only when its script
 * is not the page's (English names on /zh are "en", Chinese ones on / are
 * "zh-Hans"; lib/toc langWithin).
 */
export function useOwnLang(): (text: unknown) => string | undefined {
  const { lang } = useHomeUi()
  return useCallback((text: unknown) => langWithin(text, lang), [lang])
}
