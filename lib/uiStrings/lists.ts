import { uiLangOf, type UiLang, type UiTable } from './index'

/**
 * The index pages — /blog, /work and their Chinese pages /zh/blog and
 * /zh/work (F3) — in each interface language (lib/uiStrings): page copy,
 * the tag filter, the empty states, the "All projects" archive and the
 * index line of a piece with translations ("Also in 简体中文"). `{name}`
 * marks a value filled in with fillUi.
 *
 * Server-side: getStaticProps hands a page its own language's words
 * (listUiFor → props.ui), so no page bundles the other languages.
 */
export type ListStrings = {
  alsoIn: string
  /** The tag filter ({n}, {noun}, {tag}). */
  allTags: string
  taggedAnnouncement: string
  whereNext: string
  blog: {
    /** <title>, meta description ({name}: the owner), the Blog JSON-LD's name. */
    title: string
    description: string
    listName: string
    eyebrow: string
    heading: string
    lede: string
    filterLabel: string
    nounOne: string
    nounMany: string
    emptyTitle: string
    emptyBody: string
    /** {n}: minutes. */
    minutesRead: string
  }
  work: {
    title: string
    /** {name}; `descriptionWith` names the first case studies ({titles}). */
    description: string
    descriptionWith: string
    and: string
    listName: string
    eyebrow: string
    heading: string
    lede: string
    filterLabel: string
    nounOne: string
    nounMany: string
    emptyTitle: string
    emptyBody: string
    noCaseStudyUses: string
    featured: string
    live: string
    archived: string
  }
  archive: {
    heading: string
    /** {n} projects. */
    fromCv: string
    intro: string
    caption: string
    years: string
    project: string
    role: string
    builtWith: string
    links: string
    stack: string
    noDates: string
    noLinks: string
    notListed: string
    caseStudy: string
    site: string
    code: string
    newTab: string
    noneUsesThis: string
    /** The end of a range that has not ended ("2025 – now"). */
    ongoing: string
  }
  /** The empty state's links. */
  nav: { writing: string; work: string; cv: string }
}

export const LIST_UI: UiTable<ListStrings> = {
  en: {
    alsoIn: 'Also in',
    allTags: 'all',
    taggedAnnouncement: '{n} {noun} tagged {tag}',
    whereNext: 'Where to next',
    blog: {
      title: 'Writing',
      description: 'Essays, notes, and technical write-ups by {name} on software engineering, machine learning, and building products.',
      listName: 'Writing',
      eyebrow: 'Writing',
      heading: 'Notes, essays, and write-ups.',
      lede: 'Long-form pieces on engineering, ML, and the craft of shipping software. New posts land here when they’re ready — no drafts, no fluff.',
      filterLabel: 'Filter posts by tag',
      nounOne: 'post',
      nounMany: 'posts',
      emptyTitle: 'No posts yet',
      emptyBody: 'Posts will appear here as they’re published.',
      minutesRead: '{n} min read',
    },
    work: {
      title: 'Work',
      description: 'Selected project case studies and engineering write-ups by {name}.',
      descriptionWith: 'Selected project case studies and engineering write-ups by {name} — including {titles}.',
      and: ' and ',
      listName: 'Selected Work',
      eyebrow: 'Case studies',
      heading: 'Projects that shipped, with the story.',
      lede: 'Each entry is a written case study: the problem, the constraints, the decisions, and the outcome. No bullet points pretending to be a CV.',
      filterLabel: 'Filter projects by technology',
      nounOne: 'project',
      nounMany: 'projects',
      emptyTitle: 'No case studies yet',
      emptyBody: 'Case studies will appear here as they’re published.',
      noCaseStudyUses: 'No case study uses this yet — see the projects below.',
      featured: 'Featured',
      live: 'Live',
      archived: 'Archived',
    },
    archive: {
      heading: 'All projects',
      fromCv: '{n} from the CV',
      intro: 'Every project on my CV, newest first. Those with a write-up link to their case study.',
      caption: 'All projects from the CV, newest first',
      years: 'Years',
      project: 'Project',
      role: 'Role',
      builtWith: 'Built with',
      links: 'Links',
      stack: 'Stack',
      noDates: 'No dates',
      noLinks: 'No links',
      notListed: 'Not listed',
      caseStudy: 'Case study',
      site: 'Live',
      code: 'Code',
      newTab: ' (opens in a new tab)',
      noneUsesThis: 'No project in the archive lists this.',
      ongoing: 'now',
    },
    nav: { writing: 'Writing', work: 'Case studies', cv: 'CV' },
  },
  'zh-Hans': {
    alsoIn: '另有',
    allTags: '全部',
    taggedAnnouncement: '{n} {noun}带有标签“{tag}”',
    whereNext: '接下来去哪里',
    blog: {
      title: '文章',
      description: '{name}的文章、笔记与技术总结：软件工程、机器学习和做产品的经验。',
      listName: '文章',
      eyebrow: '文章',
      heading: '笔记、随笔与技术总结。',
      lede: '关于工程、机器学习和交付软件这门手艺的长文。写好了才发布，没有草稿，也没有凑数。',
      filterLabel: '按标签筛选文章',
      nounOne: '篇文章',
      nounMany: '篇文章',
      emptyTitle: '还没有文章',
      emptyBody: '文章发布后会显示在这里。',
      minutesRead: '阅读 {n} 分钟',
    },
    work: {
      title: '项目',
      description: '{name}的精选项目案例与工程总结。',
      descriptionWith: '{name}的精选项目案例与工程总结，包括{titles}。',
      and: '和',
      listName: '精选项目',
      eyebrow: '项目案例',
      heading: '已经上线的项目，以及背后的故事。',
      lede: '每一篇都是完整的项目案例：问题、限制、决策和结果，而不是换个样子的简历条目。',
      filterLabel: '按技术筛选项目',
      nounOne: '个项目',
      nounMany: '个项目',
      emptyTitle: '还没有项目案例',
      emptyBody: '项目案例发布后会显示在这里。',
      noCaseStudyUses: '还没有项目案例用到它，请看下面的项目列表。',
      featured: '精选',
      live: '运行中',
      archived: '已归档',
    },
    archive: {
      heading: '全部项目',
      fromCv: '简历中的 {n} 个项目',
      intro: '简历上的每一个项目，按时间从新到旧排列。有项目案例的会链接过去。',
      caption: '简历中的全部项目，按时间从新到旧排列',
      years: '年份',
      project: '项目',
      role: '角色',
      builtWith: '技术栈',
      links: '链接',
      stack: '技术栈',
      noDates: '无日期',
      noLinks: '无链接',
      notListed: '未填写',
      caseStudy: '项目案例',
      site: '网站',
      code: '代码',
      newTab: '（在新标签页中打开）',
      noneUsesThis: '项目列表中没有用到它的项目。',
      ongoing: '至今',
    },
    nav: { writing: '文章', work: '项目案例', cv: '简历' },
  },
  'zh-Hant': {
    alsoIn: '另有',
    allTags: '全部',
    taggedAnnouncement: '{n} {noun}帶有標籤「{tag}」',
    whereNext: '接下來去哪裡',
    blog: {
      title: '文章',
      description: '{name}的文章、筆記與技術總結：軟件工程、機器學習和做產品的經驗。',
      listName: '文章',
      eyebrow: '文章',
      heading: '筆記、隨筆與技術總結。',
      lede: '關於工程、機器學習和交付軟件這門手藝的長文。寫好了才發佈，沒有草稿，也沒有湊數。',
      filterLabel: '按標籤篩選文章',
      nounOne: '篇文章',
      nounMany: '篇文章',
      emptyTitle: '還沒有文章',
      emptyBody: '文章發佈後會顯示在這裡。',
      minutesRead: '閱讀 {n} 分鐘',
    },
    work: {
      title: '項目',
      description: '{name}的精選項目案例與工程總結。',
      descriptionWith: '{name}的精選項目案例與工程總結，包括{titles}。',
      and: '和',
      listName: '精選項目',
      eyebrow: '項目案例',
      heading: '已經上線的項目，以及背後的故事。',
      lede: '每一篇都是完整的項目案例：問題、限制、決策和結果，而不是換個樣子的履歷條目。',
      filterLabel: '按技術篩選項目',
      nounOne: '個項目',
      nounMany: '個項目',
      emptyTitle: '還沒有項目案例',
      emptyBody: '項目案例發佈後會顯示在這裡。',
      noCaseStudyUses: '還沒有項目案例用到它，請看下面的項目清單。',
      featured: '精選',
      live: '運行中',
      archived: '已封存',
    },
    archive: {
      heading: '全部項目',
      fromCv: '履歷中的 {n} 個項目',
      intro: '履歷上的每一個項目，按時間從新到舊排列。有項目案例的會連結過去。',
      caption: '履歷中的全部項目，按時間從新到舊排列',
      years: '年份',
      project: '項目',
      role: '角色',
      builtWith: '技術棧',
      links: '連結',
      stack: '技術棧',
      noDates: '無日期',
      noLinks: '無連結',
      notListed: '未填寫',
      caseStudy: '項目案例',
      site: '網站',
      code: '程式碼',
      newTab: '（在新分頁中開啟）',
      noneUsesThis: '項目清單中沒有用到它的項目。',
      ongoing: '至今',
    },
    nav: { writing: '文章', work: '項目案例', cv: '履歷' },
  },
}

/** The words an index page needs, in its language (getStaticProps → props.ui). */
export type ListUi = { lang: UiLang; t: ListStrings }

export function listUiFor(pageLang: string | undefined | null): ListUi {
  const lang = uiLangOf(pageLang)
  return { lang, t: LIST_UI[lang] }
}
