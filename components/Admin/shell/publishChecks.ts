/**
 * Pre-publish checklist (pure, unit-tested). Runs in the Publish sheet next
 * to the compile dry run. Warnings never block publishing; only `error`
 * results do (an invalid slug here, a compile error from the dry run).
 *
 * Rules:
 *   - title at most 70 characters (search results cut longer ones)
 *   - description 50–160 characters (link previews and meta description)
 *   - every image has alt text that is not a file name or "image"
 *   - images hosted elsewhere (https, not this site) → "Import & optimize"
 *     copies them into the uploads; http:// images are flagged as insecure
 *   - links to /blog/<slug> or /work/<slug> point at existing items
 *
 * Code blocks and inline code are ignored: their text is literal.
 */

export type CheckField = 'title' | 'description' | 'slug' | 'cover' | 'body'

export type PublishCheck = {
  id: string
  level: 'ok' | 'warning' | 'error'
  label: string
  detail?: string
  /** The field the check links to. */
  field: CheckField
  /** 1-based body line, for body checks. */
  line?: number
  /** A remote image the sheet can import and replace (exact URL). */
  importUrl?: string
}

export type PublishCheckInput = {
  title: string
  description: string
  body: string
  slug: string
  cover?: string
  /** Collection of the item being published (its own slug counts as known). */
  collection?: 'blog' | 'work'
  knownSlugs: { blog: string[]; work: string[] }
  /** Host of the public site (defaults to NEXT_PUBLIC_SITE_HOST / lucian-dev.com). */
  siteHost?: string
}

export const TITLE_MAX = 70
export const DESCRIPTION_MIN = 50
export const DESCRIPTION_MAX = 160
export const SLUG_MAX = 64

const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/
const FILENAME_ALT_RE = /\.(png|jpe?g|webp|gif|avif)$/i
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/
const INLINE_CODE_RE = /(`+)[\s\S]*?\1/g
const MD_IMAGE_RE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g
const TAG_IMAGE_RE = /<(img|Figure)\b([^>]*)>/g
const MD_LINK_RE = /(?<!!)\[[^\]]*\]\(\s*<?([^)\s>]+)>?/g
const HREF_RE = /\bhref\s*=\s*["']([^"']+)["']/g

/**
 * Slug for a new item from its title: ASCII words, lower-case, joined by
 * '-', at most 64 characters, accents folded ("Café notes" → "cafe-notes").
 * Empty when the title has no ASCII letters or digits (e.g. a Chinese title).
 */
export function slugFromTitle(title: string, max = SLUG_MAX): string {
  const ascii = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const words: string[] = ascii.match(/[a-z0-9]+/g) ?? []
  let out = ''
  for (const w of words) {
    const next = out ? `${out}-${w}` : w
    if (next.length > max) break
    out = next
  }
  if (!out && words.length) out = (words[0] ?? '').slice(0, max)
  return out
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs)
  return m ? (m[1] ?? m[2] ?? '') : null
}

type Found = { line: number; src: string; alt: string }

/** Lines of the body outside fenced code, with inline code removed. */
function proseLines(body: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = []
  let fence: { char: string; len: number } | null = null
  body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((raw, i) => {
      const m = raw.match(FENCE_RE)
      if (fence) {
        if (m && m[1][0] === fence.char && m[1].length >= fence.len && !raw.slice(m[0].length).trim()) fence = null
        return
      }
      if (m) {
        fence = { char: m[1][0], len: m[1].length }
        return
      }
      out.push({ line: i + 1, text: raw.replace(INLINE_CODE_RE, '') })
    })
  return out
}

/** Images in Markdown (`![alt](src)`) and JSX/HTML (`<img>`, `<Figure>`). */
export function findImages(body: string): Found[] {
  const found: Found[] = []
  for (const { line, text } of proseLines(body)) {
    for (const m of text.matchAll(MD_IMAGE_RE)) found.push({ line, src: m[2], alt: m[1].trim() })
    for (const m of text.matchAll(TAG_IMAGE_RE)) {
      const src = attr(m[2], 'src')
      if (src) found.push({ line, src, alt: (attr(m[2], 'alt') ?? '').trim() })
    }
  }
  return found
}

/** Link targets in Markdown links and href attributes. */
export function findLinks(body: string): Array<{ line: number; href: string }> {
  const found: Array<{ line: number; href: string }> = []
  for (const { line, text } of proseLines(body)) {
    for (const m of text.matchAll(MD_LINK_RE)) found.push({ line, href: m[1] })
    for (const m of text.matchAll(HREF_RE)) found.push({ line, href: m[1] })
  }
  return found
}

export function isFilenameAlt(alt: string): boolean {
  const a = alt.trim()
  return FILENAME_ALT_RE.test(a) || a.toLowerCase() === 'image'
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function isOwnHost(host: string, siteHost: string): boolean {
  const site = siteHost.toLowerCase()
  return host === site || host === `www.${site}`
}

/** `/blog/x` (or https://<site>/work/y) → { collection, slug }, else null. */
export function internalTarget(href: string, siteHost: string): { collection: 'blog' | 'work'; slug: string } | null {
  let p = href
  if (/^https?:\/\//i.test(href)) {
    const host = hostOf(href)
    if (!host || !isOwnHost(host, siteHost)) return null
    p = new URL(href).pathname
  }
  const m = /^\/(blog|work)\/([^/?#]+)\/?(?:[?#].*)?$/.exec(p)
  if (!m) return null
  let slug = m[2]
  try {
    slug = decodeURIComponent(slug)
  } catch {
    /* keep raw */
  }
  return { collection: m[1] as 'blog' | 'work', slug }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function runPublishChecks(input: PublishCheckInput): PublishCheck[] {
  const siteHost = input.siteHost || process.env.NEXT_PUBLIC_SITE_HOST || 'lucian-dev.com'
  const checks: PublishCheck[] = []
  const title = input.title.trim()
  const description = input.description.trim()

  // Slug
  if (!input.slug) {
    checks.push({ id: 'slug', level: 'error', field: 'slug', label: 'Add a slug', detail: 'It becomes the URL and can’t be changed later.' })
  } else if (!SLUG_RE.test(input.slug)) {
    checks.push({ id: 'slug', level: 'error', field: 'slug', label: 'Slug can only use a–z, 0–9, - and _' })
  }

  // Title
  if (!title) checks.push({ id: 'title', level: 'error', field: 'title', label: 'Add a title' })
  else if (title.length > TITLE_MAX) {
    checks.push({
      id: 'title',
      level: 'warning',
      field: 'title',
      label: `Title is ${title.length} characters`,
      detail: `Search results cut titles after about ${TITLE_MAX}.`,
    })
  } else checks.push({ id: 'title', level: 'ok', field: 'title', label: `Title length ${title.length}/${TITLE_MAX}` })

  // Description
  if (!description) {
    checks.push({
      id: 'description',
      level: 'warning',
      field: 'description',
      label: 'No description',
      detail: `Link previews and search results use it; aim for ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} characters.`,
    })
  } else if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    checks.push({
      id: 'description',
      level: 'warning',
      field: 'description',
      label: `Description is ${description.length} characters`,
      detail: `Aim for ${DESCRIPTION_MIN}–${DESCRIPTION_MAX}: ${description.length < DESCRIPTION_MIN ? 'previews look thin' : 'longer ones get cut off'}.`,
    })
  } else {
    checks.push({ id: 'description', level: 'ok', field: 'description', label: `Description length ${description.length}` })
  }

  // Images
  const images = findImages(input.body)
  let altProblems = 0
  const remoteSeen = new Set<string>()
  images.forEach((img, idx) => {
    if (!img.alt || isFilenameAlt(img.alt)) {
      altProblems++
      checks.push({
        id: `alt-${idx}`,
        level: 'warning',
        field: 'body',
        line: img.line,
        label: img.alt ? `Alt text “${img.alt}” is a file name` : 'Image without alt text',
        detail: 'Describe what the image shows for screen-reader users.',
      })
    }
  })
  const remoteCandidates: Array<{ src: string; field: CheckField; line?: number }> = [
    ...images.map((i) => ({ src: i.src, field: 'body' as const, line: i.line })),
    ...(input.cover ? [{ src: input.cover, field: 'cover' as const }] : []),
  ]
  remoteCandidates.forEach((c, idx) => {
    const host = /^https?:\/\//i.test(c.src) ? hostOf(c.src) : null
    if (!host || isOwnHost(host, siteHost) || remoteSeen.has(`${c.field}:${c.src}`)) return
    remoteSeen.add(`${c.field}:${c.src}`)
    const insecure = /^http:\/\//i.test(c.src)
    checks.push({
      id: `remote-${idx}`,
      level: 'warning',
      field: c.field,
      line: c.line,
      label: insecure ? `Insecure image from ${host}` : `${c.field === 'cover' ? 'Cover' : 'Image'} hosted on ${host}`,
      detail: insecure
        ? 'Browsers block http:// images on this https site. Upload a copy instead.'
        : 'It can disappear or change, and loads without responsive sizes. Import it to the uploads.',
      ...(insecure ? {} : { importUrl: c.src }),
    })
  })
  if (images.length && !altProblems) {
    checks.push({ id: 'alt', level: 'ok', field: 'body', label: `${plural(images.length, 'image')} with alt text` })
  }

  // Internal links
  const known = {
    blog: new Set(input.knownSlugs.blog),
    work: new Set(input.knownSlugs.work),
  }
  if (input.collection && input.slug) known[input.collection].add(input.slug)
  const links = findLinks(input.body)
  let internal = 0
  links.forEach((l, idx) => {
    const t = internalTarget(l.href, siteHost)
    if (!t) return
    internal++
    if (!known[t.collection].has(t.slug)) {
      checks.push({
        id: `link-${idx}`,
        level: 'warning',
        field: 'body',
        line: l.line,
        label: `Link to /${t.collection}/${t.slug} goes nowhere`,
        detail: `There is no ${t.collection === 'blog' ? 'post' : 'case study'} with that slug (drafts included).`,
      })
    }
  })
  if (internal && !checks.some((c) => c.id.startsWith('link-'))) {
    checks.push({ id: 'links', level: 'ok', field: 'body', label: `${plural(internal, 'internal link')} resolve` })
  }

  return checks
}

/** True when nothing blocks publishing. */
export function canPublish(checks: PublishCheck[]): boolean {
  return !checks.some((c) => c.level === 'error')
}
