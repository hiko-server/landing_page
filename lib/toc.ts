/**
 * Build-time article analysis shared by the MDX pipeline (lib/mdx.ts), the
 * heading plugin (lib/rehype/headings.ts) and the article pages:
 *
 *   - heading ids (GitHub-style slugs, Unicode-aware so CJK headings keep
 *     readable ids, de-duplicated per document),
 *   - the table-of-contents entry type,
 *   - reading time that ignores markup / URLs and reads CJK by character,
 *   - the document language for <html lang> (contract E).
 *
 * Pure and dependency-free: runs in getStaticProps, API routes and tests.
 */

export type TocEntry = {
  /** Heading element id (also the URL fragment). */
  id: string
  /** Plain heading text. */
  text: string
  /** Outline level: 2 for h2, 3 for h3. */
  depth: 2 | 3
}

/**
 * Ids already used by the page chrome. A heading called "Main" must not
 * produce a second `id="main"` (the skip-link target).
 */
export const RESERVED_IDS: readonly string[] = ['main', '__next', 'article-body', 'article-end', 'related-heading']

/** Slug for a heading: lower-case, punctuation/emoji dropped, whitespace → '-'. */
export function slugify(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Returns a function that hands out unique slugs for one document. */
export function createSlugger(reserved: readonly string[] = RESERVED_IDS): (text: string) => string {
  const taken = new Set(reserved)
  return (text: string) => {
    const base = slugify(text) || 'section'
    let id = base
    for (let n = 1; taken.has(id); n++) id = `${base}-${n}`
    taken.add(id)
    return id
  }
}

// ── Script detection ──────────────────────────────────────────────────────
const HAN_RE = /\p{Script=Han}/gu
const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/gu
const HANGUL_RE = /\p{Script=Hangul}/gu
const LATIN_WORD_RE = /[\p{Script=Latin}\p{N}][\p{Script=Latin}\p{N}'’-]*/gu

function count(re: RegExp, text: string): number {
  return text.match(re)?.length ?? 0
}

/** Average adult silent-reading speeds (Brysbaert 2019; Trauzettel-Klosinski 2012). */
export const WORDS_PER_MINUTE = 230
export const CJK_CHARS_PER_MINUTE = 260

/**
 * Markdown/MDX source → the prose a reader actually reads: drops fenced-code
 * fences (keeps the code), image syntax, link targets, bare URLs, JSX/HTML
 * tags, import/export lines and emphasis markers.
 */
export function readableText(markdown: string): string {
  return markdown
    .replace(/^(import|export)\s.*$/gm, ' ')
    .replace(/^(```|~~~).*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\((?:<[^>]*>|[^)]*)\)/g, '$1')
    .replace(/<https?:\/\/[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/[*_~`#>|\\]/g, ' ')
}

/** Number of images in the source (markdown and JSX/HTML <img>). */
function countImages(markdown: string): number {
  return count(/!\[[^\]]*\]\([^)]*\)/g, markdown) + count(/<img\b/gi, markdown)
}

/**
 * Reading time in whole minutes (≥ 1). Latin words at 230 wpm, CJK
 * characters at 260 per minute, plus image dwell time (12 s for the first
 * image, one second less for each following one, never below 3 s).
 */
export function readingMinutes(markdown: string): number {
  const text = readableText(markdown || '')
  const cjk = count(HAN_RE, text) + count(KANA_RE, text) + count(HANGUL_RE, text)
  const words = count(LATIN_WORD_RE, text)
  let seconds = (words / WORDS_PER_MINUTE) * 60 + (cjk / CJK_CHARS_PER_MINUTE) * 60
  const images = countImages(markdown || '')
  for (let i = 0; i < images; i++) seconds += Math.max(3, 12 - i)
  return Math.max(1, Math.round(seconds / 60))
}

/** BCP-47-ish tag check (e.g. "en", "zh-Hans", "zh-Hant-HK"). */
const LANG_TAG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/

/** Normalise an author-supplied language tag; '' when unusable. */
export function normalizeLang(value: unknown): string {
  if (typeof value !== 'string') return ''
  const raw = value.trim().replace(/_/g, '-')
  if (!raw) return ''
  const [primary, ...rest] = raw.split('-')
  const subtags = rest.map((s) =>
    s.length === 4 ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s.length === 2 ? s.toUpperCase() : s.toLowerCase(),
  )
  const tag = [primary.toLowerCase(), ...subtags].join('-')
  if (!LANG_TAG_RE.test(tag)) return ''
  const lower = tag.toLowerCase()
  if (lower === 'zh' || lower === 'zh-cn' || lower === 'zh-sg') return 'zh-Hans'
  if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo') return 'zh-Hant'
  return tag
}

/** Share of reading effort that is CJK (0–1); 0 for empty text. */
export function cjkShare(text: string): number {
  const readable = readableText(text || '')
  const cjk = count(HAN_RE, readable) + count(KANA_RE, readable) + count(HANGUL_RE, readable)
  const words = count(LATIN_WORD_RE, readable)
  const cjkTime = cjk / CJK_CHARS_PER_MINUTE
  const latinTime = words / WORDS_PER_MINUTE
  const total = cjkTime + latinTime
  return total === 0 ? 0 : cjkTime / total
}

/** Text counts as "predominantly CJK" when CJK carries ≥ 60 % of the reading effort. */
export const CJK_THRESHOLD = 0.6

function cjkTag(text: string): string {
  const kana = count(KANA_RE, text)
  const hangul = count(HANGUL_RE, text)
  const han = count(HAN_RE, text)
  if (hangul > han + kana) return 'ko'
  if (kana > 0 && kana * 10 >= han) return 'ja'
  return 'zh-Hans'
}

/** Titles shorter than this say too little about the language of the piece. */
export const SHORT_TITLE_CHARS = 12

/**
 * Language of an article.
 *
 *   1. An explicit frontmatter `lang` wins.
 *   2. A title of 12+ characters that is predominantly CJK decides
 *      ('zh-Hans', or 'ja' / 'ko' when kana / Hangul dominate).
 *   3. Otherwise (short or mostly Latin title) the body decides by its CJK
 *      share of reading effort: ≥ 0.6 is a CJK piece; 0.25–0.6 is a
 *      bilingual piece whose page language is the majority script (CJK only
 *      above half — lib/rehype/langSpans marks the other script's runs);
 *      below 0.25 is English with the odd CJK word.
 *   4. With no body text, a short title still decides on its own (list
 *      labels such as "爱车人社区").
 */
export function detectContentLang({
  lang,
  title,
  body,
}: {
  lang?: unknown
  title?: unknown
  body?: unknown
}): string {
  const explicit = normalizeLang(lang)
  if (explicit) return explicit
  const t = typeof title === 'string' ? title.trim() : ''
  const b = typeof body === 'string' ? body : ''
  const titleShare = t ? cjkShare(t) : 0
  if (Array.from(t).length >= SHORT_TITLE_CHARS && titleShare >= CJK_THRESHOLD) return cjkTag(t)
  const readable = readableText(b)
  const hasBody = count(LATIN_WORD_RE, readable) + count(HAN_RE, readable) + count(KANA_RE, readable) + count(HANGUL_RE, readable) > 0
  if (!hasBody) return t && titleShare >= CJK_THRESHOLD ? cjkTag(t) : 'en'
  const share = cjkShare(b)
  return share > 0.5 ? cjkTag(b) : 'en'
}

/** `lang` attribute for a short label (title in a list): only set when it differs from English. */
export function labelLang(text: unknown): string | undefined {
  const tag = detectContentLang({ title: text })
  return tag === 'en' ? undefined : tag
}

/**
 * `lang` attribute for a short text (a name, a role, a tag) inside a page in
 * `pageLang`: the text's own language when it differs from the page's
 * (English words on a Chinese page are marked "en", Chinese words on an
 * English page "zh-Hans"), else undefined. Chinese scripts count as one
 * language here — short labels cannot tell Simplified from Traditional.
 */
export function langWithin(text: unknown, pageLang: string | undefined | null): string | undefined {
  const own = detectContentLang({ title: text })
  const page = normalizeLang(pageLang) || 'en'
  return own.split('-')[0] === page.split('-')[0].toLowerCase() ? undefined : own
}
