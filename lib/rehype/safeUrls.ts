import { safeHref } from '../cvFormat'
import { embedSrc } from './stripMdxExpressions'
import { isElement, type HastNode } from './hast'

/**
 * URL rules for compiled article trees, and the rehype pass that applies
 * them at compile time (lib/mdx.ts), so every consumer of the tree — the
 * React renderer, the feeds (lib/feedHtml.ts), search — only ever sees
 * safe URLs.
 *
 *   links  (a, area: href)     safeHref (lib/cvFormat.ts: http(s), mailto,
 *                              tel, single-slash paths, bare domains →
 *                              https) plus same-document `#fragment`s
 *                              (footnotes, heading anchors). A refused
 *                              link is unwrapped: its text stays.
 *   media  (img, source, video, audio, track: src / srcset / poster)
 *                              http(s) and single-slash paths; `//host`
 *                              becomes https. A refused <img>/<source> is
 *                              dropped, refused srcset entries are removed.
 *   iframe (src)               the player allow-list (embedSrc in
 *                              ./stripMdxExpressions); refused → dropped.
 *
 * javascript:, data:, vbscript:, protocol-relative links, `/\host` and URLs
 * carrying control characters are always refused.
 */

// Control characters are percent-encoded in markdown URLs; a raw one can
// only come from crafted JSX attributes (browsers strip tab/newline, which
// can turn "/\t/host" into a protocol-relative URL).
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/

function preCheck(url: unknown): string {
  if (typeof url !== 'string') return ''
  const u = url.trim()
  if (!u || CONTROL_RE.test(u) || u.startsWith('/\\')) return ''
  return u
}

/** A link target that may be rendered, normalised; '' when refused. Same-document fragments are kept. */
export function safeLinkHref(url: unknown): string {
  const u = preCheck(url)
  if (!u) return ''
  if (u.startsWith('#')) return u
  return safeHref(u)
}

/** An image / media source that may be loaded, normalised; '' when refused. */
export function safeMediaSrc(url: unknown): string {
  const u = preCheck(url)
  if (!u) return ''
  if (u.startsWith('//')) return /^\/\/[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/.test(u) ? `https:${u}` : ''
  if (/^\/(?!\/)/.test(u) || /^https?:\/\/[^/]/i.test(u)) return u
  return ''
}

const DESCRIPTOR_RE = /^\d+(\.\d+)?[wxh]$/

/**
 * A `srcset` with every refused candidate removed ('' when none is left).
 * Candidates are split the way browsers do (URL up to whitespace, then
 * descriptors up to the next comma), so commas inside a URL never smuggle
 * a second candidate in.
 */
export function safeSrcSet(value: unknown): string {
  if (typeof value !== 'string') return ''
  const out: string[] = []
  let i = 0
  while (i < value.length) {
    while (i < value.length && /[\s,]/.test(value[i])) i++
    if (i >= value.length) break
    let j = i
    while (j < value.length && !/\s/.test(value[j])) j++
    let url = value.slice(i, j)
    let descriptors: string[] = []
    if (url.endsWith(',')) url = url.replace(/,+$/, '')
    else {
      let k = j
      while (k < value.length && value[k] !== ',') k++
      descriptors = value.slice(j, k).trim().split(/\s+/).filter(Boolean)
      j = k
    }
    i = j
    const safe = safeMediaSrc(url)
    if (safe && descriptors.every((d) => DESCRIPTOR_RE.test(d))) out.push([safe, ...descriptors].join(' '))
  }
  return out.join(', ')
}

const LINK_TAGS = ['a', 'area']
const MEDIA_TAGS = ['img', 'source', 'video', 'audio', 'track']
/** Elements that are pointless without their source. */
const DROP_WITHOUT_SRC = ['img', 'source', 'track']

const isBlank = (node: HastNode) => node.type === 'text' && !(node.value ?? '').trim()

/** Clean one element in place; returns its replacement (children for an unwrapped link, [] to drop it). */
function sanitizeElement(node: HastNode): HastNode[] {
  if (!isElement(node)) return [node]
  const p = node.properties
  if (isElement(node, LINK_TAGS) && 'href' in p) {
    const href = safeLinkHref(p.href)
    if (!href) return node.tagName === 'a' ? node.children : []
    p.href = href
  }
  if (isElement(node, MEDIA_TAGS)) {
    if ('src' in p) {
      const src = safeMediaSrc(p.src)
      if (src) p.src = src
      else if (DROP_WITHOUT_SRC.includes(node.tagName)) return []
      else delete p.src
    }
    if ('srcSet' in p) {
      const srcSet = safeSrcSet(p.srcSet)
      if (srcSet) p.srcSet = srcSet
      else {
        delete p.srcSet
        delete p.sizes
        if (node.tagName === 'source' && !('src' in p)) return []
      }
    }
    if ('poster' in p) {
      const poster = safeMediaSrc(p.poster)
      if (poster) p.poster = poster
      else delete p.poster
    }
  }
  if (isElement(node, 'iframe')) {
    const src = typeof p.src === 'string' ? embedSrc(p.src) : null
    if (!src) return []
    p.src = src
  }
  return [node]
}

/** A node with the rules applied to it and its descendants: [] when dropped, the children of an unwrapped link. */
function sanitizeNode(node: HastNode): HastNode[] {
  if (!isElement(node)) return [node]
  const replaced = sanitizeElement(node)
  if (replaced.length !== 1 || replaced[0] !== node) return replaced.flatMap(sanitizeNode)
  const hadContent = !node.children.every(isBlank)
  const hadImage = node.children.some((c) => isElement(c, 'img'))
  node.children = node.children.flatMap(sanitizeNode)
  // A paragraph left empty by a dropped image, or a figure that lost its
  // image, would render as an empty box.
  if (isElement(node, 'p') && hadContent && node.children.every(isBlank)) return []
  if (isElement(node, 'figure') && hadImage && !node.children.some((c) => isElement(c, 'img'))) return []
  return [node]
}

/** rehype plugin: apply the URL rules above to a whole tree (in place). */
export default function rehypeSafeUrls() {
  return (tree: HastNode) => {
    tree.children = (tree.children || []).flatMap(sanitizeNode)
  }
}
