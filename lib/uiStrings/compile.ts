import type { UiTable } from './index'

/**
 * Words the MDX compiler (lib/mdx) writes into an article's tree on the
 * server, in the article's language (lib/uiStrings): callout titles
 * (lib/rehype/alerts), the footnotes heading and back links
 * (lib/rehype/footnotes) and the self-link of a heading that holds a link
 * of its own (lib/rehype/headings). `{name}` marks a value filled in with
 * fillUi.
 */
export type CalloutKind = 'note' | 'tip' | 'important' | 'warning' | 'caution'

export type CompileStrings = {
  /** `> [!NOTE]` callout titles. */
  callout: Readonly<Record<CalloutKind, string>>
  /** GFM footnotes: the (visually hidden) heading and each back link ({ref}: "1", "1-2"). */
  footnotes: string
  backToReference: string
  /** The anchor after a heading that holds a link of its own ({heading}: its text). */
  linkToSection: string
}

export const COMPILE_UI: UiTable<CompileStrings> = {
  en: {
    callout: { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' },
    footnotes: 'Footnotes',
    backToReference: 'Back to reference {ref}',
    linkToSection: 'Link to section: {heading}',
  },
  'zh-Hans': {
    callout: { note: '备注', tip: '提示', important: '重要', warning: '警告', caution: '注意' },
    footnotes: '注释',
    backToReference: '返回正文（引用 {ref}）',
    linkToSection: '链接到本节：{heading}',
  },
  'zh-Hant': {
    callout: { note: '備註', tip: '提示', important: '重要', warning: '警告', caution: '注意' },
    footnotes: '註釋',
    backToReference: '返回正文（引用 {ref}）',
    linkToSection: '連結到本節：{heading}',
  },
}
