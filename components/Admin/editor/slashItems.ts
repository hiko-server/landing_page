/**
 * Slash-command catalogue and the small pure helpers behind the editor's
 * menus (unit-tested): filtering, video links, link validation and the
 * raw-MDX snippets each command inserts.
 */
import { rankItems } from '../../Article/fuzzyMatch'
import { safeHref } from '../../../lib/cvFormat'
import { parseVideoUrl, videoWatchUrl, youtubeId } from '../../../lib/videoUrl'
import { caseStudyTemplate } from './caseStudyTemplate'

export { youtubeId }

export type SlashItemId =
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'quote'
  | 'code'
  | 'divider'
  | 'image'
  | 'library'
  | 'youtube'
  | 'link'
  | 'note'
  | 'tip'
  | 'warning'
  | 'outline'

export type SlashItem = {
  id: SlashItemId
  label: string
  hint: string
  keywords: string
  /** Needs a second step in the menu (an input) before it inserts anything. */
  step?: 'code' | 'youtube' | 'link'
}

export const SLASH_ITEMS: SlashItem[] = [
  { id: 'h2', label: 'Heading 2', hint: 'Section title', keywords: 'h2 title section' },
  { id: 'h3', label: 'Heading 3', hint: 'Sub-section title', keywords: 'h3 subtitle' },
  { id: 'bullet', label: 'Bullet list', hint: 'Unordered list', keywords: 'ul unordered list dash' },
  { id: 'ordered', label: 'Numbered list', hint: 'Ordered list', keywords: 'ol ordered list number' },
  { id: 'quote', label: 'Quote', hint: 'Block quote', keywords: 'blockquote citation' },
  { id: 'note', label: 'Note', hint: 'Callout', keywords: 'callout alert info aside admonition' },
  { id: 'tip', label: 'Tip', hint: 'Callout', keywords: 'callout alert hint advice admonition' },
  { id: 'warning', label: 'Warning', hint: 'Callout', keywords: 'callout alert caution danger admonition' },
  { id: 'code', label: 'Code block', hint: 'With a language', keywords: 'pre fence snippet', step: 'code' },
  { id: 'divider', label: 'Divider', hint: 'Horizontal rule', keywords: 'hr rule separator line' },
  { id: 'image', label: 'Image', hint: 'Upload a picture', keywords: 'picture photo upload img' },
  { id: 'library', label: 'Image from library', hint: 'An uploaded picture', keywords: 'media library picture photo existing uploads gallery img' },
  { id: 'youtube', label: 'Video', hint: 'YouTube or Vimeo', keywords: 'video embed youtube vimeo movie player', step: 'youtube' },
  { id: 'link', label: 'Link to post / case study…', hint: 'Search your writing', keywords: 'internal link blog work', step: 'link' },
  { id: 'outline', label: 'Case-study outline', hint: 'Problem → lessons', keywords: 'template scaffold sections case study skeleton' },
]

/** Commands matching the text typed after "/" (all of them for an empty query). */
export function filterSlashItems(query: string, items: readonly SlashItem[] = SLASH_ITEMS): SlashItem[] {
  const q = query.trim()
  if (!q) return [...items]
  return rankItems(
    items.map((it) => ({ ...it, label: it.label, keywords: `${it.keywords} ${it.hint}` })),
    q,
  ).map((r) => items.find((it) => it.id === r.item.id) as SlashItem)
}

/**
 * The watch-page URL of a YouTube or Vimeo link (or a bare YouTube id); null
 * when it is neither. Inserted alone in its paragraph, it compiles to the
 * click-to-load player (lib/rehype/autoEmbed.ts).
 */
export function videoLinkUrl(input: string): string | null {
  const raw = input.trim()
  const ref = parseVideoUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  if (ref) return videoWatchUrl(ref)
  const id = youtubeId(raw)
  return id ? videoWatchUrl({ provider: 'youtube', id }) : null
}

/**
 * The raw-MDX paragraph for a video: `[title](url)`, or the bare URL without
 * a title (a GFM autolink; MDX has no `<url>` autolinks).
 */
export function videoLine(url: string, title: string): string {
  const t = title.trim()
  return t ? markdownLink(t, url) : url
}

/** Escape a JSX attribute value written inside double quotes. */
function jsxAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/[{}<>]/g, (c) => `&#${c.charCodeAt(0)};`)
}

/** A `<YouTube>` tag for a video (the editor now inserts plain links, which compile to the same player). */
export function youtubeTag(id: string, title: string): string {
  const t = title.trim() || 'YouTube video'
  return `<YouTube id="${id}" title="${jsxAttr(t)}" />`
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}

/** Escape link text for Markdown. */
export function escapeLinkText(text: string): string {
  return text.replace(/[\\[\]]/g, (c) => `\\${c}`)
}

export function markdownLink(text: string, href: string): string {
  return `[${escapeLinkText(text)}](${href.replace(/[()\s]/g, (c) => encodeURIComponent(c))})`
}

/**
 * Normalise a link typed into the link bubble: http(s), mailto:, tel:,
 * site-relative paths and #fragments are allowed; a bare domain becomes
 * https://…; anything else (javascript:, data:, //host) is refused (null).
 */
export function normalizeLinkHref(input: string): string | null {
  const v = input.trim()
  if (!v) return null
  if (/^#[^\s]*$/.test(v)) return v
  const safe = safeHref(v)
  return safe || null
}

/** GitHub alert marker of a callout command. */
export const CALLOUT_MARKERS = { note: '[!NOTE]', tip: '[!TIP]', warning: '[!WARNING]' } as const

/** Raw-MDX text a block command inserts at the caret (`|` marks where the caret goes). */
export function rawSnippet(id: Exclude<SlashItemId, 'image' | 'library' | 'youtube' | 'link' | 'code'>): string {
  switch (id) {
    case 'note':
    case 'tip':
    case 'warning':
      return `> ${CALLOUT_MARKERS[id]}\n> |`
    case 'outline': {
      // The caret lands at the end of the first guidance note's line.
      const t = caseStudyTemplate()
      const firstNoteEnd = t.indexOf('*/}') + 3
      return `${t.slice(0, firstNoteEnd)}\n\n|${t.slice(firstNoteEnd).replace(/^\n+/, '')}`
    }
    case 'h2':
      return '## |'
    case 'h3':
      return '### |'
    case 'bullet':
      return '- |'
    case 'ordered':
      return '1. |'
    case 'quote':
      return '> |'
    case 'divider':
      return '---\n\n|'
  }
}

/** Code fence with an info string; the caret lands on the empty line inside. */
export function rawCodeFence(language: string): string {
  const lang = language.trim().replace(/[^\w+#.-]/g, '')
  return `\`\`\`${lang}\n|\n\`\`\``
}

/** Language names offered while typing (any word is accepted). */
export const CODE_LANGUAGES = ['ts', 'tsx', 'js', 'jsx', 'json', 'bash', 'python', 'go', 'rust', 'sql', 'yaml', 'css', 'html', 'diff', 'md']
