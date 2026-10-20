import { uiLangOf, type UiLang, type UiTable } from './index'
import type { ContactStrings } from './contact'
import { GITHUB_EN, type GithubWords } from './github-en'

export type { GithubWords }

/**
 * The home page — / and its Chinese page /zh (F3) — in each interface
 * language (lib/uiStrings): the hero's controls, the section headings, the
 * GitHub widgets (with the words of their activity lines, relative times and
 * dates), skills, projects, publications, writing, experience,
 * certifications, the field notes and the contact band. `{name}` marks a
 * value filled in with fillUi.
 *
 * Every page that renders these components ships its own language's words
 * with its props (homeUiFor → props.ui, provided to the widgets by
 * components/LandingPage/homeUi), so the home page's JavaScript carries no
 * table at all. The owner's words (tagline, highlights, captions, CV, the
 * contact copy) are never here.
 */

export type HomeStrings = {
  hero: {
    availability: { open: string; limited: string; closed: string }
    viewCv: string
    getInTouch: string
    profiles: string
    /** The "currently coding" chip's built-in labels (lib/currentlyCoding CODING_LABEL / STUDYING_LABEL). */
    coding: string
    studying: string
  }
  newTab: string
  sections: {
    'open-source': string
    'tech-stack': string
    activity: string
    projects: string
    publications: string
    writing: string
    experience: string
    certifications: string
    photos: string
    contact: string
  }
  languagesHeading: string
  repositoriesHeading: string
  pageSections: string
  /** {label}. */
  jumpTo: string
  highlights: string
  affiliations: string
  affiliation: string
  widgetFailed: string
  retry: string
  tryAgain: string
  stats: {
    label: string
    unavailable: string
    noProfile: string
    tiles: { repos: string; contributions: string; languages: string; followers: string; stars: string }
  }
  calendar: {
    /** {n}: the total. */
    total: string
    loading: string
    label: string
    scroller: string
    less: string
    more: string
    /** "{count} contributions" for a count ({n}); `none` for 0. */
    none: string
    one: string
    many: string
    /** Sentences of the screen-reader summary. */
    range: string
    active: string
    busiestDay: string
    busiestMonth: string
    streak: string
  }
  languageStack: {
    unavailable: string
    loading: string
    empty: string
    label: string
    /** ", top {top} of {count}" after the label. */
    labelTop: string
    other: string
  }
  repos: {
    unavailable: string
    loading: string
    empty: string
    label: string
    stars: string
    forks: string
    featured: string
    /** {when}: a relative time. */
    updated: string
    newTab: string
  }
  activity: {
    unavailable: string
    loading: string
    empty: string
    label: string
    newTab: string
    /** {n}. */
    eventsIn: string
  }
  github: GithubWords
  skills: { core: string; fallback: string }
  projects: {
    status: { live: string; archived: string; 'case-study': string }
    scrollLeft: string
    scrollRight: string
    region: string
    readCaseStudy: string
    tech: string
    more: string
    less: string
    /** The count above the scroller ({n}): one project, several. */
    countOne: string
    countMany: string
  }
  experience: {
    /** {n}. */
    highlights: string
    skills: string
    caseStudy: string
    relatedSkills: string
  }
  certificationLink: string
  publications: {
    all: string
    /** {n}. */
    allN: string
  }
  writing: {
    post: string
    work: string
    postSr: string
    workSr: string
    updated: string
    /** {n}. */
    minutes: string
    allWriting: string
    allWork: string
  }
  photos: {
    region: string
    scroller: string
    /** {i} {n}; {i} {j} {n} for a range. */
    photo: string
    photoRange: string
    enlarge: string
    visit: string
    /** {label}. */
    link: string
    choose: string
    pause: string
    play: string
    previous: string
    next: string
  }
  contactBand: { fallbackLede: string; writeToMe: string }
  /** The availability card (components/Contact/AvailabilityCard), as on /contact. */
  availability: ContactStrings['availability']
}

const GITHUB_ZH_HANS: GithubWords = {
  pushedN: '推送了 {n} 个提交至',
  pushedOne: '推送了 1 个提交至',
  pushed: '推送至',
  prOpened: '新建 PR{num}：',
  prClosed: '关闭 PR{num}：',
  prUpdated: '更新 PR{num}：',
  issueOpened: '新建议题{num}：',
  issueClosed: '关闭议题{num}：',
  issueUpdated: '更新议题{num}：',
  createdRepo: '新建仓库：',
  createdRef: '新建{ref}：',
  refWords: { branch: '分支', tag: '标签', ref: '引用' },
  updated: '更新了',
  starred: '标星了',
  forked: '复刻了',
  released: '发布了新版本：',
  other: '动态：',
  activity: '动态：',
  summary: {
    commit: ['{n} 个提交', '{n} 个提交'],
    push: ['{n} 次推送', '{n} 次推送'],
    pr: ['PR', 'PR'],
    prCount: ['{n} 个 PR', '{n} 个 PR'],
    issue: ['议题', '议题'],
    issueCount: ['{n} 个议题', '{n} 个议题'],
    comment: ['{n} 条评论', '{n} 条评论'],
    review: ['{n} 次审查', '{n} 次审查'],
    reviewComment: ['{n} 条审查评论', '{n} 条审查评论'],
    branch: ['{n} 个分支', '{n} 个分支'],
    tag: ['{n} 个标签', '{n} 个标签'],
    ref: ['{n} 个引用', '{n} 个引用'],
    deletion: ['{n} 次删除', '{n} 次删除'],
    release: ['{n} 个版本', '{n} 个版本'],
    other: ['{n} 项其他动态', '{n} 项其他动态'],
    created: '新建了仓库',
    starred: '标星',
    forked: '复刻',
    updated: '更新',
    sep: '、',
  },
  justNow: '刚刚',
  minutesAgo: '{n} 分钟前',
  hoursAgo: '{n} 小时前',
  daysAgo: '{n} 天前',
  date: '{y}年{m}月{d}日',
  dateTime: '{y}年{m}月{d}日 {hh}:{mm} UTC',
  day: '{m}月{d}日',
  dayWithYear: '{y}年{m}月{d}日',
  monthYear: '{y}年{m}月',
  months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  monthsLong: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
}

const GITHUB_ZH_HANT: GithubWords = {
  ...GITHUB_ZH_HANS,
  pushedN: '推送了 {n} 個提交至',
  pushedOne: '推送了 1 個提交至',
  prOpened: '新建 PR{num}：',
  prClosed: '關閉 PR{num}：',
  prUpdated: '更新 PR{num}：',
  issueOpened: '新建議題{num}：',
  issueClosed: '關閉議題{num}：',
  issueUpdated: '更新議題{num}：',
  createdRepo: '新建儲存庫：',
  createdRef: '新建{ref}：',
  refWords: { branch: '分支', tag: '標籤', ref: '參照' },
  updated: '更新了',
  starred: '加星了',
  forked: '分叉了',
  released: '發佈了新版本：',
  other: '動態：',
  activity: '動態：',
  summary: {
    commit: ['{n} 個提交', '{n} 個提交'],
    push: ['{n} 次推送', '{n} 次推送'],
    pr: ['PR', 'PR'],
    prCount: ['{n} 個 PR', '{n} 個 PR'],
    issue: ['議題', '議題'],
    issueCount: ['{n} 個議題', '{n} 個議題'],
    comment: ['{n} 則留言', '{n} 則留言'],
    review: ['{n} 次審查', '{n} 次審查'],
    reviewComment: ['{n} 則審查留言', '{n} 則審查留言'],
    branch: ['{n} 個分支', '{n} 個分支'],
    tag: ['{n} 個標籤', '{n} 個標籤'],
    ref: ['{n} 個參照', '{n} 個參照'],
    deletion: ['{n} 次刪除', '{n} 次刪除'],
    release: ['{n} 個版本', '{n} 個版本'],
    other: ['{n} 項其他動態', '{n} 項其他動態'],
    created: '新建了儲存庫',
    starred: '加星',
    forked: '分叉',
    updated: '更新',
    sep: '、',
  },
  minutesAgo: '{n} 分鐘前',
  hoursAgo: '{n} 小時前',
}

export const HOME_UI: UiTable<HomeStrings> = {
  en: {
    hero: {
      availability: { open: 'Available for work', limited: 'Limited availability', closed: 'Not taking new work' },
      viewCv: 'View CV',
      getInTouch: 'Get in touch',
      profiles: 'Profiles',
      coding: 'currently coding',
      studying: 'currently studying',
    },
    newTab: ' (opens in a new tab)',
    sections: {
      'open-source': 'Open Source',
      'tech-stack': 'Skills',
      activity: 'Recent Activity',
      projects: 'Selected Projects',
      publications: 'Selected Publications',
      writing: 'Writing & case studies',
      experience: 'Experience',
      certifications: 'Certifications',
      photos: 'Field Notes',
      contact: 'Get In Touch',
    },
    languagesHeading: 'Languages',
    repositoriesHeading: 'Repositories',
    pageSections: 'Page sections',
    jumpTo: 'Jump to {label}',
    highlights: 'Highlights',
    affiliations: 'Affiliations',
    affiliation: 'Affiliation',
    widgetFailed: 'This section couldn’t load.',
    retry: 'Retry',
    tryAgain: 'Try again',
    stats: {
      label: 'GitHub stats',
      unavailable: 'GitHub stats are unavailable right now.',
      noProfile: 'No GitHub profile is linked yet.',
      tiles: { repos: 'Public repos', contributions: 'Contributions (last year)', languages: 'Languages', followers: 'Followers', stars: 'Total stars' },
    },
    calendar: {
      total: '{n} contributions in the last year',
      loading: 'Loading contribution calendar',
      label: 'Contribution calendar',
      scroller: 'Contribution calendar, scrolls sideways',
      less: 'Less',
      more: 'More',
      none: 'No contributions',
      one: '{n} contribution',
      many: '{n} contributions',
      range: '{count} between {from} and {to}.',
      active: 'Active on {active} of {days} days.',
      busiestDay: 'Busiest day: {day}, with {count}.',
      busiestMonth: 'Busiest month: {month}, with {count}.',
      streak: 'Longest streak: {n} days in a row.',
    },
    languageStack: {
      unavailable: 'Language breakdown is unavailable right now.',
      loading: 'Loading language breakdown',
      empty: 'No language data to show yet.',
      label: 'Languages by share of code',
      labelTop: ', top {top} of {count}',
      other: 'Other',
    },
    repos: {
      unavailable: 'Repositories couldn’t be loaded from GitHub.',
      loading: 'Loading repositories',
      empty: 'No public repositories to show yet.',
      label: 'Repositories',
      stars: ' stars',
      forks: ' forks',
      featured: 'Featured',
      updated: 'updated {when}',
      newTab: ' (opens GitHub in a new tab)',
    },
    activity: {
      unavailable: 'Recent activity couldn’t be loaded from GitHub.',
      loading: 'Loading recent activity',
      empty: 'No recent public GitHub activity.',
      label: 'Recent GitHub activity',
      newTab: ' (opens GitHub in a new tab)',
      eventsIn: '{n} events in',
    },
    github: GITHUB_EN,
    skills: { core: 'Core skills', fallback: 'Skills' },
    projects: {
      status: { live: 'Live', archived: 'Archived', 'case-study': 'Case study' },
      scrollLeft: 'Scroll projects left',
      scrollRight: 'Scroll projects right',
      region: 'Selected projects (scrolls horizontally)',
      readCaseStudy: ' — read case study',
      tech: 'Tech',
      more: 'More',
      less: 'Less',
      countOne: '{n} project · scroll →',
      countMany: '{n} projects · scroll →',
    },
    experience: { highlights: 'Highlights ({n})', skills: 'Skills ({n})', caseStudy: 'Case study', relatedSkills: 'Related skills' },
    certificationLink: ' (credential, opens in a new tab)',
    publications: { all: 'All publications', allN: 'All {n} publications' },
    writing: {
      post: 'POST',
      work: 'WORK',
      postSr: ' post: ',
      workSr: ' case study: ',
      updated: 'updated ',
      minutes: '{n} min',
      allWriting: 'All writing',
      allWork: 'All case studies',
    },
    photos: {
      region: 'Field notes photos',
      scroller: 'Photos (scrolls horizontally)',
      photo: 'Photo {i} of {n}',
      photoRange: 'Photos {i}–{j} of {n}',
      enlarge: 'Enlarge photo: {alt}',
      visit: 'Visit',
      link: '{label} link',
      choose: 'Choose position',
      pause: 'Pause slideshow',
      play: 'Play slideshow',
      previous: 'Previous photos',
      next: 'Next photos',
    },
    contactBand: { fallbackLede: 'Questions, roles or collaborations: send a note.', writeToMe: 'Write to me' },
    availability: {
      open: 'Available for new work',
      limited: 'Limited availability',
      closed: 'Not taking on new work',
      from: 'From {date}',
      workAuth: 'work authorisation',
      roles: 'Roles',
      bookCall: 'Book a call',
      newTab: ' (opens in a new tab)',
    },
  },
  'zh-Hans': {
    hero: {
      availability: { open: '可以承接工作', limited: '档期有限', closed: '暂不承接新工作' },
      viewCv: '查看简历',
      getInTouch: '与我联系',
      profiles: '个人主页',
      coding: '正在开发',
      studying: '正在就读',
    },
    newTab: '（在新标签页中打开）',
    sections: {
      'open-source': '开源',
      'tech-stack': '技能',
      activity: '近期动态',
      projects: '精选项目',
      publications: '精选论文',
      writing: '文章与项目案例',
      experience: '工作经历',
      certifications: '证书',
      photos: '随手记',
      contact: '联系我',
    },
    languagesHeading: '编程语言',
    repositoriesHeading: '代码仓库',
    pageSections: '页面章节',
    jumpTo: '跳到{label}',
    highlights: '亮点',
    affiliations: '合作与经历',
    affiliation: '机构',
    widgetFailed: '这一部分未能加载。',
    retry: '重试',
    tryAgain: '再试一次',
    stats: {
      label: 'GitHub 数据',
      unavailable: '暂时无法获取 GitHub 数据。',
      noProfile: '还没有关联 GitHub 账号。',
      tiles: { repos: '公开仓库', contributions: '贡献（近一年）', languages: '编程语言', followers: '关注者', stars: '获得星标' },
    },
    calendar: {
      total: '近一年 {n} 次贡献',
      loading: '正在加载贡献日历',
      label: '贡献日历',
      scroller: '贡献日历，可左右滚动',
      less: '少',
      more: '多',
      none: '没有贡献',
      one: '{n} 次贡献',
      many: '{n} 次贡献',
      range: '{from}至{to}共{count}。',
      active: '{days} 天中有 {active} 天有贡献。',
      busiestDay: '最活跃的一天：{day}，{count}。',
      busiestMonth: '最活跃的月份：{month}，{count}。',
      streak: '最长连续贡献：{n} 天。',
    },
    languageStack: {
      unavailable: '暂时无法获取编程语言分布。',
      loading: '正在加载编程语言分布',
      empty: '暂无编程语言数据。',
      label: '按代码占比排列的编程语言',
      labelTop: '，{count} 种中的前 {top} 种',
      other: '其他',
    },
    repos: {
      unavailable: '暂时无法从 GitHub 加载代码仓库。',
      loading: '正在加载代码仓库',
      empty: '暂无可展示的公开仓库。',
      label: '代码仓库',
      stars: ' 个星标',
      forks: ' 个复刻',
      featured: '精选',
      updated: '{when}更新',
      newTab: '（在新标签页中打开 GitHub）',
    },
    activity: {
      unavailable: '暂时无法从 GitHub 加载近期动态。',
      loading: '正在加载近期动态',
      empty: '近期没有公开的 GitHub 动态。',
      label: 'GitHub 近期动态',
      newTab: '（在新标签页中打开 GitHub）',
      eventsIn: '{n} 项动态：',
    },
    github: GITHUB_ZH_HANS,
    skills: { core: '核心技能', fallback: '技能' },
    projects: {
      status: { live: '运行中', archived: '已归档', 'case-study': '项目案例' },
      scrollLeft: '向左滚动项目',
      scrollRight: '向右滚动项目',
      region: '精选项目（可左右滚动）',
      readCaseStudy: '：阅读项目案例',
      tech: '技术栈',
      more: '展开',
      less: '收起',
      countOne: '{n} 个项目 · 左右滑动 →',
      countMany: '{n} 个项目 · 左右滑动 →',
    },
    experience: { highlights: '亮点（{n}）', skills: '技能（{n}）', caseStudy: '项目案例', relatedSkills: '相关技能' },
    certificationLink: '（证书链接，在新标签页中打开）',
    publications: { all: '全部论文', allN: '全部 {n} 篇论文' },
    writing: {
      post: '文章',
      work: '案例',
      postSr: '文章：',
      workSr: '项目案例：',
      updated: '更新于',
      minutes: '{n} 分钟',
      allWriting: '全部文章',
      allWork: '全部项目案例',
    },
    photos: {
      region: '随手记照片',
      scroller: '照片（可左右滚动）',
      photo: '第 {i} 张，共 {n} 张',
      photoRange: '第 {i}–{j} 张，共 {n} 张',
      enlarge: '放大照片：{alt}',
      visit: '前往',
      link: '{label}的链接',
      choose: '选择位置',
      pause: '暂停轮播',
      play: '播放轮播',
      previous: '上一组照片',
      next: '下一组照片',
    },
    contactBand: { fallbackLede: '无论是问题、职位机会还是合作，都欢迎留言。', writeToMe: '给我留言' },
    availability: {
      open: '可以承接新工作',
      limited: '档期有限',
      closed: '暂不承接新工作',
      from: '{date} 起',
      workAuth: '工作许可',
      roles: '意向职位',
      bookCall: '预约通话',
      newTab: '（在新标签页中打开）',
    },
  },
  'zh-Hant': {
    hero: {
      availability: { open: '可以承接工作', limited: '檔期有限', closed: '暫不承接新工作' },
      viewCv: '查看履歷',
      getInTouch: '與我聯絡',
      profiles: '個人主頁',
      coding: '正在開發',
      studying: '正在就讀',
    },
    newTab: '（在新分頁中開啟）',
    sections: {
      'open-source': '開源',
      'tech-stack': '技能',
      activity: '近期動態',
      projects: '精選項目',
      publications: '精選論文',
      writing: '文章與項目案例',
      experience: '工作經歷',
      certifications: '證書',
      photos: '隨手記',
      contact: '聯絡我',
    },
    languagesHeading: '程式語言',
    repositoriesHeading: '程式碼儲存庫',
    pageSections: '頁面章節',
    jumpTo: '跳到{label}',
    highlights: '亮點',
    affiliations: '合作與經歷',
    affiliation: '機構',
    widgetFailed: '這一部分未能載入。',
    retry: '重試',
    tryAgain: '再試一次',
    stats: {
      label: 'GitHub 數據',
      unavailable: '暫時無法取得 GitHub 數據。',
      noProfile: '還沒有連結 GitHub 帳號。',
      tiles: { repos: '公開儲存庫', contributions: '貢獻（近一年）', languages: '程式語言', followers: '追蹤者', stars: '獲得星號' },
    },
    calendar: {
      total: '近一年 {n} 次貢獻',
      loading: '正在載入貢獻日曆',
      label: '貢獻日曆',
      scroller: '貢獻日曆，可左右捲動',
      less: '少',
      more: '多',
      none: '沒有貢獻',
      one: '{n} 次貢獻',
      many: '{n} 次貢獻',
      range: '{from}至{to}共{count}。',
      active: '{days} 天中有 {active} 天有貢獻。',
      busiestDay: '最活躍的一天：{day}，{count}。',
      busiestMonth: '最活躍的月份：{month}，{count}。',
      streak: '最長連續貢獻：{n} 天。',
    },
    languageStack: {
      unavailable: '暫時無法取得程式語言分佈。',
      loading: '正在載入程式語言分佈',
      empty: '暫無程式語言數據。',
      label: '按程式碼佔比排列的程式語言',
      labelTop: '，{count} 種中的前 {top} 種',
      other: '其他',
    },
    repos: {
      unavailable: '暫時無法從 GitHub 載入儲存庫。',
      loading: '正在載入儲存庫',
      empty: '暫無可展示的公開儲存庫。',
      label: '程式碼儲存庫',
      stars: ' 個星號',
      forks: ' 個分叉',
      featured: '精選',
      updated: '{when}更新',
      newTab: '（在新分頁中開啟 GitHub）',
    },
    activity: {
      unavailable: '暫時無法從 GitHub 載入近期動態。',
      loading: '正在載入近期動態',
      empty: '近期沒有公開的 GitHub 動態。',
      label: 'GitHub 近期動態',
      newTab: '（在新分頁中開啟 GitHub）',
      eventsIn: '{n} 項動態：',
    },
    github: GITHUB_ZH_HANT,
    skills: { core: '核心技能', fallback: '技能' },
    projects: {
      status: { live: '運行中', archived: '已封存', 'case-study': '項目案例' },
      scrollLeft: '向左捲動項目',
      scrollRight: '向右捲動項目',
      region: '精選項目（可左右捲動）',
      readCaseStudy: '：閱讀項目案例',
      tech: '技術棧',
      more: '展開',
      less: '收起',
      countOne: '{n} 個項目 · 左右滑動 →',
      countMany: '{n} 個項目 · 左右滑動 →',
    },
    experience: { highlights: '亮點（{n}）', skills: '技能（{n}）', caseStudy: '項目案例', relatedSkills: '相關技能' },
    certificationLink: '（證書連結，在新分頁中開啟）',
    publications: { all: '全部論文', allN: '全部 {n} 篇論文' },
    writing: {
      post: '文章',
      work: '案例',
      postSr: '文章：',
      workSr: '項目案例：',
      updated: '更新於',
      minutes: '{n} 分鐘',
      allWriting: '全部文章',
      allWork: '全部項目案例',
    },
    photos: {
      region: '隨手記照片',
      scroller: '照片（可左右捲動）',
      photo: '第 {i} 張，共 {n} 張',
      photoRange: '第 {i}–{j} 張，共 {n} 張',
      enlarge: '放大照片：{alt}',
      visit: '前往',
      link: '{label}的連結',
      choose: '選擇位置',
      pause: '暫停輪播',
      play: '播放輪播',
      previous: '上一組照片',
      next: '下一組照片',
    },
    contactBand: { fallbackLede: '無論是問題、職位機會還是合作，都歡迎留言。', writeToMe: '給我留言' },
    availability: {
      open: '可以承接新工作',
      limited: '檔期有限',
      closed: '暫不承接新工作',
      from: '{date} 起',
      workAuth: '工作許可',
      roles: '意向職位',
      bookCall: '預約通話',
      newTab: '（在新分頁中開啟）',
    },
  },
}

/** The words a home page ships (getStaticProps → props.ui): its interface language and table. */
export type HomeUi = { lang: UiLang; t: HomeStrings }

export function homeUiFor(pageLang: string | undefined | null): HomeUi {
  const lang = uiLangOf(pageLang)
  return { lang, t: HOME_UI[lang] }
}

/** The GitHub words for a page language (server loaders that word data up front). */
export function githubWordsFor(pageLang: string | undefined | null): GithubWords {
  return HOME_UI[uiLangOf(pageLang)].github
}
