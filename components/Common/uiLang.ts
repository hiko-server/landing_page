import { createContext, useContext } from 'react'
import { uiLangOf, type UiLang } from '../../lib/uiStrings'

/**
 * The interface language of the content around a component (lib/uiStrings).
 * A post or case study provides its own (ArticleBody), so shared pieces deep
 * inside the body — the code-copy button, the image zoom and viewer, the
 * video facade — label themselves in Chinese inside a Chinese article.
 * Everywhere else (/now, /uses, the about bio, the admin preview, the home
 * gallery) it is English.
 */
export const UiLangContext = createContext<UiLang | null>(null)

/**
 * The surrounding interface language: the provider's, else `fallback`'s
 * (a page language the component was handed, e.g. a compiled
 * `data-ui-lang`), else English.
 */
export function useUiLang(fallback?: string | null): UiLang {
  return useContext(UiLangContext) ?? uiLangOf(fallback)
}
