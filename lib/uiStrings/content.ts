import type { UiTable } from './index'

/**
 * The pieces inside an article body that run in the browser — code-copy
 * button, image zoom and viewer, video facade — in each interface language
 * (lib/uiStrings). `{name}` marks a value filled in with fillUi. Read
 * through components/Common/uiLang (English outside an article).
 */
export type ContentStrings = {
  /** Code blocks. */
  copyCode: string
  codeCopied: string
  copyFailed: string
  /** Images and the image viewer ({alt}: the image's text alternative; {i} of {n}). */
  enlargeImage: string
  enlargeImageAlt: string
  imageViewer: string
  imageOf: string
  imageOfAlt: string
  closeImageViewer: string
  previousImage: string
  nextImage: string
  /** Click-to-load video facade ({provider}: "YouTube", {host}: "youtube-nocookie.com", {title}). */
  videoFallback: string
  playVideo: string
  videoNote: string
  watchOn: string
}

export const CONTENT_UI: UiTable<ContentStrings> = {
  en: {
    copyCode: 'Copy code',
    codeCopied: 'Code copied to clipboard',
    copyFailed: 'Copy failed',
    enlargeImage: 'Enlarge image',
    enlargeImageAlt: 'Enlarge image: {alt}',
    imageViewer: 'Image viewer',
    imageOf: 'Image {i} of {n}',
    imageOfAlt: 'Image {i} of {n}: {alt}',
    closeImageViewer: 'Close image viewer',
    previousImage: 'Previous image',
    nextImage: 'Next image',
    videoFallback: '{provider} video',
    playVideo: 'Play video: {title}',
    videoNote: 'Loads from {host} ({provider}) only when you press play.',
    watchOn: 'Watch on {provider}',
  },
  'zh-Hans': {
    copyCode: '复制代码',
    codeCopied: '代码已复制到剪贴板',
    copyFailed: '复制失败',
    enlargeImage: '放大图片',
    enlargeImageAlt: '放大图片：{alt}',
    imageViewer: '图片查看器',
    imageOf: '第 {i} 张，共 {n} 张',
    imageOfAlt: '第 {i} 张，共 {n} 张：{alt}',
    closeImageViewer: '关闭图片查看器',
    previousImage: '上一张',
    nextImage: '下一张',
    videoFallback: '{provider} 视频',
    playVideo: '播放视频：{title}',
    videoNote: '按下播放后才会从 {host}（{provider}）加载。',
    watchOn: '在 {provider} 观看',
  },
  'zh-Hant': {
    copyCode: '複製程式碼',
    codeCopied: '程式碼已複製到剪貼簿',
    copyFailed: '複製失敗',
    enlargeImage: '放大圖片',
    enlargeImageAlt: '放大圖片：{alt}',
    imageViewer: '圖片檢視器',
    imageOf: '第 {i} 張，共 {n} 張',
    imageOfAlt: '第 {i} 張，共 {n} 張：{alt}',
    closeImageViewer: '關閉圖片檢視器',
    previousImage: '上一張',
    nextImage: '下一張',
    videoFallback: '{provider} 影片',
    playVideo: '播放影片：{title}',
    videoNote: '按下播放後才會從 {host}（{provider}）載入。',
    watchOn: '在 {provider} 觀看',
  },
}
