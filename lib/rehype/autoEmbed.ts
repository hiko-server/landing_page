import { element, isElement, textOf, walk, type HastElement, type HastNode } from './hast'
import { parseVideoUrl, videoRefFromProps, type VideoRef } from '../videoUrl'

/**
 * rehype plugin: video links become click-to-load players.
 *
 *   - A paragraph at the top level of the article whose only content is a
 *     link to a YouTube or Vimeo video (`https://youtu.be/…` on its own
 *     line, `[Demo](https://www.youtube.com/…)`)
 *     becomes a `youtube-embed` / `vimeo-embed` element — the same facade
 *     `<YouTube id="…" />` compiles to (components/MDX/VideoEmbed.tsx).
 *     The link text, when it is not the URL itself, is the video's title.
 *     Links inside running text, lists, quotes or tables stay links.
 *   - Every facade element (auto-embedded or from `<YouTube>`) gets its
 *     poster from `posterFor` (lib/videoPoster: a copy stored in /uploads,
 *     never a third-party thumbnail URL) as `data-poster`, `data-poster-srcset`,
 *     `data-poster-avif-srcset` (G4),
 *     `data-poster-width` / `-height`, and the article language as
 *     `data-ui-lang` for its short notes.
 *
 * Runs after ./safeUrls (hrefs are already vetted) and before ./liftBlocks.
 * The feeds turn the elements back into plain links (lib/feedHtml.ts).
 */

export type EmbedPoster = { src: string; srcSet?: string; avifSrcSet?: string; width: number; height: number }
export type PosterResolver = (v: VideoRef) => EmbedPoster | null | undefined | Promise<EmbedPoster | null | undefined>

export type AutoEmbedOptions = {
  posterFor?: PosterResolver
  /** Article language (BCP-47): 'zh…' switches the facade's notes to Chinese. */
  lang?: string
}

export const EMBED_TAGS = ['youtube-embed', 'vimeo-embed'] as const

const isBlank = (node: HastNode) => node.type === 'text' && !(node.value ?? '').trim()

/** The only link of a paragraph that holds nothing else (whitespace aside), or null. */
function loneLink(p: HastElement): HastElement | null {
  const meaningful = p.children.filter((c) => !isBlank(c))
  if (meaningful.length !== 1 || !isElement(meaningful[0], 'a')) return null
  return meaningful[0]
}

const sameUrl = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '')

/** The facade element for a video. */
export function embedElement(v: VideoRef, title: string): HastElement {
  const props: Record<string, unknown> = {}
  if (v.provider === 'youtube') props.dataYoutubeId = v.id
  else {
    props.dataVimeoId = v.id
    if (v.hash) props.dataVimeoHash = v.hash
  }
  if (v.start) props.dataStart = v.start
  if (title) props.title = title
  return element(`${v.provider}-embed`, props, [])
}

/** The embed a paragraph turns into, or null when it is not a lone video link. */
export function embedForParagraph(p: HastElement): HastElement | null {
  const a = loneLink(p)
  if (!a) return null
  const href = typeof a.properties.href === 'string' ? a.properties.href : ''
  const v = parseVideoUrl(href)
  if (!v) return null
  const text = textOf(a).replace(/\s+/g, ' ').trim()
  const title = text && !sameUrl(text, href) && !/^https?:\/\//i.test(text) ? text.slice(0, 200) : ''
  return embedElement(v, title)
}

export default function rehypeAutoEmbed(options: AutoEmbedOptions = {}) {
  const uiLang = /^zh(-|$)/i.test(options.lang || '') ? 'zh' : 'en'
  return async (tree: HastNode) => {
    tree.children = (tree.children || []).map((child) => (isElement(child, 'p') ? embedForParagraph(child) || child : child))

    const embeds: HastElement[] = []
    walk(tree, (node) => {
      if (isElement(node, EMBED_TAGS)) embeds.push(node)
    })
    await Promise.all(
      embeds.map(async (el) => {
        el.properties.dataUiLang = uiLang
        // Set only from the stored poster below, never by the author.
        delete el.properties.dataPosterAvifSrcset
        const v = videoRefFromProps(el.properties)
        if (!v || !options.posterFor) return
        // A lookup that fails only costs the poster, never the article.
        const poster = await (async () => options.posterFor!(v))().catch(() => null)
        if (!poster || !poster.src.startsWith('/') || poster.src.startsWith('//')) return
        el.properties.dataPoster = poster.src
        if (poster.srcSet) el.properties.dataPosterSrcset = poster.srcSet
        if (poster.srcSet && poster.avifSrcSet) el.properties.dataPosterAvifSrcset = poster.avifSrcSet
        if (poster.width > 0 && poster.height > 0) {
          el.properties.dataPosterWidth = poster.width
          el.properties.dataPosterHeight = poster.height
        }
      }),
    )
  }
}
