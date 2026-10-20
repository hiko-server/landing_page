import type { UiTable } from './index'
import type { CvLang } from '../cvVisibility'

/**
 * The CV page's own words (/cv and /cv/zh: components/CVViewerPage
 * CvPageView and CvDownloads) in each interface language (lib/uiStrings).
 * The CV's section labels and dates stay with the CV renderer
 * (lib/cvFormat); the meta description and certificate words are in
 * ./cvFields (the CV sheet on /about uses them too).
 * `{name}` marks a value filled in with fillUi.
 */
export type CvPageStrings = {
  eyebrow: string
  title: string
  home: string
  /** Toggle-group names: "language", "layout". */
  language: string
  layout: string
  reading: string
  a4: string
  pdf: string
  more: string
  updated: string
  downloads: string
  copy: string
  copied: string
  /** Followed by the link itself. */
  copyFailed: string
  empty: string
  actions: string
  publications: string
  /** The print-only QR code ({url}: the live CV's address without the scheme). */
  qrCaption: string
  qrLabel: string
  /** "More formats" (CvDownloads). */
  formats: {
    txt: string
    txtHint: string
    json: string
    jsonHint: string
    print: string
    printHint: string
  }
}

export const CV_UI: UiTable<CvPageStrings> = {
  en: {
    eyebrow: 'Curriculum vitae',
    title: 'CV / Résumé',
    home: 'Home',
    language: 'language',
    layout: 'layout',
    reading: 'Reading',
    a4: 'A4',
    pdf: 'Download PDF',
    more: 'More formats',
    updated: 'Updated',
    downloads: 'Downloads',
    copy: 'Copy link',
    copied: 'Link copied',
    copyFailed: 'Could not copy — the link is',
    empty: 'The CV has not been published yet.',
    actions: 'CV actions',
    publications: 'Publications',
    qrCaption: 'Live CV · {url}',
    qrLabel: 'QR code linking to {url}',
    formats: {
      txt: 'Plain text',
      txtHint: '.txt · for paste-in application forms',
      json: 'JSON Resume',
      jsonHint: '.json · jsonresume.org schema',
      print: 'Print this page',
      printHint: 'A4, from your browser',
    },
  },
  'zh-Hans': {
    eyebrow: '个人简历',
    title: '简历',
    home: '首页',
    language: '语言',
    layout: '版式',
    reading: '阅读',
    a4: 'A4',
    pdf: '下载 PDF',
    more: '更多格式',
    updated: '更新于',
    downloads: '下载',
    copy: '复制链接',
    copied: '链接已复制',
    copyFailed: '无法复制，链接为',
    empty: '中文简历暂未发布。',
    actions: '简历操作',
    publications: '论文列表',
    qrCaption: '在线简历 · {url}',
    qrLabel: '指向 {url} 的二维码',
    formats: {
      txt: '纯文本',
      txtHint: '.txt · 适合粘贴到网申表单',
      json: 'JSON Resume',
      jsonHint: '.json · jsonresume.org 格式',
      print: '打印本页',
      printHint: 'A4，使用浏览器打印',
    },
  },
  'zh-Hant': {
    eyebrow: '個人履歷',
    title: '履歷',
    home: '首頁',
    language: '語言',
    layout: '版式',
    reading: '閱讀',
    a4: 'A4',
    pdf: '下載 PDF',
    more: '更多格式',
    updated: '更新於',
    downloads: '下載',
    copy: '複製連結',
    copied: '連結已複製',
    copyFailed: '無法複製，連結為',
    empty: '中文履歷尚未發佈。',
    actions: '履歷操作',
    publications: '論文列表',
    qrCaption: '線上履歷 · {url}',
    qrLabel: '指向 {url} 的 QR 碼',
    formats: {
      txt: '純文字',
      txtHint: '.txt · 適合貼到線上申請表單',
      json: 'JSON Resume',
      jsonHint: '.json · jsonresume.org 格式',
      print: '列印本頁',
      printHint: 'A4，使用瀏覽器列印',
    },
  },
}

/** The CV page's words for a CV language (/cv English, /cv/zh Simplified Chinese). */
export function cvUiFor(lang: CvLang): CvPageStrings {
  return lang === 'zh' ? CV_UI['zh-Hans'] : CV_UI.en
}
