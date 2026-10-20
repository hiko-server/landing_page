import type { UiTable } from './index'
import type { CvLang } from '../cvVisibility'

/**
 * Words the CV's field helpers put into text (components/CVViewerPage
 * fields.ts): the certificate validity line and the CV page's meta
 * description, in each interface language (lib/uiStrings). Kept apart from
 * ./cv (the page's controls) because the CV sheet on /about, the PDF and
 * the "Ask" index use them too. Pure and server-safe.
 * `{name}` marks a value filled in with fillUi.
 */

/** The CV sections a meta description may name (fields.ts SEO_SECTIONS), in mention order. */
export const CV_SEO_SECTIONS = ['education', 'workExperience', 'project', 'publications', 'patents', 'competitionAwards', 'certification'] as const
export type CvSeoSection = (typeof CV_SEO_SECTIONS)[number]

export type CvFieldStrings = {
  /** "Expires Dec 2027": a certificate with only an expiry date. */
  expires: string
  /** The meta description of /cv and /cv/zh. */
  seo: {
    sections: Record<CvSeoSection, string>
    /** Between the names of a list, and before its last one. */
    listSep: string
    listLast: string
    /** {who}: the owner's name, {sections}: the list of section names. */
    withSections: string
    noSections: string
  }
}

export const CV_FIELDS_UI: UiTable<CvFieldStrings> = {
  en: {
    expires: 'Expires',
    seo: {
      sections: {
        education: 'education',
        workExperience: 'experience',
        project: 'projects',
        publications: 'publications',
        patents: 'patents',
        competitionAwards: 'awards',
        certification: 'certifications',
      },
      listSep: ', ',
      listLast: ' and ',
      withSections: 'The CV / résumé of {who} in English and Chinese: {sections}, printable as an A4 PDF.',
      noSections: 'The CV / résumé of {who} in English and Chinese, printable as an A4 PDF.',
    },
  },
  'zh-Hans': {
    expires: '有效期至',
    seo: {
      sections: {
        education: '教育',
        workExperience: '工作经历',
        project: '项目',
        publications: '论文',
        patents: '专利',
        competitionAwards: '奖项',
        certification: '证书',
      },
      listSep: '、',
      listLast: '与',
      // The tail keeps even a CV without public sections at a useful length
      // (≥ 70 display columns) using only facts about the page itself.
      withSections: '{who}的中文简历：{sections}，另有英文版，可在线浏览，也可打印或保存为 A4 PDF。',
      noSections: '{who}的中文简历，另有英文版，可在线浏览，也可打印或保存为 A4 PDF。',
    },
  },
  'zh-Hant': {
    expires: '有效期至',
    seo: {
      sections: {
        education: '教育',
        workExperience: '工作經歷',
        project: '專案',
        publications: '論文',
        patents: '專利',
        competitionAwards: '獎項',
        certification: '證照',
      },
      listSep: '、',
      listLast: '與',
      withSections: '{who}的中文履歷：{sections}，另有英文版，可線上瀏覽，也可列印或儲存為 A4 PDF。',
      noSections: '{who}的中文履歷，另有英文版，可線上瀏覽，也可列印或儲存為 A4 PDF。',
    },
  },
}

/** The field words for a CV language (English, or the Chinese CV's Simplified Chinese). */
export function cvFieldsUiFor(lang: CvLang): CvFieldStrings {
  return lang === 'zh' ? CV_FIELDS_UI['zh-Hans'] : CV_FIELDS_UI.en
}
