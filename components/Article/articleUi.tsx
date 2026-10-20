import { createContext, useContext, type ReactNode } from 'react'
import { Box } from '@chakra-ui/react'
import type { ArticleUi } from '../../lib/uiStrings/article'
import { ARTICLE_EN } from '../../lib/uiStrings/article-en'
import { UiLangContext } from '../Common/uiLang'

/**
 * The words of a post or case study in its own language (lib/uiStrings/
 * article: getStaticProps hands the page `articleUiFor(lang)`), for every
 * article component below: the outline, the reading progress, the meta
 * labels, the author card, the share row, prev / next and related links,
 * the language switch. Also sets the interface language of the pieces
 * inside the body (components/Common/uiLang: code copy, image viewer,
 * video facade). ArticleRoot is the <article> element itself, the hook of
 * the Chinese typesetting rules (`.article-page`, styles/globals.css).
 * Outside a page that provides them, the components speak English (the
 * only table the browser bundle carries).
 */
const ENGLISH: ArticleUi = { lang: 'en', pageLang: 'en', t: ARTICLE_EN, qrHelpZh: null }

const ArticleUiContext = createContext<ArticleUi>(ENGLISH)

export function ArticleLanguage({ ui, children }: { ui: ArticleUi; children?: ReactNode }) {
  return (
    <ArticleUiContext.Provider value={ui}>
      <UiLangContext.Provider value={ui.lang}>{children}</UiLangContext.Provider>
    </ArticleUiContext.Provider>
  )
}

/** The article's words (English outside <ArticleLanguage>). */
export function useArticleUi(): ArticleUi {
  return useContext(ArticleUiContext)
}

/** The <article> of a post or case study: its language, the typesetting hook and its words for everything inside. */
export function ArticleRoot({
  ui,
  lang,
  morphId,
  children,
}: {
  ui: ArticleUi
  lang: string
  /** The page path: the card ↔ page morph names this article (lib/viewTransitionMorph). */
  morphId?: string
  children: ReactNode
}) {
  return (
    <ArticleLanguage ui={ui}>
      <Box as="article" lang={lang} className="article-page" data-vt-morph={morphId}>
        {children}
      </Box>
    </ArticleLanguage>
  )
}
