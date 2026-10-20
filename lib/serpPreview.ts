/**
 * Search and share previews for the admin SEO panel (H1) — pure, client-safe
 * and unit-tested. The page itself builds its <title> and meta description
 * with lib/schema composeTitle / clampDescription; the previews use the same
 * functions, so what the panel shows is what the page will send.
 *
 *   - Google cuts a desktop result title at about 600 CSS px of 20 px Arial
 *     (not at a character count), and the snippet at two lines; the panel
 *     measures the title with canvas measureText (injected here so the
 *     logic stays testable).
 *   - The description the page sends is the owner's description, or — when
 *     that is shorter than 70 characters — the first paragraph, clamped to
 *     155 characters at a sentence or word boundary.
 */

import { clampDescription, composeTitle, SITE_HOST } from './schema'
import { readableText } from './toc'

/** Width Google gives a desktop result title before it cuts it with "…". */
export const SERP_TITLE_PX = 600
/** Font of a desktop result title. */
export const SERP_TITLE_FONT = '20px Arial, Helvetica, sans-serif'
/** Recommended length of a custom search title (the site adds " · Li Yanpei"). */
export const SEO_TITLE_MAX = 60
/** Below this the page replaces the description with the first paragraph (lib/schema DESCRIPTION_MIN). */
export const DESCRIPTION_FALLBACK_BELOW = 70
export const DESCRIPTION_IDEAL_MIN = 50
export const DESCRIPTION_IDEAL_MAX = 160

export type Measure = (text: string) => number

/**
 * `text` cut to fit `maxPx` (with "…" when cut), by code point, using the
 * given width function. Returns the shown text, whether it was cut and the
 * full text's width.
 */
export function fitToWidth(text: string, maxPx: number, measure: Measure): { text: string; truncated: boolean; width: number } {
  const width = measure(text)
  if (width <= maxPx) return { text, truncated: false, width }
  const chars = Array.from(text)
  let lo = 0
  let hi = chars.length
  // Longest prefix p with measure(p + '…') <= maxPx (binary search).
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measure(`${chars.slice(0, mid).join('').trimEnd()} …`) <= maxPx) lo = mid
    else hi = mid - 1
  }
  return { text: `${chars.slice(0, lo).join('').trimEnd()} …`, truncated: true, width }
}

/**
 * First real paragraph of a Markdown body as plain text — the approximation
 * of lib/mdx excerptOf that the browser can compute without compiling:
 * skips headings, images, lists, quotes, tables, code, JSX and paragraphs
 * under 20 characters.
 */
export function firstParagraph(markdown: string): string {
  const blocks = String(markdown || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^(```|~~~)[\s\S]*?^\1\s*$/gm, '\n')
    .split(/\n\s*\n/)
  for (const block of blocks) {
    const b = block.trim()
    if (!b) continue
    if (/^(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|\||<|!\[|import\s|export\s|\[\^)/.test(b)) continue
    const text = readableText(b).replace(/\s+/g, ' ').trim()
    if (Array.from(text).length >= 20) return text
  }
  return ''
}

/** The meta description the page will send (lib/schema clampDescription with the first paragraph as fallback). */
export function effectiveDescription(description: string, body: string, fallback?: string): string {
  return clampDescription(description || fallback || '', firstParagraph(body))
}

export type DescriptionAdvice = { level: 'ok' | 'warning'; text: string }

/** Length guidance for the owner's description. */
export function descriptionAdvice(description: string): DescriptionAdvice {
  const n = Array.from((description || '').replace(/\s+/g, ' ').trim()).length
  if (n === 0) return { level: 'warning', text: 'No description — search engines and link previews use the first paragraph.' }
  if (n < DESCRIPTION_FALLBACK_BELOW) {
    return { level: 'warning', text: `${n} characters — under ${DESCRIPTION_FALLBACK_BELOW}, so the page sends the first paragraph instead. Aim for ${DESCRIPTION_IDEAL_MIN}–${DESCRIPTION_IDEAL_MAX}.` }
  }
  if (n > DESCRIPTION_IDEAL_MAX) return { level: 'warning', text: `${n} characters — results and previews cut it near 155. Aim for ${DESCRIPTION_IDEAL_MIN}–${DESCRIPTION_IDEAL_MAX}.` }
  return { level: 'ok', text: `${n} characters — a good length for results and previews.` }
}

/** The <title> / og:title the page will send for this item. */
export function pageTitleFor(input: { title: string; seoTitle?: string; lang?: string }): string {
  const seo = (input.seoTitle || '').replace(/\s+/g, ' ').trim().slice(0, SEO_TITLE_MAX)
  return composeTitle({ title: seo || input.title, lang: input.lang })
}

/** Google's breadcrumb line for a path: "lucian-dev.com › blog › my-post". */
export function serpBreadcrumb(path: string, host: string = SITE_HOST): string {
  const parts = path.split('/').filter(Boolean)
  return [host, ...parts].join(' › ')
}

/** Google's date prefix for an article snippet ("May 1, 2024"), or '' without a valid date. */
export function serpDate(iso: string | undefined, locale = 'en-US'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim())
  if (!m) return ''
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Languages the panel offers ('' = detect from the text). */
export const LANGUAGE_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'zh-Hans', label: '简体中文 (Simplified Chinese)' },
  { value: 'zh-Hant', label: '繁體中文 (Traditional Chinese)' },
  { value: 'ja', label: '日本語 (Japanese)' },
  { value: 'ko', label: '한국어 (Korean)' },
]

/** Human label of a language tag ("zh-Hans" → "简体中文 (Simplified Chinese)"). */
export function languageLabel(tag: string): string {
  return LANGUAGE_CHOICES.find((c) => c.value === tag)?.label || tag
}
