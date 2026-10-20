/**
 * The words of "Ask Lucian" / 问问 Lucian in the palette (components/Search/
 * AskView, the Search / Ask switch, the "Ask" rows), in English and Chinese. The answer view
 * speaks the question's language; with no question yet it follows the page.
 * Kept here, not in a shared dictionary, so the palette chunk carries them
 * only when Ask is used.
 */

export type AskLang = 'en' | 'zh'

export type AskCopy = {
  name: string
  modeSearch: string
  modeAsk: string
  modes: string
  placeholder: string
  inputLabel: string
  intro: string
  tryAsking: string
  loading: string
  unavailable: string
  sources: string
  quotesOnly: string
  answerFrom: (sources: number) => string
  partial: (missing: string) => string
  more: (n: number) => string
  none: string
  noneHint: string
  vague: string
  askDirectly: string
  askDirectlyHint: string
  notQuite: string
  searchInstead: (q: string) => string
  askRow: (q: string) => string
  askRowHint: string
  askAction: string
  askActionHint: string
  openHint: string
  askHint: string
  writeHint: string
  searchHint: string
  sourceLabel: string
  facts: string
  kind: Record<string, string>
  status: {
    loading: string
    suggestions: (n: number) => string
    answered: (quotes: number, sources: number) => string
    partial: (quotes: number) => string
    none: string
    vague: string
    unavailable: string
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const ASK_COPY: Record<AskLang, AskCopy> = {
  en: {
    name: 'Ask Lucian',
    modeSearch: 'Search',
    modeAsk: 'Ask',
    modes: 'Palette mode',
    placeholder: 'Ask about his work, studies, projects…',
    inputLabel: 'Ask a question about Lucian — answered with quotes from this site',
    intro: 'Answers are quotes from this site — the CV, posts and pages — each linked to where it appears. Nothing is generated.',
    tryAsking: 'Try asking',
    loading: 'Reading the site…',
    unavailable: 'The site’s passages could not be loaded. Check the connection and try again.',
    sources: 'Sources',
    quotesOnly: 'Quotes only',
    answerFrom: (n) => `From ${plural(n, 'place', 'places')} on this site`,
    partial: (missing) => `Nothing here mentions “${missing}”. The closest quotes:`,
    more: (n) => `${plural(n, 'more line', 'more lines')} in this entry`,
    none: 'Nothing on this site answers that yet.',
    noneHint: 'No quote matches, so there is no answer — rather than a guess.',
    vague: 'Ask about something specific: a skill, a role, a place or a topic.',
    askDirectly: 'Ask Lucian directly',
    askDirectlyHint: 'Your question goes into the contact form.',
    notQuite: 'Not what you were after?',
    searchInstead: (q) => `Search the site for “${q}”`,
    askRow: (q) => `Ask: ${q}`,
    askRowHint: 'answer with quotes from this site',
    askAction: 'Ask Lucian a question',
    askActionHint: 'answers quoted from this site',
    openHint: 'open',
    askHint: 'ask',
    writeHint: 'write',
    searchHint: 'search',
    sourceLabel: 'Source',
    facts: 'Facts',
    kind: { cv: 'CV', post: 'Post', work: 'Case study', page: 'Page', publication: 'Paper' },
    status: {
      loading: 'Loading the site’s passages',
      suggestions: (n) => `${plural(n, 'suggested question', 'suggested questions')}`,
      answered: (q, s) => `${plural(q, 'quote', 'quotes')} from ${plural(s, 'source', 'sources')}`,
      partial: (q) => `No full answer; ${plural(q, 'related quote', 'related quotes')}`,
      none: 'No answer on this site',
      vague: 'Ask about something specific',
      unavailable: 'Passages unavailable',
    },
  },
  zh: {
    name: '问问 Lucian',
    modeSearch: '搜索',
    modeAsk: '提问',
    modes: '模式',
    placeholder: '问问他的工作、学业、项目……',
    inputLabel: '向 Lucian 提问——答案全部引用自本站原文',
    intro: '答案只引用本站原文（简历、文章和页面），并附上出处链接，不生成任何内容。',
    tryAsking: '可以这样问',
    loading: '正在读取本站内容……',
    unavailable: '无法加载本站段落，请检查网络后重试。',
    sources: '出处',
    quotesOnly: '仅引用原文',
    answerFrom: (n) => `来自本站 ${n} 处原文`,
    partial: (missing) => `本站没有提到“${missing}”。最接近的原文：`,
    more: (n) => `此条目还有 ${n} 行相关内容`,
    none: '本站暂时没有能回答这个问题的内容。',
    noneHint: '找不到对应原文时，不作任何猜测。',
    vague: '请问得具体一些：比如技能、职位、地点或主题。',
    askDirectly: '直接问 Lucian',
    askDirectlyHint: '你的问题会填入联系表单。',
    notQuite: '没找到想要的？',
    searchInstead: (q) => `在本站搜索“${q}”`,
    askRow: (q) => `提问：${q}`,
    askRowHint: '用本站原文回答',
    askAction: '向 Lucian 提问',
    askActionHint: '答案引用自本站原文',
    openHint: '打开',
    askHint: '提问',
    writeHint: '填写',
    searchHint: '搜索',
    sourceLabel: '出处',
    facts: '要点',
    kind: { cv: '简历', post: '文章', work: '案例', page: '页面', publication: '论文' },
    status: {
      loading: '正在加载本站段落',
      suggestions: (n) => `${n} 个推荐问题`,
      answered: (q, s) => `${q} 段原文，来自 ${s} 处`,
      partial: (q) => `没有完整答案，${q} 段相关原文`,
      none: '本站没有答案',
      vague: '请问得具体一些',
      unavailable: '无法加载段落',
    },
  },
}

/** The copy for a question (its language) or, with no question, for the page language. */
export function askCopyFor(question: string, pageLang: string | undefined): AskCopy {
  const q = question.trim()
  if (q) return ASK_COPY[/[\p{Script=Han}]/u.test(q) ? 'zh' : 'en']
  return ASK_COPY[/^zh/i.test(pageLang || '') ? 'zh' : 'en']
}
