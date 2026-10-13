/**
 * remark plugin: make an MDX tree safe to render WITHOUT evaluating it.
 *
 * Bodies are compiled to a plain hast tree on the server (lib/mdx.ts) and
 * rendered with hast-util-to-jsx-runtime, so nothing in an article can run
 * code — neither on the server nor in the browser (no `new Function`, which
 * is what let the CSP drop 'unsafe-eval'). This step removes or neutralises
 * every MDX construct that would need evaluation:
 *
 *   - `{expressions}` (flow and text) and `import` / `export` (ESM) nodes
 *     are dropped;
 *   - JSX attributes whose value is an expression (`title={x}`) and spread
 *     attributes (`{...props}`) are dropped; only literal string / boolean
 *     attributes survive;
 *   - JSX elements are mapped to hast through `data.hName` /
 *     `data.hProperties` with an allow-list:
 *       iframe     only when `src` is a YouTube (nocookie) /embed/<id> or
 *                  Vimeo /video/<id> player URL (rebuilt by embedSrc);
 *                  attributes reduced to a safe set
 *       YouTube    `<YouTube id="…" title="…" />` → `youtube-embed`, a
 *                  click-to-load facade (components/MDX/VideoEmbed.tsx)
 *       Figure     `<Figure src alt caption size="wide|full" />` → the same
 *                  `figure.article-figure > img + figcaption` shape a lone
 *                  markdown image gets (lib/rehype/images.ts sizes it;
 *                  `size` becomes data-width, lib/rehype/galleries.ts)
 *       br, kbd, sub, sup, mark, small, abbr[title], details[open], summary
 *                  attribute-less presentational tags
 *     Anything else (e.g. `<script>`, `<Foo>`, `<iframe src=evil>`) is
 *     replaced by its children, so its text still reads but the element
 *     never reaches the page.
 */

type Attribute = {
  type: string
  name?: string
  value?: unknown
}

type MdastNode = {
  type: string
  name?: string | null
  attributes?: Attribute[]
  children?: MdastNode[]
  value?: string
  data?: unknown
  position?: unknown
}

const EXPRESSION_TYPES = new Set(['mdxFlowExpression', 'mdxTextExpression', 'mdxjsEsm'])
const JSX_TYPES = new Set(['mdxJsxFlowElement', 'mdxJsxTextElement'])

/**
 * Player URLs that may be embedded: `https://(www.)youtube-nocookie.com/embed/<id>`,
 * `https://(www.)youtube.com/embed/<id>` and `https://player.vimeo.com/video/<digits>`,
 * each with an optional query (no quotes, whitespace or fragment). Hosts
 * must match the CSP frame-src (lib/csp.js); embedSrc() rebuilds the URL.
 */
export const EMBED_SRC_RE =
  /^https:\/\/(?:(?:www\.)?(?:youtube-nocookie\.com|youtube\.com)\/embed\/[A-Za-z0-9_-]{11}|player\.vimeo\.com\/video\/\d{1,12})(?:\?[^\s"'<>#]*)?$/

const YOUTUBE_EMBED_RE = /^https:\/\/(?:www\.)?(youtube-nocookie\.com|youtube\.com)\/embed\/([A-Za-z0-9_-]{11})(?:\?([^\s"'<>#]*))?$/
const VIMEO_EMBED_RE = /^https:\/\/player\.vimeo\.com\/video\/(\d{1,12})(?:\?([^\s"'<>#]*))?$/

/** Player parameters kept from an embed URL; everything else is dropped. */
const YOUTUBE_PARAMS = ['start', 'end', 't', 'si', 'autoplay', 'mute', 'loop', 'playlist', 'list', 'controls', 'rel', 'playsinline', 'cc_load_policy', 'cc_lang_pref', 'hl']
const VIMEO_PARAMS = ['h', 'autoplay', 'muted', 'loop', 'autopause', 'badge', 'byline', 'portrait', 'title', 'color', 'dnt', 'app_id', 'player_id', 'controls', 'texttrack']
const PARAM_VALUE_RE = /^[A-Za-z0-9_.,:-]{1,64}$/

function keptQuery(query: string | undefined, allowed: readonly string[]): string {
  if (!query) return ''
  const params = new URLSearchParams(query)
  const kept: string[] = []
  for (const key of allowed) {
    const value = params.get(key)
    if (value !== null && PARAM_VALUE_RE.test(value)) kept.push(`${key}=${value}`)
  }
  return kept.length ? `?${kept.join('&')}` : ''
}

/**
 * The canonical player URL for an allowed embed, or null. The URL is
 * rebuilt from the parsed video id on the CSP host (`www.` added) plus the
 * allowed player parameters, so nothing else of the original survives.
 */
export function embedSrc(raw: string): string | null {
  const src = raw.trim()
  if (!EMBED_SRC_RE.test(src)) return null
  const yt = YOUTUBE_EMBED_RE.exec(src)
  if (yt) return `https://www.${yt[1]}/embed/${yt[2]}${keptQuery(yt[3], YOUTUBE_PARAMS)}`
  const vimeo = VIMEO_EMBED_RE.exec(src)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}${keptQuery(vimeo[2], VIMEO_PARAMS)}`
  return null
}

/** An 11-character YouTube video id. */
export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/

/** Presentational tags kept as-is, with the only attribute each may carry. */
const PLAIN_TAGS: Record<string, readonly string[]> = {
  br: [],
  kbd: [],
  sub: [],
  sup: [],
  mark: [],
  small: [],
  abbr: ['title'],
  details: ['open'],
  summary: [],
}

/** Literal attributes of a JSX element: name → string | true. Expressions never count. */
export function literalAttributes(node: { attributes?: Attribute[] }): Record<string, string | true> {
  const out: Record<string, string | true> = {}
  for (const attr of node.attributes || []) {
    if (attr.type !== 'mdxJsxAttribute' || typeof attr.name !== 'string') continue
    if (attr.value === null || attr.value === undefined) out[attr.name] = true
    else if (typeof attr.value === 'string') out[attr.name] = attr.value
  }
  return out
}

const str = (v: string | true | undefined): string => (typeof v === 'string' ? v.trim() : '')

type Mapped = { hName: string; hProperties: Record<string, unknown>; hChildren?: unknown[] } | null

function mapIframe(attrs: Record<string, string | true>): Mapped {
  const src = embedSrc(str(attrs.src))
  if (!src) return null
  const props: Record<string, unknown> = {
    src,
    title: str(attrs.title) || 'Embedded video',
    loading: 'lazy',
    referrerPolicy: 'strict-origin-when-cross-origin',
    allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
    allowFullScreen: true,
  }
  const width = Number(str(attrs.width))
  const height = Number(str(attrs.height))
  if (Number.isInteger(width) && width > 0 && width < 4000) props.width = width
  if (Number.isInteger(height) && height > 0 && height < 4000) props.height = height
  return { hName: 'iframe', hProperties: props }
}

function mapYouTube(attrs: Record<string, string | true>): Mapped {
  const id = str(attrs.id)
  if (!YOUTUBE_ID_RE.test(id)) return null
  const title = str(attrs.title)
  // No title: the facade names it "YouTube video" itself.
  return { hName: 'youtube-embed', hProperties: title ? { dataYoutubeId: id, title } : { dataYoutubeId: id } }
}

function mapFigure(attrs: Record<string, string | true>): Mapped {
  const src = str(attrs.src)
  if (!src) return null
  const alt = str(attrs.alt)
  const caption = str(attrs.caption)
  const img = { type: 'element', tagName: 'img', properties: { src, alt }, children: [] }
  const children: unknown[] = [img]
  if (caption) children.push({ type: 'element', tagName: 'figcaption', properties: {}, children: [{ type: 'text', value: caption }] })
  const size = str(attrs.size)
  const width = size === 'wide' || size === 'full' ? { dataWidth: size } : {}
  return { hName: 'figure', hProperties: { className: ['article-figure'], ...width }, hChildren: children }
}

function mapPlain(name: string, attrs: Record<string, string | true>): Mapped {
  const allowed = PLAIN_TAGS[name]
  if (!allowed) return null
  const props: Record<string, unknown> = {}
  for (const key of allowed) {
    const v = attrs[key]
    if (v === true) props[key] = true
    else if (typeof v === 'string' && v.trim()) props[key] = v.trim()
  }
  return { hName: name, hProperties: props }
}

/** The hast element an MDX JSX element becomes, or null when it is not allowed. */
export function mapJsxElement(name: string | null | undefined, attrs: Record<string, string | true>): Mapped {
  if (!name) return null
  if (name === 'iframe') return mapIframe(attrs)
  if (name === 'YouTube') return mapYouTube(attrs)
  if (name === 'Figure') return mapFigure(attrs)
  return mapPlain(name, attrs)
}

function sanitize(parent: MdastNode): void {
  const kids = parent.children
  if (!kids) return
  const out: MdastNode[] = []
  for (const child of kids) {
    if (EXPRESSION_TYPES.has(child.type)) continue
    if (JSX_TYPES.has(child.type)) {
      sanitize(child)
      const mapped = mapJsxElement(child.name, literalAttributes(child))
      if (!mapped) {
        // Not allowed: keep what it says, drop the element itself.
        out.push(...(child.children || []))
        continue
      }
      // remark-rehype turns the node into `hName` with `hProperties` (and
      // `hChildren` instead of the converted children when given).
      out.push({
        type: child.type,
        name: child.name,
        attributes: [],
        children: mapped.hChildren ? [] : child.children || [],
        data: mapped,
        position: child.position,
      })
      continue
    }
    sanitize(child)
    out.push(child)
  }
  parent.children = out
}

export default function remarkStripMdxExpressions() {
  return (tree: MdastNode) => {
    sanitize(tree)
    // A paragraph that held only expressions would render as an empty <p>.
    const blank = (c: MdastNode) => c.type === 'text' && !(c.value || '').trim()
    const prune = (node: MdastNode) => {
      if (!node.children) return
      node.children = node.children.filter((c) => !(c.type === 'paragraph' && (c.children || []).every(blank)))
      node.children.forEach(prune)
    }
    prune(tree)
  }
}
