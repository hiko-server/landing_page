import { createContext, useContext, useEffect } from 'react'

/**
 * `<html lang>` is owned by pages/_app.tsx (contract E): it follows the page's
 * `lang` prop on every route change. A page whose language can change on the
 * client without a new `lang` prop (the /cv EN / 中文 toggle is a shallow URL
 * update) reports the language it is showing through this context instead of
 * writing document.documentElement itself; _app applies the report while that
 * page is mounted and drops it when the page unmounts.
 */
export type HtmlLangReporter = (lang: string | null) => void

export const HtmlLangContext = createContext<HtmlLangReporter>(() => undefined)

/** Report the BCP-47 language this page currently renders; withdrawn on unmount. */
export function useReportHtmlLang(lang: string): void {
  const report = useContext(HtmlLangContext)
  useEffect(() => {
    report(lang)
  }, [report, lang])
  useEffect(() => () => report(null), [report])
}
