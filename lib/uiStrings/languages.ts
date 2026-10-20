/**
 * Language names and the "Read in …" links of the language switch, each
 * written in the language it names — they never follow the page
 * (lib/uiStrings).
 */

/** Every language named in itself — the label of a link to a version in that language. */
export const LANGUAGE_AUTONYMS: Readonly<Record<string, string>> = {
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ja: '日本語',
  ko: '한국어',
}

/** The single link to a piece's other version, written in the language it leads to. */
export const READ_IN: Readonly<Record<string, string>> = {
  en: 'Read in English',
  'zh-Hans': '阅读中文版',
  'zh-Hant': '閱讀中文版',
  ja: '日本語で読む',
  ko: '한국어로 읽기',
}
