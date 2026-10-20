/**
 * Blur-up placeholders (C8), shared by the server-rendered markup and the
 * client: pure, no DOM or Node APIs.
 *
 * An image's placeholder is a 16 px WebP of the whole image (made at upload
 * or by the media-optimize backfill, lib/imageVariants.ts), inlined as a
 * `data:image/webp;base64,…` URL by the page (lib/uploadVariants.ts
 * placeholderDataUrl). It is drawn as the CSS background of the box the
 * image will fill, through a small SVG that blurs it (a Gaussian blur with
 * its edges kept opaque, so a 16 px source never shows blocks or a soft
 * transparent rim). The SVG has no script and no external reference: the
 * strict CSP's img-src 'self' data: covers it.
 */

/** What an inlined placeholder may be: a small base64 WebP (anything else is ignored). */
export const PLACEHOLDER_RE = /^data:image\/webp;base64,[A-Za-z0-9+/]{16,2800}={0,2}$/

export function isPlaceholder(value: unknown): value is string {
  return typeof value === 'string' && PLACEHOLDER_RE.test(value)
}

/** viewBox width of the blur SVG; the blur radius is half a placeholder pixel at this scale. */
const VIEW_W = 640
const STD_DEVIATION = 20

/**
 * CSS `background-image` value drawing `placeholder` blurred over a box of
 * the image's aspect ratio (`width` × `height`, 16:10 when unknown). Null for
 * anything that is not a valid placeholder.
 */
export function blurBackgroundImage(placeholder: unknown, width?: number | null, height?: number | null): string | null {
  if (!isPlaceholder(placeholder)) return null
  const ratio = width && height && width > 0 && height > 0 ? height / width : 10 / 16
  const viewH = Math.max(1, Math.round(VIEW_W * ratio))
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${VIEW_W} ${viewH}'>` +
    `<filter id='b' color-interpolation-filters='sRGB'>` +
    `<feGaussianBlur stdDeviation='${STD_DEVIATION}'/>` +
    `<feColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/>` +
    `<feFlood x='0' y='0' width='100%' height='100%'/>` +
    `<feComposite operator='out' in='s'/>` +
    `<feComposite in2='SourceGraphic'/>` +
    `<feGaussianBlur stdDeviation='${STD_DEVIATION}'/>` +
    `</filter>` +
    `<image width='100%' height='100%' x='0' y='0' preserveAspectRatio='none' filter='url(#b)' href='${placeholder}'/>` +
    `</svg>`
  // Percent-encode what a data: URL inside url("…") cannot carry raw.
  const encoded = svg.replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, '%22')
  return `url("data:image/svg+xml;charset=utf-8,${encoded}")`
}

/**
 * Inline style of the box behind an image while its placeholder shows:
 * the blurred placeholder sized like the image (`cover` around `position`
 * for cropped images, the whole box otherwise). Empty without a placeholder.
 */
export function placeholderStyle(
  placeholder: unknown,
  opts: { width?: number | null; height?: number | null; fit?: 'cover' | 'fill'; position?: string } = {},
): Record<string, string> {
  const image = blurBackgroundImage(placeholder, opts.width, opts.height)
  if (!image) return {}
  return {
    backgroundImage: image,
    backgroundSize: opts.fit === 'cover' ? 'cover' : '100% 100%',
    backgroundPosition: opts.position || '50% 50%',
    backgroundRepeat: 'no-repeat',
  }
}

/** The phases of an image with a placeholder (img[data-lqip], styles/globals.css). */
export type RevealState = 'idle' | 'pending' | 'reveal' | 'shown'

/**
 * The next state when the image has loaded (or failed): a pending image
 * fades in when fading is allowed, anything else simply shows.
 */
export function revealOnLoad(state: RevealState, fade: boolean): RevealState {
  return state === 'pending' && fade ? 'reveal' : 'shown'
}

/** The first state after hydration: an image the browser already has never fades. */
export function revealOnMount(complete: boolean, fade: boolean): RevealState {
  if (complete) return 'shown'
  return fade ? 'pending' : 'idle'
}
