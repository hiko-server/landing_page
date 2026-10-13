import fs from 'fs'
import path from 'path'
import { toHtml } from 'hast-util-to-html'
import type { Root as HastRoot } from 'hast'
import { listPosts, listWorkInDisplayOrder, getPost, getWork, type MDXRendered, type PostFrontmatter, type WorkFrontmatter } from './mdx'
import { classList, element, isElement, type HastElement, type HastNode } from './rehype/hast'
import { safeLinkHref, safeMediaSrc } from './rehype/safeUrls'
import { isValidUploadName } from './security/uploadName'
import { isoDate } from './postDate'
import { VIDEO_PROVIDER_LABEL, videoRefFromProps, videoWatchUrl } from './videoUrl'
import { isoWithTz, PERSON_NAME, PERSON_SHORT_NAME, SITE_TZ_OFFSET } from './schema'
import { cdata, xmlEscape } from './feeds'

/**
 * Full-content syndication: RSS 2.0 (blog and case studies) and JSON Feed
 * 1.1 (blog), built from the same compiled hast trees the pages render.
 *
 * renderFeedHtml() turns an article tree into self-contained HTML for feed
 * readers: same-site links and images become absolute, heading self-links
 * are unwrapped, embeds become plain links to the video (readers do not run
 * iframes), callouts become quotes that start with their label, galleries a
 * flat list of figures, and presentation-only attributes (inline styles, data-*,
 * lazy-loading hints, srcset) are dropped. URLs are checked again with the
 * compile-time rules (lib/rehype/safeUrls.ts): a refused link is unwrapped
 * and a refused image dropped, so no javascript: / data: URL can reach a
 * feed reader even from a tree that skipped the compiler. Drafts never
 * appear: every list comes from listPosts()/listWork(), which exclude them.
 */

export type FeedSite = {
  /** Canonical origin, e.g. https://lucian-dev.com */
  site: string
  /** Absolute URL of the article (base for in-page #fragment links). */
  pageUrl?: string
}

/**
 * Absolute URL of a link (`href`) or image (`src`) for a feed reader; ''
 * when the URL is refused. Same-site paths and in-page fragments resolve
 * against the site / article URL.
 */
function absolute(url: unknown, { site, pageUrl }: FeedSite, kind: 'href' | 'src'): string {
  const u = kind === 'href' ? safeLinkHref(url) : safeMediaSrc(url)
  if (!u) return ''
  if (u.startsWith('#')) return pageUrl ? `${pageUrl}${u}` : u
  if (u.startsWith('/')) return `${site}${u}`
  return u
}

/** Watch-page URL for a YouTube / Vimeo player URL; the URL itself otherwise. */
export function videoPageUrl(src: string): string {
  const yt = /^https:\/\/(?:www\.)?(?:youtube-nocookie\.com|youtube\.com)\/embed\/([A-Za-z0-9_-]{11})/.exec(src)
  if (yt) return `https://www.youtube.com/watch?v=${yt[1]}`
  const vimeo = /^https:\/\/player\.vimeo\.com\/video\/(\d+)/.exec(src)
  if (vimeo) return `https://vimeo.com/${vimeo[1]}`
  return src
}

function toHtmlText(node: HastNode): string {
  if (node.type === 'text') return node.value ?? ''
  return (node.children || []).map(toHtmlText).join('').replace(/\s+/g, ' ').trim()
}

function videoLink(href: string, label: string): HastElement {
  return element('p', {}, [element('a', { href }, [{ type: 'text', value: label }])])
}

const DROP_PROPS = new Set(['style', 'tabIndex', 'loading', 'decoding', 'srcSet', 'sizes', 'fetchPriority'])

/** Strip presentation-only attributes and resolve URLs; false when the element must go (refused image). */
function clean(node: HastElement, ctx: FeedSite): boolean {
  for (const key of Object.keys(node.properties)) {
    if (DROP_PROPS.has(key) || key.startsWith('data')) delete node.properties[key]
  }
  if (isElement(node, 'a') && 'href' in node.properties) node.properties.href = absolute(node.properties.href, ctx, 'href')
  if (isElement(node, 'img')) {
    const src = absolute(node.properties.src, ctx, 'src')
    if (!src) return false
    node.properties.src = src
  }
  return true
}

function transform(parent: HastNode, ctx: FeedSite): void {
  const kids = parent.children
  if (!kids) return
  const out: HastNode[] = []
  for (const child of kids) {
    if (!isElement(child)) {
      out.push(child)
      continue
    }
    if (child.tagName === 'iframe') {
      const href = safeLinkHref(videoPageUrl(typeof child.properties.src === 'string' ? child.properties.src : ''))
      const title = typeof child.properties.title === 'string' ? child.properties.title : 'the video'
      if (href) out.push(videoLink(href, `Watch ${title}`))
      continue
    }
    if (child.tagName === 'youtube-embed' || child.tagName === 'vimeo-embed') {
      // Click-to-load players (a lone video link, <YouTube>): the plain link again.
      const video = videoRefFromProps(child.properties)
      const title = typeof child.properties.title === 'string' && child.properties.title.trim() ? child.properties.title.trim() : 'the video'
      if (video) out.push(videoLink(videoWatchUrl(video), `Watch on ${VIDEO_PROVIDER_LABEL[video.provider]}: ${title}`))
      continue
    }
    if (child.tagName === 'div' && classList(child).includes('callout')) {
      // Callout → a quote opening with its label ("Note:" / "备注：").
      const label = typeof child.properties.dataCalloutLabel === 'string' && child.properties.dataCalloutLabel.trim() ? child.properties.dataCalloutLabel.trim() : 'Note'
      const colon = /[\u3400-\u9fff]/.test(label) ? '：' : ':'
      const quote = element('blockquote', {}, [element('p', {}, [element('strong', {}, [{ type: 'text', value: `${label}${colon}` }])]), ...child.children])
      transform(quote, ctx)
      out.push(quote)
      continue
    }
    if (child.tagName === 'figure' && classList(child).includes('article-gallery')) {
      // Gallery → its figures one after another, then the shared caption.
      const flat: HastNode = { type: 'root', children: [] }
      let caption = ''
      for (const part of child.children) {
        if (isElement(part, 'div')) flat.children!.push(...part.children.filter((c) => isElement(c, 'figure')))
        else if (isElement(part, 'figcaption')) caption = toHtmlText(part)
      }
      if (caption) flat.children!.push(element('p', {}, [element('em', {}, [{ type: 'text', value: caption }])]))
      transform(flat, ctx)
      out.push(...flat.children!)
      continue
    }
    const anchorClasses = classList(child)
    if (child.tagName === 'a' && anchorClasses.includes('heading-anchor-icon')) continue
    if (child.tagName === 'a' && anchorClasses.includes('heading-anchor')) {
      // Heading self-link: keep the heading text, drop the link.
      transform(child, ctx)
      out.push(...child.children)
      continue
    }
    if (!clean(child, ctx)) continue
    transform(child, ctx)
    if (child.tagName === 'a' && child.properties.href === '') {
      // Refused link: keep its text, drop the link.
      out.push(...child.children)
      continue
    }
    out.push(child)
  }
  parent.children = out
}

/** Static, reader-safe HTML for one article tree (the input is not modified). */
export function renderFeedHtml(tree: HastRoot, site: string | FeedSite): string {
  const ctx = typeof site === 'string' ? { site } : site
  const copy = structuredClone(tree) as unknown as HastNode
  transform(copy, ctx)
  return toHtml(copy as unknown as HastRoot)
}

// ── Covers ────────────────────────────────────────────────────────────────

const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
}

export type Enclosure = { url: string; type: string; length: number }

/** RSS enclosure for a same-site upload cover whose byte size is known; null otherwise. */
export function coverEnclosure(cover: unknown, site: string, uploadsDir = path.join(process.cwd(), 'public', 'uploads')): Enclosure | null {
  if (typeof cover !== 'string') return null
  const m = /^\/uploads\/([^/?#]+)$/.exec(cover.trim())
  if (!m || !isValidUploadName(m[1])) return null
  const type = IMAGE_TYPES[path.extname(m[1]).toLowerCase()]
  if (!type) return null
  try {
    const stat = fs.statSync(path.join(uploadsDir, m[1]))
    return stat.isFile() && stat.size > 0 ? { url: `${site}${cover.trim()}`, type, length: stat.size } : null
  } catch {
    return null
  }
}

// ── RSS 2.0 ───────────────────────────────────────────────────────────────

export type FeedItem = {
  url: string
  title: string
  summary?: string
  html: string
  lang: string
  /** YYYY-MM-DD or a full ISO timestamp. */
  published?: string
  modified?: string
  tags: string[]
  image?: string
  enclosure?: Enclosure | null
}

/** YYYY-MM-DD with an optional time and zone. */
const ISO_DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?)?$/i

/**
 * RFC 822 date for RSS. A bare YYYY-MM-DD is midnight in the site's time
 * zone (isoWithTz, as in the JSON Feed and JSON-LD), so every feed names
 * the same instant; full timestamps are kept as given.
 */
function rfc822(value: unknown): string {
  if (typeof value === 'number') return new Date(value).toUTCString()
  const raw = typeof value === 'string' ? value.trim() : ''
  const m = ISO_DATE_TIME_RE.exec(raw)
  if (m) {
    // A timestamp without a zone is site time, like a bare day.
    const exact = new Date(m[2] && !m[3] ? `${m[1]}T${m[2]}${SITE_TZ_OFFSET}` : isoWithTz(raw))
    if (!Number.isNaN(exact.getTime())) return exact.toUTCString()
  }
  // Other date-ish values ("May 1, 2024"): their calendar day, at site midnight.
  const iso = isoDate(value)
  return iso ? new Date(isoWithTz(iso)).toUTCString() : ''
}

export type RssChannel = {
  title: string
  link: string
  selfUrl: string
  description: string
}

/** RSS 2.0 with content:encoded, dc:creator and per-item xml:lang. */
export function buildRss(channel: RssChannel, items: readonly FeedItem[]): string {
  const xmlItems = items
    .map((it) => {
      const pub = rfc822(it.published)
      const lines = [
        `      <title>${xmlEscape(it.title)}</title>`,
        `      <link>${xmlEscape(it.url)}</link>`,
        `      <guid isPermaLink="true">${xmlEscape(it.url)}</guid>`,
        pub ? `      <pubDate>${pub}</pubDate>` : '',
        `      <dc:creator>${xmlEscape(PERSON_SHORT_NAME)}</dc:creator>`,
        it.summary ? `      <description>${xmlEscape(it.summary)}</description>` : '',
        `      <content:encoded>${cdata(it.html)}</content:encoded>`,
        ...it.tags.map((t) => `      <category>${xmlEscape(t)}</category>`),
        it.enclosure
          ? `      <enclosure url="${xmlEscape(it.enclosure.url)}" type="${xmlEscape(it.enclosure.type)}" length="${it.enclosure.length}" />`
          : '',
      ].filter(Boolean)
      return `\n    <item xml:lang="${xmlEscape(it.lang)}">\n${lines.join('\n')}\n    </item>`
    })
    .join('')
  const newest = items
    .map((it) => rfc822(it.modified || it.published))
    .filter(Boolean)
    .sort((a, b) => +new Date(a) - +new Date(b))
    .pop()

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlEscape(channel.title)}</title>
    <link>${xmlEscape(channel.link)}</link>
    <atom:link href="${xmlEscape(channel.selfUrl)}" rel="self" type="application/rss+xml" />
    <description>${xmlEscape(channel.description)}</description>${newest ? `\n    <lastBuildDate>${newest}</lastBuildDate>` : ''}${xmlItems}
  </channel>
</rss>`
}

// ── Items from the content store ──────────────────────────────────────────

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : []
}

function postItem(post: MDXRendered<PostFrontmatter>, site: string): FeedItem {
  const fm = post.frontmatter
  const url = `${site}${post.permalink}`
  const cover = typeof fm.cover === 'string' && fm.cover.trim() ? fm.cover.trim() : ''
  return {
    url,
    title: fm.title,
    summary: fm.description || post.excerpt || undefined,
    html: renderFeedHtml(post.tree, { site, pageUrl: url }),
    lang: post.lang,
    published: fm.date,
    modified: fm.updated || fm.date,
    tags: strList(fm.tags),
    image: cover ? (cover.startsWith('/') ? `${site}${cover}` : cover) : undefined,
    enclosure: coverEnclosure(cover, site),
  }
}

function workItem(work: MDXRendered<WorkFrontmatter>, site: string): FeedItem {
  const fm = work.frontmatter
  const url = `${site}${work.permalink}`
  const cover = typeof fm.cover === 'string' && fm.cover.trim() ? fm.cover.trim() : ''
  const updated = work.updatedAt ? new Date(work.updatedAt).toISOString() : undefined
  return {
    url,
    title: fm.title,
    summary: fm.description || work.excerpt || undefined,
    html: renderFeedHtml(work.tree, { site, pageUrl: url }),
    lang: work.lang,
    // The owner's publication date (At a glance) when set, else the last write.
    published: fm.published || updated,
    modified: updated,
    tags: strList(fm.tech),
    image: cover ? (cover.startsWith('/') ? `${site}${cover}` : cover) : undefined,
    enclosure: coverEnclosure(cover, site),
  }
}

/** Published posts, newest first, rendered for feeds. */
export async function blogFeedItems(site: string): Promise<FeedItem[]> {
  const posts = await Promise.all(listPosts().map((p) => getPost(p.slug)))
  return posts.filter((p): p is MDXRendered<PostFrontmatter> => !!p).map((p) => postItem(p, site))
}

/** Published case studies, most recently edited first, rendered for feeds. */
export async function workFeedItems(site: string): Promise<FeedItem[]> {
  const entries = [...listWorkInDisplayOrder()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const work = await Promise.all(entries.map((w) => getWork(w.slug)))
  return work.filter((w): w is MDXRendered<WorkFrontmatter> => !!w).map((w) => workItem(w, site))
}

/** RSS document for the blog (/feed.xml and /api/rss.xml). */
export async function buildBlogRss(site: string, selfUrl: string): Promise<string> {
  return buildRss(
    {
      title: `${PERSON_SHORT_NAME} — Writing`,
      link: `${site}/blog`,
      selfUrl,
      description: `Engineering essays, ML notes and write-ups by ${PERSON_NAME}.`,
    },
    await blogFeedItems(site),
  )
}

/** RSS document for the case studies (/work/feed.xml). */
export async function buildWorkRss(site: string, selfUrl: string): Promise<string> {
  return buildRss(
    {
      title: `${PERSON_SHORT_NAME} — Case studies`,
      link: `${site}/work`,
      selfUrl,
      description: `Project case studies by ${PERSON_NAME}.`,
    },
    await workFeedItems(site),
  )
}

// ── JSON Feed 1.1 ─────────────────────────────────────────────────────────

/** JSON Feed 1.1 for the blog (/feed.json). */
export function buildJsonFeed(site: string, items: readonly FeedItem[]) {
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${PERSON_SHORT_NAME} — Writing`,
    home_page_url: `${site}/blog`,
    feed_url: `${site}/feed.json`,
    description: `Engineering essays, ML notes and write-ups by ${PERSON_NAME}.`,
    authors: [{ name: PERSON_NAME, url: `${site}/about` }],
    items: items.map((it) => {
      const published = isoWithTz(it.published)
      const modified = isoWithTz(it.modified)
      return {
        id: it.url,
        url: it.url,
        title: it.title,
        content_html: it.html,
        ...(it.summary ? { summary: it.summary } : {}),
        ...(it.image ? { image: it.image } : {}),
        ...(published ? { date_published: published } : {}),
        ...(modified && modified !== published ? { date_modified: modified } : {}),
        ...(it.tags.length ? { tags: it.tags } : {}),
        language: it.lang,
      }
    }),
  }
}
