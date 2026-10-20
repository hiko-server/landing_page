/**
 * Internal-link rewriting for a slug rename (H6) — pure and unit-tested.
 *
 * When /blog/old becomes /blog/new, every place the site links the old
 * address is updated so readers never take the redirect hop:
 *
 *   - MDX bodies (posts, case studies, /now, /uses, the /about bio):
 *     Markdown links, autolinks, JSX/HTML attributes and bare paths —
 *     outside fenced and inline code, which is literal text;
 *   - frontmatter strings (a case study's extra links) and a post's
 *     `project` (the slug of its case study);
 *   - JSON documents (the CV and the home page): any string holding the old
 *     path, and a CV project's `caseStudy` reference ("old", "/work/old").
 *
 * A path matches only as a whole path segment: "/blog/old" matches in
 * "/blog/old", "/blog/old#part", "/blog/old?x=1", "/blog/old/", "/blog/old.md"
 * and "https://<site host>/blog/old", never in "/blog/older" or
 * "/x/blog/old". The redirect still covers anything this misses.
 */

export type LinkCollection = 'blog' | 'work'

export type RewriteResult<T> = { value: T; count: number }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Pattern for the old path: preceded by the start, whitespace or a
 * delimiter that can open a URL — or by an absolute origin of one of the
 * site hosts — and followed by anything that cannot continue a slug.
 */
export function oldPathPattern(collection: LinkCollection, from: string, hosts: readonly string[] = []): RegExp {
  const hostAlt = hosts
    .map((h) => h.trim().toLowerCase().replace(/^www\./, ''))
    .filter(Boolean)
    .map(escapeRe)
  const origin = hostAlt.length ? `|https?:\\/\\/(?:www\\.)?(?:${hostAlt.join('|')})` : ''
  return new RegExp(`(^|[\\s(<\\["'=:,]${origin})\\/${collection}\\/${escapeRe(from)}(?![A-Za-z0-9_-])`, 'gi')
}

/** Replace the old path in one plain string (no code awareness). */
export function rewriteText(text: string, collection: LinkCollection, from: string, to: string, hosts: readonly string[] = []): RewriteResult<string> {
  if (!text || !text.includes(`/${collection}/`)) return { value: text, count: 0 }
  let count = 0
  const value = text.replace(oldPathPattern(collection, from, hosts), (_m, lead: string) => {
    count++
    return `${lead}/${collection}/${to}`
  })
  return { value, count }
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/

/** Replace inside the prose of a line, leaving `inline code` untouched. */
function rewriteOutsideInlineCode(line: string, collection: LinkCollection, from: string, to: string, hosts: readonly string[]): RewriteResult<string> {
  let count = 0
  let out = ''
  let rest = line
  const codeRe = /(`+)[\s\S]*?\1/
  for (;;) {
    const m = codeRe.exec(rest)
    if (!m) break
    const before = rewriteText(rest.slice(0, m.index), collection, from, to, hosts)
    out += before.value + m[0]
    count += before.count
    rest = rest.slice(m.index + m[0].length)
  }
  const tail = rewriteText(rest, collection, from, to, hosts)
  return { value: out + tail.value, count: count + tail.count }
}

/** Rewrite the old path in an MDX body, outside fenced code blocks and inline code. */
export function rewriteBodyLinks(body: string, collection: LinkCollection, from: string, to: string, hosts: readonly string[] = []): RewriteResult<string> {
  if (!body || !body.includes(`/${collection}/`)) return { value: body, count: 0 }
  const lines = body.split('\n')
  let fence: { char: string; len: number } | null = null
  let count = 0
  const out = lines.map((line) => {
    const m = line.match(FENCE_RE)
    if (fence) {
      if (m && m[1][0] === fence.char && m[1].length >= fence.len && !line.slice(m[0].length).trim()) fence = null
      return line
    }
    if (m) {
      fence = { char: m[1][0], len: m[1].length }
      return line
    }
    const r = rewriteOutsideInlineCode(line, collection, from, to, hosts)
    count += r.count
    return r.value
  })
  return { value: count ? out.join('\n') : body, count }
}

/** The slug part of a case-study reference ("old", "/work/old", "/work/old/"). */
export function referenceSlug(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase().replace(/^\/?work\//, '').replace(/\/+$/, '')
}

/** A reference to `from` rewritten to `to`, in the same form it was written. */
function rewriteReference(value: string, to: string): string {
  const t = value.trim()
  return /^\/?work\//i.test(t) ? `${t.startsWith('/') ? '/' : ''}work/${to}` : to
}

/**
 * Deep rewrite of a JSON-like value. `refKeys` names object keys whose
 * string value is a case-study slug reference (the CV's `caseStudy`, a
 * post's `project`); they follow a work rename.
 */
export function rewriteJsonLinks<T>(
  value: T,
  collection: LinkCollection,
  from: string,
  to: string,
  hosts: readonly string[] = [],
  refKeys: readonly string[] = ['caseStudy', 'project'],
): RewriteResult<T> {
  let count = 0
  const walk = (v: unknown, key?: string): unknown => {
    if (typeof v === 'string') {
      if (collection === 'work' && key && refKeys.includes(key) && referenceSlug(v) === from) {
        count++
        return rewriteReference(v, to)
      }
      const r = rewriteText(v, collection, from, to, hosts)
      count += r.count
      return r.value
    }
    if (Array.isArray(v)) return v.map((x) => walk(x))
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = walk(x, k)
      return out
    }
    return v
  }
  const next = walk(value) as T
  return { value: count ? next : value, count }
}

/** Frontmatter and body of one MDX document rewritten together. */
export function rewriteDocument(
  doc: { frontmatter: Record<string, unknown>; body: string },
  collection: LinkCollection,
  from: string,
  to: string,
  hosts: readonly string[] = [],
): RewriteResult<{ frontmatter: Record<string, unknown>; body: string }> {
  const fm = rewriteJsonLinks(doc.frontmatter || {}, collection, from, to, hosts, ['project'])
  const body = rewriteBodyLinks(doc.body || '', collection, from, to, hosts)
  const count = fm.count + body.count
  return { value: count ? { frontmatter: fm.value, body: body.value } : doc, count }
}
