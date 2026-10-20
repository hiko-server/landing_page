import { uiLangOf, type UiLang, type UiTable } from './index'
import { ASK_ENTRY_EN, ASK_ENTRY_UI, type AskEntryStrings } from './askEntry'

/**
 * /about and /zh/about (F3) in each interface language (lib/uiStrings): the
 * page, the identity rail, the section headings, the CV stack's language
 * toggle and the recommendations. `{name}` marks a value filled in with
 * fillUi. The owner's words (tagline, bio, CV, recommendations) are never
 * here. English is the components' default (ABOUT_EN); a page in another
 * language ships its own words with its props (aboutUiFor).
 */
export type AboutStrings = {
  title: string
  /** {name}: the owner. */
  description: string
  profileName: string
  home: string
  focusAreas: string
  bio: string
  recommendations: string
  cv: string
  rail: {
    eyebrow: string
    /** {date}: 'YYYY-MM'. */
    from: string
    viewCv: string
    downloadPdf: string
    publications: string
    paperOne: string
    paperMany: string
    /** {count}: "3 papers". */
    publicationsLabel: string
    profiles: string
    newTab: string
    onThisPage: string
  }
  cvToggle: { language: string; cv: string; group: string }
  sourceNewTab: string
  /** Section names when a CV section has no heading of its own (components/About/aboutNav). */
  sections: {
    education: string
    workExperience: string
    project: string
    patents: string
    competitionAwards: string
    skill: string
    extraSkill: string
    certification: string
  }
  ask: AskEntryStrings
}

export const ABOUT_EN: AboutStrings = {
  title: 'About',
  description: 'About {name}, a software engineer in Hong Kong: background, education, experience, projects, skills, patents and awards.',
  profileName: 'About — {name}',
  home: 'Home',
  focusAreas: 'Focus areas',
  bio: 'Bio',
  recommendations: 'Recommendations',
  cv: 'CV',
  rail: {
    eyebrow: 'About',
    from: 'from {date}',
    viewCv: 'View CV',
    downloadPdf: 'Download PDF',
    publications: 'Publications',
    paperOne: '1 paper',
    paperMany: '{n} papers',
    publicationsLabel: 'Publications: {count}',
    profiles: 'Profiles',
    newTab: ' (opens in a new tab)',
    onThisPage: 'On this page',
  },
  cvToggle: { language: 'Language', cv: 'CV', group: 'CV language' },
  sourceNewTab: ' (source, opens in a new tab)',
  sections: {
    education: 'Education',
    workExperience: 'Experience',
    project: 'Projects',
    patents: 'Patents',
    competitionAwards: 'Awards',
    skill: 'Skills',
    extraSkill: 'More skills',
    certification: 'Certifications',
  },
  ask: ASK_ENTRY_EN,
}

type AboutTables = Omit<AboutStrings, 'ask'>

const ZH_HANS: AboutTables = {
  title: '关于',
  description: '关于{name}：背景、教育、工作经历、项目、技能、专利与奖项。',
  profileName: '关于 — {name}',
  home: '首页',
  focusAreas: '关注领域',
  bio: '简介',
  recommendations: '推荐语',
  cv: '简历',
  rail: {
    eyebrow: '关于',
    from: '{date} 起',
    viewCv: '查看简历',
    downloadPdf: '下载 PDF',
    publications: '论文',
    paperOne: '1 篇论文',
    paperMany: '{n} 篇论文',
    publicationsLabel: '论文：{count}',
    profiles: '个人主页',
    newTab: '（在新标签页中打开）',
    onThisPage: '本页目录',
  },
  cvToggle: { language: '语言', cv: '简历', group: '简历语言' },
  sourceNewTab: '（出处，在新标签页中打开）',
  sections: {
    education: '教育经历',
    workExperience: '工作经历',
    project: '项目经历',
    patents: '专利',
    competitionAwards: '竞赛与奖项',
    skill: '技能',
    extraSkill: '其他技能',
    certification: '证书',
  },
}

const ZH_HANT: AboutTables = {
  title: '關於',
  description: '關於{name}：背景、教育、工作經歷、項目、技能、專利與獎項。',
  profileName: '關於 — {name}',
  home: '首頁',
  focusAreas: '關注領域',
  bio: '簡介',
  recommendations: '推薦語',
  cv: '履歷',
  rail: {
    eyebrow: '關於',
    from: '{date} 起',
    viewCv: '查看履歷',
    downloadPdf: '下載 PDF',
    publications: '論文',
    paperOne: '1 篇論文',
    paperMany: '{n} 篇論文',
    publicationsLabel: '論文：{count}',
    profiles: '個人主頁',
    newTab: '（在新分頁中開啟）',
    onThisPage: '本頁目錄',
  },
  cvToggle: { language: '語言', cv: '履歷', group: '履歷語言' },
  sourceNewTab: '（出處，在新分頁中開啟）',
  sections: {
    education: '教育經歷',
    workExperience: '工作經歷',
    project: '項目經歷',
    patents: '專利',
    competitionAwards: '競賽與獎項',
    skill: '技能',
    extraSkill: '其他技能',
    certification: '證書',
  },
}

export const ABOUT_UI: UiTable<AboutStrings> = {
  en: ABOUT_EN,
  'zh-Hans': { ...ZH_HANS, ask: ASK_ENTRY_UI['zh-Hans'] },
  'zh-Hant': { ...ZH_HANT, ask: ASK_ENTRY_UI['zh-Hant'] },
}

/** The words an about page needs, in its language (getStaticProps → props.ui). */
export type AboutUi = { lang: UiLang; t: AboutStrings }

export function aboutUiFor(pageLang: string | undefined | null): AboutUi {
  const lang = uiLangOf(pageLang)
  return { lang, t: ABOUT_UI[lang] }
}
