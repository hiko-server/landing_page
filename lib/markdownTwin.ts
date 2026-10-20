import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import { embedSrc, literalAttributes, YOUTUBE_ID_RE } from './rehype/stripMdxExpressions'
import { safeHref } from './url'
import { isoDate } from './postDate'
import { outcomeText, type WorkLink, type WorkOutcome } from './caseStudy'
import { languageAutonym, translationLang, type TranslationLink } from './translations'
import { markdownTwinPath } from './markdownTwinPaths'

/**
 * Markdown for language models and agents (G9): the Markdown twin of every
 * published post and case study (/blog/<slug>.md, /work/<slug>.md — the
 * llmstxt.org convention), /llms.txt (the index) and /llms-full.txt (every
 * twin in one file). Pure: the loaders in lib/llms.ts feed it public data
 * only — published items (drafts never), the fields their pages show.
 *
 * The body is the owner's MDX source turned into plain CommonMark + GFM
 * without evaluating anything, the same allow-list as the page renderer
 * (lib/rehype/stripMdxExpressions):
 *
 *   - `{expressions}`, MDX comments (the case-study template's notes) and
 *     import / export lines are dropped;
 *   - <Figure> becomes an image with its caption, <YouTube> and allowed
 *     player iframes a link to the video, <kbd> inline code, <summary> a
 *     bold line, <br> a line break; any other element is replaced by what
 *     it contains;
 *   - links and images become absolute URLs on the canonical origin
 *     (in-page #fragments point at the page); script-capable URLs are
 *     dropped (a link keeps its text); the `#wide` / `#full` figure-width
 *     hints are removed;
 *   - code, tables, footnotes, task lists and `> [!NOTE]` callouts are kept.
 */

type MdNode = {
  type: string
  children?: MdNode[]
  value?: string
  url?: string
  alt?: string | null
  title?: string | null
  name?: string | null
  attributes?: Array<{ type: string; name?: string; value?: unknown }>
}

const EXPRESSIONS = new Set(['mdxjsEsm', 'mdxFlowExpression', 'mdxTextExpression'])
const JSX = new Set(['mdxJsxFlowElement', 'mdxJsxTextElement'])

const text = (value: string): MdNode => ({ type: 'text', value })
const paragraph = (children: MdNode[]): MdNode => ({ type: 'paragraph', children })

/** Plain text of a node (its text, inline code and image alts). */
function textOf(node: MdNode): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value || ''
  if (node.type === 'image') return node.alt || ''
  return (node.children || []).map(textOf).join('')
}

type Ctx = { siteUrl: string; pageUrl: string }

/** An absolute, safe URL for a link or image target; '' when it may not be linked. */
export function absoluteMarkdownUrl(raw: unknown, ctx: Ctx): string {
  const url = typeof raw === 'string' ? raw.trim() : ''
  if (!url) return ''
  if (url.startsWith('#')) return /^#[^\s#]*$/.test(url) ? `${ctx.pageUrl}${url}` : ''
  const safe = safeHref(url)
  if (!safe) return ''
  return safe.startsWith('/') ? `${ctx.siteUrl}${safe}` : safe
}

/** An image URL without the article's figure-width hint (`#wide`, `#full`). */
function imageUrl(raw: unknown, ctx: Ctx): string {
  const url = typeof raw === 'string' ? raw.trim().replace(/#(wide|full)$/i, '') : ''
  return absoluteMarkdownUrl(url, ctx)
}

/** The public watch page of an allowed player URL (embedSrc output). */
export function videoWatchUrl(player: string): string {
  const yt = /^https:\/\/www\.(?:youtube-nocookie\.com|youtube\.com)\/embed\/([A-Za-z0-9_-]{11})(?:\?(.*))?$/.exec(player)
  if (yt) {
    const start = new URLSearchParams(yt[2] || '').get('start')
    return `https://www.youtube.com/watch?v=${yt[1]}${start && /^\d+$/.test(start) ? `&t=${start}s` : ''}`
  }
  const vimeo = /^https:\/\/player\.vimeo\.com\/video\/(\d+)/.exec(player)
  return vimeo ? `https://vimeo.com/${vimeo[1]}` : player
}

function convertJsx(node: MdNode, ctx: Ctx): MdNode[] {
  const flow = node.type === 'mdxJsxFlowElement'
  const wrap = (phrasing: MdNode[]) => (flow ? [paragraph(phrasing)] : phrasing)
  const attrs = literalAttributes(node)
  const attr = (k: string) => (typeof attrs[k] === 'string' ? (attrs[k] as string).trim() : '')
  switch (node.name) {
    case 'Figure': {
      const url = imageUrl(attr('src'), ctx)
      const alt = attr('alt')
      const caption = attr('caption')
      // Like the page: a figure without a usable image shows nothing.
      if (!url) return []
      const img: MdNode = { type: 'image', url, alt, title: null }
      if (!flow) return [{ ...img, title: caption || null }]
      return caption ? [paragraph([img]), paragraph([{ type: 'emphasis', children: [text(caption)] }])] : [paragraph([img])]
    }
    case 'YouTube': {
      const id = attr('id')
      if (!YOUTUBE_ID_RE.test(id)) return []
      return wrap([{ type: 'link', url: `https://www.youtube.com/watch?v=${id}`, title: null, children: [text(attr('title') || 'YouTube video')] }])
    }
    case 'iframe': {
      const src = embedSrc(attr('src'))
      if (!src) return []
      return wrap([{ type: 'link', url: videoWatchUrl(src), title: null, children: [text(attr('title') || 'Embedded video')] }])
    }
    case 'br':
      return [{ type: 'break' }]
    case 'kbd':
      return [{ type: 'inlineCode', value: textOf(node) }]
    case 'summary': {
      const label = textOf(node).replace(/\s+/g, ' ').trim()
      if (!label) return []
      return wrap([{ type: 'strong', children: [text(label)] }])
    }
    default:
      // details, sub, sup, mark, small, abbr and anything not allowed: what it contains.
      return convertChildren(node, ctx)
  }
}

function convertChildren(parent: MdNode, ctx: Ctx): MdNode[] {
  const out: MdNode[] = []
  for (const child of parent.children || []) {
    if (EXPRESSIONS.has(child.type)) continue
    if (JSX.has(child.type)) {
      out.push(...convertJsx(child, ctx))
      continue
    }
    if (child.type === 'link') {
      const url = absoluteMarkdownUrl(child.url, ctx)
      const kids = convertChildren(child, ctx)
      if (url) out.push({ ...child, url, children: kids })
      else out.push(...kids)
      continue
    }
    if (child.type === 'image') {
      const url = imageUrl(child.url, ctx)
      if (url) out.push({ ...child, url })
      else if (child.alt) out.push(text(child.alt))
      continue
    }
    if (child.type === 'definition') {
      const url = absoluteMarkdownUrl(child.url, ctx)
      if (url) out.push({ ...child, url })
      continue
    }
    if (child.type === 'html') continue
    out.push(child.children ? { ...child, children: convertChildren(child, ctx) } : child)
  }
  return out
}

/** Paragraphs left empty by the conversion (a line that held only a comment) are removed. */
function prune(node: MdNode): void {
  if (!node.children) return
  node.children = node.children.filter((c) => !(c.type === 'paragraph' && (c.children || []).every((k) => k.type === 'text' && !(k.value || '').trim())))
  node.children.forEach(prune)
}

const processor = unified()
  .use(remarkParse)
  .use(remarkMdx)
  .use(remarkGfm)
  .use(remarkStringify, {
    bullet: '-',
    emphasis: '_',
    strong: '*',
    fence: '`',
    fences: true,
    rule: '-',
    listItemIndent: 'one',
    incrementListMarker: true,
  })

/** `> \[!NOTE]` → `> [!NOTE]`: the serializer escapes the bracket of a GFM alert marker. */
function unescapeAlerts(md: string): string {
  return md.replace(/^((?:> ?)+)\\\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gim, '$1[!$2]')
}

/**
 * The owner's MDX body as plain Markdown (see the header). Throws on a body
 * that does not parse — the public page would not render either.
 */
export function mdxToMarkdown(body: string, ctx: Ctx): string {
  const tree = processor.parse(String(body ?? '')) as unknown as MdNode
  tree.children = convertChildren(tree, ctx)
  prune(tree)
  const md = processor.stringify(tree as never)
  return unescapeAlerts(String(md)).trim()
}

// ── Article twins ─────────────────────────────────────────────────────────

export type TwinArticle = {
  kind: 'blog' | 'work'
  title: string
  description?: string
  /** BCP-47 language of the piece. */
  lang: string
  /** Same-site path of the HTML page (the canonical one). */
  permalink: string
  readingMinutes: number
  author: string
  /** Posts. */
  date?: string
  updated?: string
  tags?: readonly string[]
  /** A post's case study. */
  project?: { title: string; permalink: string } | null
  /** Case studies. */
  summary?: string
  role?: string
  team?: string
  period?: string
  published?: string
  tech?: readonly string[]
  link?: string
  repo?: string
  outcomes?: readonly WorkOutcome[]
  links?: readonly WorkLink[]
  /** The piece in other languages (lib/translations). */
  translations?: readonly TranslationLink[]
  /** The MDX source of the body. */
  body: string
}

/** One line of the metadata list; nothing for an empty value. */
const line = (label: string, value: string | undefined | null) => (value && value.trim() ? `- ${label}: ${value.trim()}` : null)
const mdLink = (label: string, url: string) => `[${label.replace(/([[\]\\])/g, '\\$1')}](<${url}>)`

/** Language name for the metadata list: "English (en)", "简体中文 (zh-Hans)". */
function languageLine(lang: string): string {
  const key = translationLang(lang)
  return `${languageAutonym(lang)} (${key})`
}

/**
 * The Markdown twin of a post or case study: the title, the description as
 * a quote, a metadata list (author, dates, language, translations, the
 * canonical page and — for case studies — the "At a glance" outcome and
 * metrics with their sources, role, team, stack and links), then the body.
 */
export function articleMarkdown(a: TwinArticle, siteUrl: string): string {
  const pageUrl = `${siteUrl}${a.permalink}`
  const ctx: Ctx = { siteUrl, pageUrl }
  const out: string[] = [`# ${a.title.replace(/\s+/g, ' ').trim()}`, '']
  if (a.description) out.push(`> ${a.description.replace(/\s+/g, ' ').trim()}`, '')

  const meta: Array<string | null> = [
    line('Author', a.author),
    line('Type', a.kind === 'blog' ? 'Post' : 'Case study'),
    line('Published', isoDate(a.kind === 'blog' ? a.date : a.published) || undefined),
    line('Updated', a.kind === 'blog' && a.updated && isoDate(a.updated) !== isoDate(a.date) ? isoDate(a.updated) : undefined),
    line('Language', languageLine(a.lang)),
  ]
  if (a.translations && a.translations.length) {
    meta.push(
      line(
        'Also in',
        a.translations.map((t) => `${mdLink(languageAutonym(t.lang), `${siteUrl}${markdownTwinPath(t.permalink)}`)} (${translationLang(t.lang)})`).join(', '),
      ),
    )
  }
  meta.push(line('Reading time', `${a.readingMinutes} min`))
  if (a.kind === 'blog') {
    meta.push(line('Tags', (a.tags || []).join(', ')))
    if (a.project) meta.push(line('Case study', mdLink(a.project.title, `${siteUrl}${a.project.permalink}`)))
  } else {
    meta.push(line('Role', a.role), line('Team', a.team), line('Timeline', a.period), line('Stack', (a.tech || []).join(', ')))
    const live = absoluteMarkdownUrl(a.link, ctx)
    const repo = absoluteMarkdownUrl(a.repo, ctx)
    if (live) meta.push(line('Live site', `<${live}>`))
    if (repo) meta.push(line('Source code', `<${repo}>`))
    for (const l of a.links || []) {
      const url = absoluteMarkdownUrl(l.url, ctx)
      if (url) meta.push(line(l.label, `<${url}>`))
    }
  }
  meta.push(line('Canonical', `<${pageUrl}>`))
  out.push(...meta.filter((m): m is string => !!m), '')

  if (a.kind === 'work' && (a.summary || (a.outcomes && a.outcomes.length))) {
    out.push('## At a glance', '')
    if (a.summary) out.push(a.summary.trim(), '')
    for (const o of a.outcomes || []) {
      const source = o.source || o.sourceUrl ? ` (source: ${[o.source, absoluteMarkdownUrl(o.sourceUrl, ctx)].filter(Boolean).join(', ')})` : ''
      out.push(`- ${outcomeText(o)} — ${o.label}${source}`)
    }
    if (a.outcomes && a.outcomes.length) out.push('')
  }

  out.push('---', '')
  const body = mdxToMarkdown(a.body, ctx)
  if (body) out.push(body, '')
  return `${out.join('\n').trimEnd()}\n`
}

// ── llms.txt ──────────────────────────────────────────────────────────────

export type LlmsEntry = {
  title: string
  permalink: string
  lang: string
  description?: string
  /** YYYY-MM-DD (posts). */
  date?: string
}

export type LlmsInput = {
  siteUrl: string
  name: string
  /** One-paragraph summary (the home page's description). */
  summary: string
  work: readonly LlmsEntry[]
  posts: readonly LlmsEntry[]
  /** Whether /publications exists (it has public papers). */
  publications: boolean
  /** The CV languages with public content (/cv, /cv/zh and their files exist only then). */
  cv: { en: boolean; zh: boolean }
  /** The owner's descriptions of /now and /uses, when written. */
  nowDescription?: string
  usesDescription?: string
}

function entryLine(e: LlmsEntry, siteUrl: string): string {
  const notes: string[] = []
  if (translationLang(e.lang) !== 'en') notes.push(languageAutonym(e.lang))
  if (e.date) notes.push(e.date)
  const head = `- ${mdLink(e.title, `${siteUrl}${markdownTwinPath(e.permalink)}`)}${notes.length ? ` (${notes.join(', ')})` : ''}`
  const desc = (e.description || '').replace(/\s+/g, ' ').trim()
  return desc ? `${head}: ${desc}` : head
}

/**
 * /llms.txt (llmstxt.org): the name, a summary, what the file is, then
 * sections of links — the profile and the CV in each language that has
 * public content, every published case study and post (each to its
 * Markdown twin, language and date noted) and, under "Optional", the
 * secondary pages and feeds. No contact details: the contact page is
 * linked instead.
 */
export function buildLlmsTxt(input: LlmsInput): string {
  const u = (p: string) => `${input.siteUrl}${p}`
  const out: string[] = [`# ${input.name}`, '', `> ${input.summary.replace(/\s+/g, ' ').trim()}`, '']
  out.push(
    `This is the personal site of ${input.name}. Every case study and post below links to the Markdown version of its page; ` +
      `the same address without ".md" is the canonical HTML page. Only published pieces are listed. ` +
      `${mdLink('llms-full.txt', u('/llms-full.txt'))} holds all of them in one file.`,
    '',
  )

  out.push(input.cv.en || input.cv.zh ? '## Profile and CV' : '## Profile', '')
  out.push(`- ${mdLink('About', u('/about'))}: profile and background`)
  if (input.cv.en) {
    out.push(
      `- ${mdLink('CV (English)', u('/cv'))}: also as ${mdLink('plain text', u('/cv.txt'))}, ${mdLink('JSON Resume', u('/cv.json'))} and ${mdLink('PDF', u('/cv.pdf'))}`,
    )
  }
  if (input.cv.zh) {
    out.push(
      `- ${mdLink('CV (简体中文)', u('/cv/zh'))}: also as ${mdLink('plain text', u('/cv/zh.txt'))}, ${mdLink('JSON Resume', u('/cv/zh.json'))} and ${mdLink('PDF', u('/cv/zh.pdf'))}`,
    )
  }
  if (input.publications) out.push(`- ${mdLink('Publications', u('/publications'))}: papers with citations`)
  out.push(`- ${mdLink('Contact', u('/contact'))}: how to get in touch, and availability`)
  out.push('')

  if (input.work.length) {
    out.push('## Case studies', '', ...input.work.map((e) => entryLine(e, input.siteUrl)), '')
  }
  if (input.posts.length) {
    out.push('## Writing', '', ...input.posts.map((e) => entryLine(e, input.siteUrl)), '')
  }

  out.push('## Optional', '')
  out.push(`- ${mdLink('Now', u('/now'))}${input.nowDescription ? `: ${input.nowDescription.trim()}` : ''}`)
  out.push(`- ${mdLink('Uses', u('/uses'))}${input.usesDescription ? `: ${input.usesDescription.trim()}` : ''}`)
  out.push(`- ${mdLink('Colophon', u('/colophon'))}: how this site is built, and its privacy notes`)
  out.push(`- ${mdLink('RSS feed of the writing', u('/feed.xml'))}, ${mdLink('JSON Feed', u('/feed.json'))}, ${mdLink('case studies (RSS)', u('/work/feed.xml'))}`)
  out.push(`- ${mdLink('Sitemap', u('/sitemap.xml'))}`)
  return `${out.join('\n').trimEnd()}\n`
}

/** /llms-full.txt: the llms.txt heading and summary, then every case study and post twin in full. */
export function buildLlmsFullTxt(input: Pick<LlmsInput, 'siteUrl' | 'name' | 'summary'>, articles: readonly string[]): string {
  const head = [
    `# ${input.name}`,
    '',
    `> ${input.summary.replace(/\s+/g, ' ').trim()}`,
    '',
    `Every published case study and post of ${input.siteUrl.replace(/^https?:\/\//, '')} in full, as Markdown. ` +
      `The index is ${mdLink('llms.txt', `${input.siteUrl}/llms.txt`)}.`,
  ].join('\n')
  return `${[head, ...articles.map((a) => a.trim())].join('\n\n---\n\n')}\n`
}
