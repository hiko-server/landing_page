import type { UiTable } from './index'

/**
 * The parts of the chrome that load on demand — the mobile menu, the theme
 * menu and switch, back-to-top and the "G then …" hint — in each interface
 * language (lib/uiStrings). They read the chrome's language from context
 * (components/Chrome/chromeLang) and pick their words here: only their own
 * chunks import this module, so the shared bundle carries none of it.
 * `{name}` marks a value filled in with fillUi.
 */
export type MenuStrings = {
  /** Mobile menu. */
  menu: string
  closeMenu: string
  navigate: string
  quickActions: string
  cvPdf: string
  /** The CV in the other language, named in that language ("中文简历" from an English page). */
  otherCv: string
  /** The menu's language group (this page in the other language, F3). */
  language: string
  admin: string
  /** Theme preferences (menu, mobile switch, palette). */
  system: string
  light: string
  dark: string
  /** After "System" in the theme menu ({mode}: the mode the device asks for now). */
  followsDevice: string
  /** Back-to-top button and the "G then …" hint. */
  scrollTop: string
  goTo: string
}

export const MENU_UI: UiTable<MenuStrings> = {
  en: {
    menu: 'Menu',
    closeMenu: 'Close menu',
    navigate: 'Navigate',
    quickActions: 'Quick actions',
    cvPdf: 'CV as PDF',
    otherCv: '中文简历',
    language: 'Language',
    admin: 'Admin',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    followsDevice: ': follows your device, now {mode}',
    scrollTop: 'Scroll to top',
    goTo: 'Go to',
  },
  'zh-Hans': {
    menu: '菜单',
    closeMenu: '关闭菜单',
    navigate: '导航',
    quickActions: '快捷操作',
    cvPdf: '简历 PDF',
    otherCv: 'English CV',
    language: '语言',
    admin: '管理',
    system: '跟随系统',
    light: '浅色',
    dark: '深色',
    followsDevice: '：跟随设备，当前为{mode}',
    scrollTop: '回到顶部',
    goTo: '前往',
  },
  'zh-Hant': {
    menu: '選單',
    closeMenu: '關閉選單',
    navigate: '導覽',
    quickActions: '快捷操作',
    cvPdf: '履歷 PDF',
    otherCv: 'English CV',
    language: '語言',
    admin: '管理',
    system: '跟隨系統',
    light: '淺色',
    dark: '深色',
    followsDevice: '：跟隨裝置，目前為{mode}',
    scrollTop: '回到頂部',
    goTo: '前往',
  },
}
