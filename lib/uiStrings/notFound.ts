import type { UiTable } from './index'

/**
 * The 404 page (pages/404, components/NotFound/NotFoundRecovery) in each
 * interface language (lib/uiStrings). The page is static, so it carries
 * every language (a few lines) and speaks Chinese for a missing address
 * under /zh/ (F3). `{name}` marks a value filled in with fillUi.
 */
export type NotFoundStrings = {
  /** <title> and meta description. */
  title: string
  description: string
  eyebrow: string
  heading: string
  lede: string
  home: string
  /** The search field ({query}: the words of the missing address). */
  searchFor: string
  searchSite: string
  didYouMean: string
  kinds: { page: string; post: string; work: string; cv: string; publication: string }
}

export const NOT_FOUND_UI: UiTable<NotFoundStrings> = {
  en: {
    title: '404 — Page Not Found',
    description: 'The page you’re looking for doesn’t exist or has moved.',
    eyebrow: 'Error 404',
    heading: 'This page doesn’t exist.',
    lede: 'The link may be broken, or the page may have moved.',
    home: 'Home',
    searchFor: 'Search for “{query}”',
    searchSite: 'Search the site',
    didYouMean: 'Did you mean',
    kinds: { page: 'Page', post: 'Post', work: 'Case study', cv: 'CV', publication: 'Paper' },
  },
  'zh-Hans': {
    title: '404 — 页面不存在',
    description: '你要找的页面不存在，或者已经移动。',
    eyebrow: '错误 404',
    heading: '这个页面不存在。',
    lede: '链接可能有误，或者页面已经移动。',
    home: '首页',
    searchFor: '搜索“{query}”',
    searchSite: '搜索本站',
    didYouMean: '你是不是要找',
    kinds: { page: '页面', post: '文章', work: '项目案例', cv: '简历', publication: '论文' },
  },
  'zh-Hant': {
    title: '404 — 頁面不存在',
    description: '你要找的頁面不存在，或者已經移動。',
    eyebrow: '錯誤 404',
    heading: '這個頁面不存在。',
    lede: '連結可能有誤，或者頁面已經移動。',
    home: '首頁',
    searchFor: '搜尋「{query}」',
    searchSite: '搜尋本站',
    didYouMean: '你是不是要找',
    kinds: { page: '頁面', post: '文章', work: '項目案例', cv: '履歷', publication: '論文' },
  },
}
