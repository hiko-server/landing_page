import { uiLangOf, type UiLang, type UiTable } from './index'
import { CHROME_EN, type ChromeStrings } from './chrome-en'

export type { ChromeStrings, NavStrings } from './chrome-en'

/**
 * The always-loaded site chrome — skip link, header and nav, the theme
 * toggle, footer and the slow-navigation status — in each interface
 * language (lib/uiStrings). `{name}` marks a value filled in with fillUi.
 *
 * The chrome is in the shared bundle, which carries only the English words
 * (./chrome-en). A page in another interface language hands the chrome its
 * own words with its props (chromeUiFor → pageProps.chromeUi, read by
 * pages/_app), so no page's JavaScript holds the other languages; the
 * static 404 page under /zh/ loads this module on demand instead. The
 * parts of the chrome that load on demand keep their words in ./menu.
 */
export const CHROME_UI: UiTable<ChromeStrings> = {
  en: CHROME_EN,
  'zh-Hans': {
    nav: {
      home: '首页',
      about: '关于',
      work: '项目',
      writing: '文章',
      cv: '简历',
      publications: '论文',
      now: '近况',
      uses: '工具',
      contact: '联系',
      colophon: '本站说明',
    },
    skip: '跳到正文',
    homeLink: '{brand}，返回首页',
    primaryNav: '主导航',
    search: '搜索',
    openPalette: '打开命令面板',
    openMenu: '打开菜单',
    lastCommit: '最近提交',
    minutesAgo: '{n} 分钟前',
    hoursAgo: '{n} 小时前',
    daysAgo: '{n} 天前',
    dashboard: '后台',
    logout: '退出登录',
    logoutTitle: '退出此浏览器的登录（其他设备：后台 → 安全）',
    loggedOut: '已退出登录',
    logoutFailed: '退出登录失败',
    theme: '主题',
    toLight: '切换到浅色主题',
    toDark: '切换到深色主题',
    themePreference: '主题偏好',
    themeTitle: '主题：跟随系统、浅色或深色',
    footerNav: '页脚',
    site: '站点',
    thisSite: '关于本站',
    elsewhere: '其他平台',
    privacy: '隐私',
    source: '源代码',
    feeds: {
      '/feed.xml': '文章（RSS）',
      '/feed.json': '文章（JSON Feed）',
      '/work/feed.xml': '项目案例（RSS）',
    },
    builtWith: '使用 Next.js 构建 · 字体 Geist',
    build: '构建 {sha}',
    deployedFrom: '部署自提交 {sha}',
    newTab: '（在新标签页中打开）',
    loading: '正在加载…',
  },
  'zh-Hant': {
    nav: {
      home: '首頁',
      about: '關於',
      work: '項目',
      writing: '文章',
      cv: '履歷',
      publications: '論文',
      now: '近況',
      uses: '工具',
      contact: '聯絡',
      colophon: '本站說明',
    },
    skip: '跳到正文',
    homeLink: '{brand}，返回首頁',
    primaryNav: '主導覽',
    search: '搜尋',
    openPalette: '開啟命令面板',
    openMenu: '開啟選單',
    lastCommit: '最近提交',
    minutesAgo: '{n} 分鐘前',
    hoursAgo: '{n} 小時前',
    daysAgo: '{n} 天前',
    dashboard: '後台',
    logout: '登出',
    logoutTitle: '登出此瀏覽器（其他裝置：後台 → 安全）',
    loggedOut: '已登出',
    logoutFailed: '登出失敗',
    theme: '主題',
    toLight: '切換到淺色主題',
    toDark: '切換到深色主題',
    themePreference: '主題偏好',
    themeTitle: '主題：跟隨系統、淺色或深色',
    footerNav: '頁尾',
    site: '網站',
    thisSite: '關於本站',
    elsewhere: '其他平台',
    privacy: '私隱',
    source: '原始碼',
    feeds: {
      '/feed.xml': '文章（RSS）',
      '/feed.json': '文章（JSON Feed）',
      '/work/feed.xml': '項目案例（RSS）',
    },
    builtWith: '使用 Next.js 建置 · 字型 Geist',
    build: '建置 {sha}',
    deployedFrom: '部署自提交 {sha}',
    newTab: '（在新分頁中開啟）',
    loading: '正在載入…',
  },
}

/** The chrome's words as a page ships them: the interface language and its table. */
export type ChromeUi = { lang: UiLang; t: ChromeStrings }

/**
 * The chrome words a page in `pageLang` ships with its props: null for an
 * English interface (the shared bundle has those), else that language's
 * table (getStaticProps → pageProps.chromeUi).
 */
export function chromeUiFor(pageLang: string | undefined | null): ChromeUi | null {
  const lang = uiLangOf(pageLang)
  return lang === 'en' ? null : { lang, t: CHROME_UI[lang] }
}
