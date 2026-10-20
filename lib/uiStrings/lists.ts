import type { UiTable } from './index'

/**
 * The index lines of a piece published in several languages (/blog, /work:
 * "Also in 简体中文"), in each interface language (lib/uiStrings).
 */
export type ListStrings = {
  alsoIn: string
}

export const LIST_UI: UiTable<ListStrings> = {
  en: { alsoIn: 'Also in' },
  'zh-Hans': { alsoIn: '另有' },
  'zh-Hant': { alsoIn: '另有' },
}
