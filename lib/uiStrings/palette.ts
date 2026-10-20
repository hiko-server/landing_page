import type { UiTable } from './index'

/**
 * The ⌘K command palette's own words (components/General-UI/CommandPalette,
 * paletteModel) in each interface language (lib/uiStrings) — the page
 * names come from the chrome's table (./chrome NavStrings) and "Ask
 * Lucian" keeps its words in lib/ask/copy. `{name}` marks a value filled in
 * with fillUi.
 *
 * Only the palette's chunk imports this module (it loads on demand, never
 * with a page), so the shared bundle carries none of it. The owner's admin
 * commands stay in English (the admin is English) and are marked so on a
 * page in another language.
 */
export type PaletteStrings = {
  /** The dialog, its field and its regions. */
  dialog: string
  inputLabel: string
  inputLabelPage: string
  placeholder: string
  placeholderPage: string
  results: string
  commands: string
  loadingIndex: string
  backToAll: string
  /** Row groups. */
  groups: {
    recent: string
    onThisPage: string
    admin: string
    pages: string
    actions: string
    writing: string
    work: string
    content: string
  }
  /** Kinds of a content result (search documents). */
  kinds: { post: string; work: string; page: string; cv: string; publication: string }
  /** "in: …" before where a result matched. */
  matchedIn: string
  section: string
  subsection: string
  /** Nested pages (paletteModel PAGE_TITLES). */
  pageTitles: { theme: string; cv: string; contact: string; shortcuts: string }
  /** Theme ›. */
  themeItems: { system: string; light: string; dark: string }
  themeHints: { system: string; light: string; dark: string }
  current: string
  /** "(dark now)" after the System hint ({mode}). */
  nowMode: string
  /** CV ›: this page's CV first, then the other language's. */
  cvHint: string
  viewCv: string
  viewCvHint: string
  cvPdf: string
  cvPdfHint: string
  otherCvPdf: string
  otherCvPdfHint: string
  otherCv: string
  otherCvHint: string
  /** Contact ›. */
  contactHint: string
  contactPage: string
  contactPageHint: string
  copyEmail: string
  emailCopied: string
  vcard: string
  vcardHint: string
  bookCall: string
  bookCallHint: string
  /** Keyboard shortcuts ({state}: on / off; {mod}: ⌘K / Ctrl+K). */
  shortcuts: string
  on: string
  off: string
  turnOff: string
  turnOn: string
  shortcutsOn: string
  shortcutsOnDetail: string
  shortcutsOff: string
  shortcutsOffDetail: string
  everyKey: string
  /** Other actions. */
  copyLink: string
  copyLinkHint: string
  linkCopied: string
  copyFailed: string
  viewSource: string
  rss: string
  adminLogin: string
  /** The shortcut sheet. */
  sheet: string
  sheetOff: string
  openClose: string
  or: string
  then: string
  moveOpen: string
  backFromPage: string
  goToPage: string
  everyShortcut: string
  singleKey: string
  editPage: string
  /** The keyboard layer's rows (paletteModel LAYER_SHORTCUT_ROWS, same order). */
  layerRows: { search: string; help: string; list: string; open: string; article: string; theme: string }
  /** The empty state and the status line ({n}, {total}). */
  noMatches: string
  stillLoading: string
  tryFewer: string
  showing: string
  resultOne: string
  resultMany: string
  commandOne: string
  commandMany: string
  /** Key hints in the footer. */
  navigate: string
  open: string
  back: string
}

export const PALETTE_UI: UiTable<PaletteStrings> = {
  en: {
    dialog: 'Command palette',
    inputLabel: 'Search pages, sections, actions, posts, case studies and the CV',
    inputLabelPage: 'Search {page}',
    placeholder: 'Search or jump to…',
    placeholderPage: 'Filter…',
    results: 'Results',
    commands: 'Commands',
    loadingIndex: 'Loading the search index',
    backToAll: 'Back to all commands (leave {page})',
    groups: {
      recent: 'Recent',
      onThisPage: 'On this page',
      admin: 'Admin',
      pages: 'Pages',
      actions: 'Actions',
      writing: 'Writing',
      work: 'Work',
      content: 'Content',
    },
    kinds: { post: 'Post', work: 'Case study', page: 'Page', cv: 'CV', publication: 'Paper' },
    matchedIn: 'in: ',
    section: 'section',
    subsection: 'subsection',
    pageTitles: { theme: 'Theme', cv: 'CV', contact: 'Contact', shortcuts: 'Keyboard shortcuts' },
    themeItems: { system: 'System theme', light: 'Light theme', dark: 'Dark theme' },
    themeHints: { system: 'follow your device', light: 'switch to light', dark: 'switch to dark' },
    current: 'current',
    nowMode: '({mode} now)',
    cvHint: 'PDF · 中文',
    viewCv: 'View the CV',
    viewCvHint: 'English',
    cvPdf: 'Download CV (PDF)',
    cvPdfHint: 'A4 · English',
    otherCvPdf: 'Download CV in 中文 (PDF)',
    otherCvPdfHint: 'A4 · Chinese',
    otherCv: 'CV in 中文',
    otherCvHint: 'Chinese version',
    contactHint: 'email · vCard',
    contactPage: 'Contact page',
    contactPageHint: 'write a message',
    copyEmail: 'Copy email address',
    emailCopied: 'Email copied',
    vcard: 'Download vCard',
    vcardHint: 'add to contacts',
    bookCall: 'Book a call',
    bookCallHint: 'opens the booking page',
    shortcuts: 'Keyboard shortcuts: {state}',
    on: 'on',
    off: 'off',
    turnOff: 'turn off single-key shortcuts',
    turnOn: 'turn on single-key shortcuts',
    shortcutsOn: 'Keyboard shortcuts on',
    shortcutsOnDetail: '/ opens this palette, ? lists every shortcut.',
    shortcutsOff: 'Keyboard shortcuts off',
    shortcutsOffDetail: 'Single-key shortcuts are off. {mod} still opens this palette.',
    everyKey: 'every key',
    copyLink: 'Copy page link',
    copyLinkHint: 'share this page',
    linkCopied: 'Link copied',
    copyFailed: 'Copy failed',
    viewSource: 'View source on GitHub',
    rss: 'RSS feed',
    adminLogin: 'Admin login',
    sheet: 'Shortcuts',
    sheetOff: 'Single-key shortcuts are off; {mod} K still opens this palette. Turn them on above.',
    openClose: 'Open / close palette',
    or: 'or',
    then: 'then',
    moveOpen: 'Move / open',
    backFromPage: 'Back from a page',
    goToPage: 'Go to {page}',
    everyShortcut: 'Every shortcut',
    singleKey: 'Single-key shortcuts',
    editPage: 'Edit this page',
    layerRows: {
      search: 'Search',
      help: 'Every shortcut (this page)',
      list: 'Next / previous item in a list',
      open: 'Open the selected item',
      article: 'Previous / next article',
      theme: 'Switch light / dark',
    },
    noMatches: 'no matches',
    stillLoading: 'still loading posts and projects…',
    tryFewer: 'try fewer or different letters',
    showing: 'Showing {n} of {total} results',
    resultOne: '{n} result',
    resultMany: '{n} results',
    commandOne: '{n} command',
    commandMany: '{n} commands',
    navigate: 'navigate',
    open: 'open',
    back: 'back',
  },
  'zh-Hans': {
    dialog: '命令面板',
    inputLabel: '搜索页面、章节、操作、文章、项目案例和简历',
    inputLabelPage: '搜索{page}',
    placeholder: '搜索或跳转到…',
    placeholderPage: '筛选…',
    results: '结果',
    commands: '命令',
    loadingIndex: '正在加载搜索索引',
    backToAll: '返回全部命令（离开{page}）',
    groups: {
      recent: '最近',
      onThisPage: '本页',
      admin: '管理',
      pages: '页面',
      actions: '操作',
      writing: '文章',
      work: '项目',
      content: '内容',
    },
    kinds: { post: '文章', work: '项目案例', page: '页面', cv: '简历', publication: '论文' },
    matchedIn: '出现于：',
    section: '章节',
    subsection: '小节',
    pageTitles: { theme: '主题', cv: '简历', contact: '联系', shortcuts: '键盘快捷键' },
    themeItems: { system: '跟随系统主题', light: '浅色主题', dark: '深色主题' },
    themeHints: { system: '跟随设备设置', light: '切换到浅色', dark: '切换到深色' },
    current: '当前',
    nowMode: '（当前为{mode}）',
    cvHint: 'PDF · English',
    viewCv: '查看简历',
    viewCvHint: '中文',
    cvPdf: '下载简历（PDF）',
    cvPdfHint: 'A4 · 中文',
    otherCvPdf: '下载英文简历（PDF）',
    otherCvPdfHint: 'A4 · English',
    otherCv: '英文简历',
    otherCvHint: 'English',
    contactHint: '电子邮件 · vCard',
    contactPage: '联系页面',
    contactPageHint: '写一封留言',
    copyEmail: '复制电子邮件地址',
    emailCopied: '电子邮件地址已复制',
    vcard: '下载 vCard 名片',
    vcardHint: '添加到通讯录',
    bookCall: '预约通话',
    bookCallHint: '打开预约页面',
    shortcuts: '键盘快捷键：{state}',
    on: '已开启',
    off: '已关闭',
    turnOff: '关闭单键快捷键',
    turnOn: '开启单键快捷键',
    shortcutsOn: '键盘快捷键已开启',
    shortcutsOnDetail: '按 / 打开此面板，按 ? 查看全部快捷键。',
    shortcutsOff: '键盘快捷键已关闭',
    shortcutsOffDetail: '单键快捷键已关闭，{mod} 仍可打开此面板。',
    everyKey: '全部按键',
    copyLink: '复制页面链接',
    copyLinkHint: '分享此页',
    linkCopied: '链接已复制',
    copyFailed: '复制失败',
    viewSource: '在 GitHub 查看源代码',
    rss: 'RSS 订阅',
    adminLogin: '管理员登录',
    sheet: '快捷键',
    sheetOff: '单键快捷键已关闭，{mod} K 仍可打开此面板。可在上方重新开启。',
    openClose: '打开 / 关闭面板',
    or: '或',
    then: '然后',
    moveOpen: '移动 / 打开',
    backFromPage: '从子页面返回',
    goToPage: '前往{page}',
    everyShortcut: '全部快捷键',
    singleKey: '单键快捷键',
    editPage: '编辑此页',
    layerRows: {
      search: '搜索',
      help: '全部快捷键（本页）',
      list: '列表中的下一项 / 上一项',
      open: '打开选中的项目',
      article: '上一篇 / 下一篇文章',
      theme: '切换浅色 / 深色',
    },
    noMatches: '没有匹配项',
    stillLoading: '仍在加载文章和项目…',
    tryFewer: '试试更少或不同的字词',
    showing: '显示 {total} 个结果中的 {n} 个',
    resultOne: '{n} 个结果',
    resultMany: '{n} 个结果',
    commandOne: '{n} 个命令',
    commandMany: '{n} 个命令',
    navigate: '移动',
    open: '打开',
    back: '返回',
  },
  'zh-Hant': {
    dialog: '命令面板',
    inputLabel: '搜尋頁面、章節、操作、文章、項目案例和履歷',
    inputLabelPage: '搜尋{page}',
    placeholder: '搜尋或跳轉到…',
    placeholderPage: '篩選…',
    results: '結果',
    commands: '命令',
    loadingIndex: '正在載入搜尋索引',
    backToAll: '返回全部命令（離開{page}）',
    groups: {
      recent: '最近',
      onThisPage: '本頁',
      admin: '管理',
      pages: '頁面',
      actions: '操作',
      writing: '文章',
      work: '項目',
      content: '內容',
    },
    kinds: { post: '文章', work: '項目案例', page: '頁面', cv: '履歷', publication: '論文' },
    matchedIn: '出現於：',
    section: '章節',
    subsection: '小節',
    pageTitles: { theme: '主題', cv: '履歷', contact: '聯絡', shortcuts: '鍵盤快捷鍵' },
    themeItems: { system: '跟隨系統主題', light: '淺色主題', dark: '深色主題' },
    themeHints: { system: '跟隨裝置設定', light: '切換到淺色', dark: '切換到深色' },
    current: '目前',
    nowMode: '（目前為{mode}）',
    cvHint: 'PDF · English',
    viewCv: '查看履歷',
    viewCvHint: '中文',
    cvPdf: '下載履歷（PDF）',
    cvPdfHint: 'A4 · 中文',
    otherCvPdf: '下載英文履歷（PDF）',
    otherCvPdfHint: 'A4 · English',
    otherCv: '英文履歷',
    otherCvHint: 'English',
    contactHint: '電子郵件 · vCard',
    contactPage: '聯絡頁面',
    contactPageHint: '寫一封留言',
    copyEmail: '複製電子郵件地址',
    emailCopied: '電子郵件地址已複製',
    vcard: '下載 vCard 名片',
    vcardHint: '加入通訊錄',
    bookCall: '預約通話',
    bookCallHint: '開啟預約頁面',
    shortcuts: '鍵盤快捷鍵：{state}',
    on: '已開啟',
    off: '已關閉',
    turnOff: '關閉單鍵快捷鍵',
    turnOn: '開啟單鍵快捷鍵',
    shortcutsOn: '鍵盤快捷鍵已開啟',
    shortcutsOnDetail: '按 / 開啟此面板，按 ? 查看全部快捷鍵。',
    shortcutsOff: '鍵盤快捷鍵已關閉',
    shortcutsOffDetail: '單鍵快捷鍵已關閉，{mod} 仍可開啟此面板。',
    everyKey: '全部按鍵',
    copyLink: '複製頁面連結',
    copyLinkHint: '分享此頁',
    linkCopied: '連結已複製',
    copyFailed: '複製失敗',
    viewSource: '在 GitHub 查看原始碼',
    rss: 'RSS 訂閱',
    adminLogin: '管理員登入',
    sheet: '快捷鍵',
    sheetOff: '單鍵快捷鍵已關閉，{mod} K 仍可開啟此面板。可在上方重新開啟。',
    openClose: '開啟 / 關閉面板',
    or: '或',
    then: '然後',
    moveOpen: '移動 / 開啟',
    backFromPage: '從子頁面返回',
    goToPage: '前往{page}',
    everyShortcut: '全部快捷鍵',
    singleKey: '單鍵快捷鍵',
    editPage: '編輯此頁',
    layerRows: {
      search: '搜尋',
      help: '全部快捷鍵（本頁）',
      list: '清單中的下一項 / 上一項',
      open: '開啟選取的項目',
      article: '上一篇 / 下一篇文章',
      theme: '切換淺色 / 深色',
    },
    noMatches: '沒有相符項目',
    stillLoading: '仍在載入文章和項目…',
    tryFewer: '試試更少或不同的字詞',
    showing: '顯示 {total} 個結果中的 {n} 個',
    resultOne: '{n} 個結果',
    resultMany: '{n} 個結果',
    commandOne: '{n} 個命令',
    commandMany: '{n} 個命令',
    navigate: '移動',
    open: '開啟',
    back: '返回',
  },
}
