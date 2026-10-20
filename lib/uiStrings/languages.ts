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

/**
 * The short name of a language on the header's language switch (F3), in
 * that language: "English", "中文"; with both Chinese scripts among the
 * links, "简体" and "繁體" tell them apart.
 */
const SWITCH_LABELS: Readonly<Record<string, string>> = {
  en: 'English',
  'zh-Hans': '中文',
  'zh-Hant': '繁體',
  ja: '日本語',
  ko: '한국어',
}

function switchKey(lang: string): string {
  const l = lang.trim().toLowerCase()
  if (l === 'zh' || l.startsWith('zh-')) return /^zh-(hant|tw|hk|mo)(-|$)/.test(l) ? 'zh-Hant' : 'zh-Hans'
  return l.split('-')[0]
}

/** The switch label of `lang` among `links` (the page's other-language versions). */
export function switchLabel(lang: string, links: ReadonlyArray<{ lang: string }>): string {
  const key = switchKey(lang)
  const bothChinese = links.some((l) => switchKey(l.lang) === 'zh-Hans') && links.some((l) => switchKey(l.lang) === 'zh-Hant')
  if (bothChinese && key === 'zh-Hans') return '简体'
  return SWITCH_LABELS[key] || lang
}

/** The full name of a language in that language ("简体中文", "English"); the tag itself when unknown. */
export function autonymOf(lang: string): string {
  return LANGUAGE_AUTONYMS[switchKey(lang)] || lang
}
