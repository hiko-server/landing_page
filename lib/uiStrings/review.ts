import type { UiTable } from './index'

/**
 * A review link (H5, pages/review/[token]): the "Preview" watermark and bar
 * over a draft shared for review, and the page shown when a link no longer
 * works — in each interface language (lib/uiStrings). The review page hands
 * its own language's words down as props (the article's language, or the
 * reader's Accept-Language when there is no article to show).
 */
export type ReviewStrings = {
  /** The watermark word and the bar's label. */
  preview: string
  /** Bar: what the reader is looking at. */
  draftNote: string
  changesNote: string
  /** Bar: "Link expires {when}" ({when} is a Hong Kong time). */
  expires: string
  /** Screen-reader name of the bar. */
  barLabel: string
  // The link no longer works.
  expiredTitle: string
  expiredBody: string
  revokedTitle: string
  revokedBody: string
  unknownTitle: string
  unknownBody: string
  goneTitle: string
  goneBody: string
  unavailableTitle: string
  unavailableBody: string
  home: string
  /** Eyebrow of the page shown when a link no longer works. */
  eyebrow: string
}

export const REVIEW_UI: UiTable<ReviewStrings> = {
  en: {
    preview: 'Preview',
    draftNote: 'Not published — shared privately for review.',
    changesNote: 'Unpublished changes — shared privately for review. The public page still shows the published version.',
    expires: 'Link expires {when}',
    barLabel: 'Preview of unpublished writing',
    expiredTitle: 'This review link has expired',
    expiredBody: 'It stopped working on {when}. Ask the author for a new link.',
    revokedTitle: 'This review link was turned off',
    revokedBody: 'The author no longer shares this preview. Ask them for a new link if you still need it.',
    unknownTitle: 'This review link doesn’t work',
    unknownBody: 'Check that the whole address was copied, or ask the author for a new link.',
    goneTitle: 'This preview is no longer available',
    goneBody: 'The draft was removed or taken back. Ask the author if you still need it.',
    unavailableTitle: 'Previews are unavailable right now',
    unavailableBody: 'Please try again later.',
    home: 'Go to the home page',
    eyebrow: 'Review link',
  },
  'zh-Hans': {
    preview: '预览',
    draftNote: '尚未发布 — 仅私下分享以供审阅。',
    changesNote: '尚未发布的修改 — 仅私下分享以供审阅。公开页面仍显示已发布的版本。',
    expires: '链接将于 {when}失效',
    barLabel: '未发布内容的预览',
    expiredTitle: '此审阅链接已失效',
    expiredBody: '它已于 {when}失效。请向作者索取新的链接。',
    revokedTitle: '此审阅链接已被关闭',
    revokedBody: '作者已停止分享此预览。如仍需查看，请向作者索取新的链接。',
    unknownTitle: '此审阅链接无效',
    unknownBody: '请确认完整复制了地址，或向作者索取新的链接。',
    goneTitle: '此预览已不可用',
    goneBody: '草稿已被删除或撤回。如仍需查看，请联系作者。',
    unavailableTitle: '预览暂时无法使用',
    unavailableBody: '请稍后再试。',
    home: '前往首页',
    eyebrow: '审阅链接',
  },
  'zh-Hant': {
    preview: '預覽',
    draftNote: '尚未發佈 — 僅私下分享以供審閱。',
    changesNote: '尚未發佈的修改 — 僅私下分享以供審閱。公開頁面仍顯示已發佈的版本。',
    expires: '連結將於 {when}失效',
    barLabel: '未發佈內容的預覽',
    expiredTitle: '此審閱連結已失效',
    expiredBody: '它已於 {when}失效。請向作者索取新的連結。',
    revokedTitle: '此審閱連結已被關閉',
    revokedBody: '作者已停止分享此預覽。如仍需查看，請向作者索取新的連結。',
    unknownTitle: '此審閱連結無效',
    unknownBody: '請確認完整複製了網址，或向作者索取新的連結。',
    goneTitle: '此預覽已無法使用',
    goneBody: '草稿已被刪除或撤回。如仍需查看，請聯絡作者。',
    unavailableTitle: '預覽暫時無法使用',
    unavailableBody: '請稍後再試。',
    home: '前往首頁',
    eyebrow: '審閱連結',
  },
}
