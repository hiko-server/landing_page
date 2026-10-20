import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'

/**
 * What the content health rules need from an MDX body, read with the same
 * parser the public renderer starts with (remark-parse + remark-mdx +
 * remark-gfm, lib/mdx.ts) — so a heading, a link or a hard break is exactly
 * what the page will have, and code (fenced or inline) is never mistaken for
 * prose. Pure; unit-tested.
 *
 *   links      markdown links, GFM autolink literals (`https://…`,
 *              `www.…`; MDX has no `<https://…>` form), reference
 *              definitions and JSX `href` attributes
 *   images     markdown images and JSX `<img>` / `<Figure>` `src`
 *   headings   ATX / setext headings and JSX `<h1>`…`<h6>`
 *   breaks     runs of hard breaks used as blank lines, a backslash that
 *              ends a paragraph (shown as a literal "\"), and trailing-space
 *              breaks (invisible in the source)
 *
 * Every URL also carries `raw`, its exact spelling in the source, and the
 * span of the node, so a fix rewrites only that text (rewriteUrls).
 */

type Point = { line: number; column: number; offset?: number }
type MdNode = {
  type: string
  children?: MdNode[]
  position?: { start: Point; end: Point }
  url?: string
  alt?: string | null
  depth?: number
  name?: string | null
  value?: string
  attributes?: Array<{ type: string; name?: string; value?: unknown }>
}

export type ScannedLink = {
  url: string
  /** The URL as written in the source; null when it is spelled differently (escapes, entities). */
  raw: string | null
  line: number
  /** Source span [start, end) in which `raw` may be rewritten. */
  span: [number, number]
}

export type ScannedImage = ScannedLink & {
  /** Alt text; null when a JSX image has no alt attribute at all. */
  alt: string | null
  jsx: boolean
}

export type ScannedHeading = { depth: number; text: string; line: number }

export type BreakRun = {
  line: number
  /** Replace [start, end) with `replacement` to turn the run into a paragraph break. */
  start: number
  end: number
  replacement: string
  count: number
  /** Top-level paragraph and nothing after the run that would turn into another block. */
  fixable: boolean
}

export type StrayBackslash = { line: number; offset: number }
export type InvisibleBreak = { line: number; start: number; end: number }

export type BodyScan =
  | {
      ok: true
      links: ScannedLink[]
      images: ScannedImage[]
      headings: ScannedHeading[]
      breakRuns: BreakRun[]
      strayBackslashes: StrayBackslash[]
      invisibleBreaks: InvisibleBreak[]
    }
  | { ok: false; error: string; line: number | null }

const processor = unified().use(remarkParse).use(remarkMdx).use(remarkGfm)

const SKIP = new Set([
  'code',
  'inlineCode',
  'mdxjsEsm',
  'mdxFlowExpression',
  'mdxTextExpression',
  'html',
  'yaml',
  'toml',
])
const IMAGE_TAGS = new Set(['img', 'Figure'])

function startOf(n: MdNode): number {
  return n.position?.start.offset ?? 0
}
function endOf(n: MdNode): number {
  return n.position?.end.offset ?? 0
}
function lineOf(n: MdNode): number {
  return n.position?.start.line ?? 1
}

function attr(n: MdNode, name: string): { present: boolean; value: string | null } {
  const a = (n.attributes || []).find((x) => x.type === 'mdxJsxAttribute' && x.name === name)
  if (!a) return { present: false, value: null }
  return { present: true, value: typeof a.value === 'string' ? a.value : null }
}

/** The span of a JSX element's opening tag (its children may repeat the URL as text). */
function openingSpan(n: MdNode): [number, number] {
  const first = n.children?.[0]
  return [startOf(n), first?.position ? startOf(first) : endOf(n)]
}

/** How the URL is written inside `text` (GFM writes `www.x` for http://www.x). */
function rawIn(url: string, text: string): string | null {
  const candidates = [url]
  if (url.startsWith('http://www.')) candidates.push(url.slice('http://'.length))
  if (url.startsWith('mailto:')) candidates.push(url.slice('mailto:'.length))
  return candidates.find((c) => c && text.includes(c)) ?? null
}

function textOf(n: MdNode): string {
  if (n.type === 'text' || n.type === 'inlineCode') return n.value || ''
  if (n.type === 'image') return n.alt || ''
  return (n.children || []).map(textOf).join('')
}

const isBreakLike = (n: MdNode) =>
  n.type === 'break' || (n.type === 'mdxJsxTextElement' && n.name === 'br')
const isBlankText = (n: MdNode) => n.type === 'text' && !(n.value || '').trim()

/**
 * Text that would start a different block once it begins a paragraph of its
 * own: a list item, quote, heading, table row, fence, setext underline, JSX
 * or indented code. A break run followed by it is not fixed automatically.
 */
const BLOCK_START =
  /^(?:\d{1,9}[.)](?:\s|$)|[-+*](?:\s|$)|>|#{1,6}(?:\s|$)|\||`{3,}|~{3,}|[=-]+\s*$|<|\s)/

function scanParagraph(
  body: string,
  p: MdNode,
  topLevel: boolean,
  out: { runs: BreakRun[]; stray: StrayBackslash[]; invisible: InvisibleBreak[] }
) {
  const kids = p.children || []
  let i = 0
  let seenContent = false
  while (i < kids.length) {
    if (!isBreakLike(kids[i])) {
      if (!isBlankText(kids[i])) seenContent = true
      i++
      continue
    }
    const run: MdNode[] = []
    let j = i
    while (j < kids.length && (isBreakLike(kids[j]) || (isBlankText(kids[j]) && run.length))) {
      if (isBreakLike(kids[j])) run.push(kids[j])
      j++
    }
    const leading = !seenContent
    if (run.length >= 2 || leading) {
      const start = startOf(run[0])
      let end = endOf(run[run.length - 1])
      while (end < body.length && (body[end] === ' ' || body[end] === '\t')) end++
      const restOfLine = body.slice(
        end,
        body.indexOf('\n', end) === -1 ? body.length : body.indexOf('\n', end)
      )
      out.runs.push({
        line: lineOf(run[0]),
        start,
        end,
        replacement: leading ? '' : '\n\n',
        count: run.length,
        fixable: topLevel && !!restOfLine && !BLOCK_START.test(restOfLine),
      })
    } else {
      const b = run[0]
      if (b.type === 'break' && body[startOf(b)] === ' ')
        out.invisible.push({ line: lineOf(b), start: startOf(b), end: endOf(b) })
    }
    seenContent = true
    i = j
  }
  // CommonMark: a backslash that ends a paragraph is not a break; the page shows it.
  const last = kids[kids.length - 1]
  if (last && last.type === 'text') {
    const end = endOf(p)
    let k = end
    while (k > startOf(p) && body[k - 1] === '\\') k--
    if ((end - k) % 2 === 1)
      out.stray.push({ line: p.position?.end.line ?? lineOf(p), offset: end - 1 })
  }
}

function scan(body: string): BodyScan {
  let tree: MdNode
  try {
    tree = processor.parse(body) as unknown as MdNode
  } catch (err) {
    const e = err as {
      reason?: unknown
      message?: unknown
      line?: unknown
      place?: { line?: unknown; start?: { line?: unknown } }
    }
    const line =
      typeof e.line === 'number'
        ? e.line
        : typeof e.place?.start?.line === 'number'
          ? e.place.start.line
          : typeof e.place?.line === 'number'
            ? e.place.line
            : null
    return { ok: false, error: String(e.reason || e.message || err), line: line as number | null }
  }
  const links: ScannedLink[] = []
  const images: ScannedImage[] = []
  const headings: ScannedHeading[] = []
  const breaks = {
    runs: [] as BreakRun[],
    stray: [] as StrayBackslash[],
    invisible: [] as InvisibleBreak[],
  }

  const visit = (n: MdNode, parent: MdNode | null) => {
    if (SKIP.has(n.type)) return
    if (n.type === 'link' || n.type === 'definition') {
      const span: [number, number] = [startOf(n), endOf(n)]
      if (n.url)
        links.push({
          url: n.url,
          raw: rawIn(n.url, body.slice(span[0], span[1])),
          line: lineOf(n),
          span,
        })
    } else if (n.type === 'image') {
      const span: [number, number] = [startOf(n), endOf(n)]
      if (n.url)
        images.push({
          url: n.url,
          raw: rawIn(n.url, body.slice(span[0], span[1])),
          line: lineOf(n),
          span,
          alt: n.alt ?? '',
          jsx: false,
        })
    } else if (n.type === 'heading') {
      headings.push({
        depth: n.depth || 1,
        text: textOf(n).replace(/\s+/g, ' ').trim(),
        line: lineOf(n),
      })
    } else if (n.type === 'mdxJsxFlowElement' || n.type === 'mdxJsxTextElement') {
      const name = n.name || ''
      const span = openingSpan(n)
      const opening = body.slice(span[0], span[1])
      const href = attr(n, 'href').value
      if (href) links.push({ url: href, raw: rawIn(href, opening), line: lineOf(n), span })
      if (IMAGE_TAGS.has(name)) {
        const src = attr(n, 'src').value
        const alt = attr(n, 'alt')
        if (src)
          images.push({
            url: src,
            raw: rawIn(src, opening),
            line: lineOf(n),
            span,
            alt: alt.present ? (alt.value ?? '') : null,
            jsx: true,
          })
      }
      const h = /^h([1-6])$/.exec(name)
      if (h)
        headings.push({
          depth: Number(h[1]),
          text: textOf(n).replace(/\s+/g, ' ').trim(),
          line: lineOf(n),
        })
    } else if (n.type === 'paragraph') {
      scanParagraph(body, n, parent?.type === 'root', breaks)
    }
    for (const c of n.children || []) visit(c, n)
  }
  visit(tree, null)
  return {
    ok: true,
    links,
    images,
    headings,
    breakRuns: breaks.runs,
    strayBackslashes: breaks.stray,
    invisibleBreaks: breaks.invisible,
  }
}

const MEMO_MAX = 64
const memo = new Map<string, BodyScan>()

/** Scan a body (memoised by its text: the report is rebuilt on every request). */
export function scanBody(body: string): BodyScan {
  const text = typeof body === 'string' ? body : ''
  const hit = memo.get(text)
  if (hit) {
    memo.delete(text)
    memo.set(text, hit)
    return hit
  }
  const result = scan(text)
  memo.set(text, result)
  while (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value as string)
  return result
}

// ── Rewrites (the safe fixes) ───────────────────────────────────────────────

const URL_CHAR = /[A-Za-z0-9\-._~%!$&*+,;=:@/?#]/
const TRAILING_PUNCT = /[.,;:!?]/
const AFTER_PUNCT = /[\s)\]>"'<*_`]/

/** Does a URL that ends at `i` really end there (not continue as a longer URL)? */
function endsAt(s: string, i: number): boolean {
  if (i >= s.length || !URL_CHAR.test(s[i])) return true
  return TRAILING_PUNCT.test(s[i]) && (i + 1 >= s.length || AFTER_PUNCT.test(s[i + 1]))
}

function startsAt(s: string, i: number): boolean {
  return i === 0 || !/[A-Za-z0-9\-._~%/]/.test(s[i - 1])
}

type Edit = { start: number; end: number; text: string }

function applyEdits(body: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  let out = body
  let floor = Infinity
  for (const e of sorted) {
    if (e.end > floor) continue // overlapping edit: the later one already won
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
    floor = e.start
  }
  return out
}

/**
 * Rewrite URLs in a body. `pick(url, isImage)` returns how to rewrite the raw
 * spelling of a matching link or image (or null to leave it); every exact
 * occurrence of that spelling inside the node's span is replaced — the link
 * destination and, for `[https://…](https://…)`, its visible text. Code is
 * never touched. Returns the new body and how many places changed.
 */
export function rewriteUrls(
  body: string,
  pick: (url: string, isImage: boolean) => ((raw: string) => string) | null
): { body: string; changed: number } {
  const s = scanBody(body)
  if (!s.ok) return { body, changed: 0 }
  const edits = new Map<number, Edit>()
  const consider = (node: ScannedLink, isImage: boolean) => {
    if (node.raw === null) return
    const rewrite = pick(node.url, isImage)
    if (!rewrite) return
    const next = rewrite(node.raw)
    if (next === node.raw) return
    const [from, to] = node.span
    let at = body.indexOf(node.raw, from)
    while (at !== -1 && at + node.raw.length <= to) {
      if (startsAt(body, at) && endsAt(body, at + node.raw.length) && !edits.has(at)) {
        edits.set(at, { start: at, end: at + node.raw.length, text: next })
      }
      at = body.indexOf(node.raw, at + 1)
    }
  }
  s.links.forEach((l) => consider(l, false))
  s.images.forEach((i) => consider(i, true))
  return { body: applyEdits(body, Array.from(edits.values())), changed: edits.size }
}

export type BreakFix = 'paragraph-breaks' | 'remove-backslash' | 'visible-breaks'

/**
 * The hard-break fixes:
 *   paragraph-breaks  runs of breaks used as blank lines become one
 *                     paragraph break (only runs marked `fixable`)
 *   remove-backslash  drop the backslash that ends a paragraph (shown as "\")
 *   visible-breaks    trailing-space breaks become "\" breaks: the page is
 *                     unchanged, the source now shows the break
 */
export function fixBreaks(
  body: string,
  kinds: ReadonlySet<BreakFix>
): { body: string; changed: number } {
  const s = scanBody(body)
  if (!s.ok) return { body, changed: 0 }
  const edits: Edit[] = []
  if (kinds.has('paragraph-breaks')) {
    for (const r of s.breakRuns)
      if (r.fixable) edits.push({ start: r.start, end: r.end, text: r.replacement })
  }
  if (kinds.has('remove-backslash')) {
    for (const b of s.strayBackslashes) edits.push({ start: b.offset, end: b.offset + 1, text: '' })
  }
  if (kinds.has('visible-breaks')) {
    for (const b of s.invisibleBreaks) {
      const eol = body.slice(b.start, b.end).includes('\r\n') ? '\r\n' : '\n'
      edits.push({ start: b.start, end: b.end, text: `\\${eol}` })
    }
  }
  return { body: applyEdits(body, edits), changed: edits.length }
}
