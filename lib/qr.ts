import QRCode from 'qrcode'

/**
 * QR codes as inline SVG markup, generated on the server (getServerSideProps
 * / getStaticProps) so no QR library ships to the browser.
 *
 * The code is drawn with `currentColor` on a transparent background, so the
 * surrounding element decides its colour (ink on the printed CV, page.fg on
 * screen) and it stays legible in light and dark mode. Error correction
 * level M, no quiet zone (callers add their own padding). The SVG has only a
 * viewBox: size it with CSS.
 *
 * Results are memoised per URL; the inputs are a handful of fixed site URLs.
 */

const cache = new Map<string, string>()
const MAX_CACHE = 32

export async function qrSvg(url: string): Promise<string> {
  const hit = cache.get(url)
  if (hit) return hit
  const raw = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    // A fully transparent light colour makes qrcode omit the background path.
    color: { dark: '#000000ff', light: '#00000000' },
  })
  const svg = raw
    .trim()
    .replace(/stroke="#000000"/g, 'stroke="currentColor"')
    .replace('<svg ', '<svg aria-hidden="true" focusable="false" ')
  if (cache.size >= MAX_CACHE) cache.clear()
  cache.set(url, svg)
  return svg
}
