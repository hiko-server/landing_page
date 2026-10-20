import { uiLangOf, type UiTable } from './index'
import { ARTICLE_EN, type ArticleStrings } from './article-en'

export type { ArticleStrings }

/**
 * The page around a post or case study — back links, eyebrow, meta labels,
 * outline and reading progress, "At a glance", the language switch, author
 * card, share row, prev / next and related links — in each interface
 * language (lib/uiStrings). `{name}` marks a value filled in with fillUi.
 *
 * Server-side: getStaticProps of pages/blog/[slug] and pages/work/[slug]
 * hands the page its own language's words (articleUiFor), and the article
 * components read them from context (components/Article/articleUi.tsx), so
 * a page's JavaScript never carries the other languages.
 */
export const ARTICLE_UI: UiTable<ArticleStrings> = {
  en: ARTICLE_EN,
  'zh-Hans': {
    allPosts: '← 全部文章',
    allProjects: '← 全部项目',
    writing: '文章',
    caseStudy: '项目案例',
    date: '日期',
    updated: '更新于',
    read: '阅读',
    minutes: '{n} 分钟',
    tags: '标签',
    role: '角色',
    team: '团队',
    timeline: '时间',
    published: '发布于',
    stack: '技术栈',
    writeup: '相关文章',
    writeups: '相关文章',
    visitSite: '访问网站',
    source: '源代码',
    atAGlance: '概览',
    metricSource: '来源',
    onThisPage: '本页目录',
    articleOutline: '文章目录',
    readingProgress: '阅读进度',
    progress: '进度',
    percentRead: '已读 {pct}%',
    otherLanguages: '其他语言',
    writtenBy: '作者',
    viewCv: '查看简历',
    contact: '联系我',
    share: '分享',
    copyLink: '复制链接',
    copied: '已复制',
    linkCopied: '链接已复制到剪贴板',
    copyLinkFailed: '无法复制链接',
    shareSheet: '分享…',
    opensInNewTab: '（在新标签页中打开）',
    wechat: '微信',
    qrCodeOf: '{url} 的二维码',
    qrHelp: '用微信扫一扫，在手机上打开后即可分享。',
    newer: '较新',
    older: '较早',
    previous: '上一篇',
    next: '下一篇',
    moreInCollection: '本栏目的更多内容',
    related: '相关内容',
  },
  'zh-Hant': {
    allPosts: '← 全部文章',
    allProjects: '← 全部項目',
    writing: '文章',
    caseStudy: '項目案例',
    date: '日期',
    updated: '更新於',
    read: '閱讀',
    minutes: '{n} 分鐘',
    tags: '標籤',
    role: '角色',
    team: '團隊',
    timeline: '時間',
    published: '發佈於',
    stack: '技術棧',
    writeup: '相關文章',
    writeups: '相關文章',
    visitSite: '瀏覽網站',
    source: '原始碼',
    atAGlance: '概覽',
    metricSource: '來源',
    onThisPage: '本頁目錄',
    articleOutline: '文章目錄',
    readingProgress: '閱讀進度',
    progress: '進度',
    percentRead: '已讀 {pct}%',
    otherLanguages: '其他語言',
    writtenBy: '作者',
    viewCv: '查看履歷',
    contact: '聯絡我',
    share: '分享',
    copyLink: '複製連結',
    copied: '已複製',
    linkCopied: '連結已複製到剪貼簿',
    copyLinkFailed: '無法複製連結',
    shareSheet: '分享…',
    opensInNewTab: '（在新分頁中開啟）',
    wechat: '微信',
    qrCodeOf: '{url} 的二維碼',
    qrHelp: '用微信掃一掃，在手機上開啟後即可分享。',
    newer: '較新',
    older: '較早',
    previous: '上一篇',
    next: '下一篇',
    moreInCollection: '本欄目的更多內容',
    related: '相關內容',
  },
}

/** The words an article page needs, in its own language (getStaticProps → page props). */
export type ArticleUi = {
  /** The interface language ('en', 'zh-Hans', 'zh-Hant'). */
  lang: ReturnType<typeof uiLangOf>
  /** The article's own language (BCP-47, e.g. 'ja'), against which other titles are marked. */
  pageLang: string
  t: ArticleStrings
  /** The QR help line in Simplified Chinese too (WeChat readers), on pages in another language; null otherwise. */
  qrHelpZh: string | null
}

export function articleUiFor(pageLang: string | undefined | null): ArticleUi {
  const lang = uiLangOf(pageLang)
  return { lang, pageLang: pageLang || 'en', t: ARTICLE_UI[lang], qrHelpZh: lang === 'en' ? ARTICLE_UI['zh-Hans'].qrHelp : null }
}
