/**
 * Slash-command catalogue and the small pure helpers behind the editor's
 * menus (unit-tested): filtering, YouTube id extraction, link validation and
 * the raw-MDX snippets each command inserts.
 */
import { rankItems } from '../../Article/fuzzyMatch'
import { safeHref } from '../../../lib/cvFormat'

export type SlashItemId =
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'quote'
  | 'code'
  | 'divider'
  | 'image'
  | 'youtube'
  | 'link'

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
  { id: 'code', label: 'Code block', hint: 'With a language', keywords: 'pre fence snippet', step: 'code' },
  { id: 'divider', label: 'Divider', hint: 'Horizontal rule', keywords: 'hr rule separator line' },
  { id: 'image', label: 'Image', hint: 'Upload a picture', keywords: 'picture photo upload img' },
  { id: 'youtube', label: 'YouTube video', hint: 'Embed a video', keywords: 'video embed youtube', step: 'youtube' },
  { id: 'link', label: 'Link to post / case study…', hint: 'Search your writing', keywords: 'internal link blog work', step: 'link' },
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

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/

/**
 * The 11-character video id of a YouTube URL (watch?v=, youtu.be/, /embed/,
 * /shorts/, /live/, youtube-nocookie) or of a bare id; null otherwise.
 */
export function youtubeId(input: string): string | null {
  const raw = input.trim()
  if (YT_ID_RE.test(raw)) return raw
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '')
  let id: string | null = null
  if (host === 'youtu.be') id = u.pathname.split('/')[1] || null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v')
    else {
      const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname)
      id = m ? m[1] : null
    }
  }
  return id && YT_ID_RE.test(id) ? id : null
}

/** Escape a JSX attribute value written inside double quotes. */
function jsxAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/[{}<>]/g, (c) => `&#${c.charCodeAt(0)};`)
}

/** The MDX tag the raw editor inserts for a video. */
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

/** Raw-MDX text a block command inserts at the caret (`|` marks where the caret goes). */
export function rawSnippet(id: Exclude<SlashItemId, 'image' | 'youtube' | 'link' | 'code'>): string {
  switch (id) {
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
