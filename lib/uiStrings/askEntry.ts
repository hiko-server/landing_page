import type { UiTable } from './index'

/**
 * "Ask Lucian" on /about and /contact and their Chinese pages
 * (components/Search/AskEntry), in each interface language. The other
 * language's name of the feature is shown beside the title, marked with its
 * own `lang`. A page ships its own language's words (contactUiFor,
 * aboutUiFor); the English ones are the component's default.
 */
export type AskEntryStrings = {
  title: string
  /** The name in the other language, and that language. */
  alt: string
  altLang: string
  text: string
  button: string
  badge: string
}

export const ASK_ENTRY_EN: AskEntryStrings = {
  title: 'Ask Lucian',
  alt: '问问 Lucian',
  altLang: 'zh-Hans',
  text: 'Questions about his work, studies or projects? Get answers quoted from this site, each with its source. Ask in English or Chinese.',
  button: 'Ask a question…',
  badge: 'Quotes only',
}

export const ASK_ENTRY_UI: UiTable<AskEntryStrings> = {
  en: ASK_ENTRY_EN,
  'zh-Hans': {
    title: '问问 Lucian',
    alt: 'Ask Lucian',
    altLang: 'en',
    text: '想了解他的工作、学业或项目？答案全部引用自本站原文，并附上出处。中文、英文提问都可以。',
    button: '提个问题…',
    badge: '仅引用原文',
  },
  'zh-Hant': {
    title: '問問 Lucian',
    alt: 'Ask Lucian',
    altLang: 'en',
    text: '想了解他的工作、學業或項目？答案全部引用自本站原文，並附上出處。中文、英文提問都可以。',
    button: '提個問題…',
    badge: '僅引用原文',
  },
}
