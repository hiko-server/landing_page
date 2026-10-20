/**
 * A focal point "x% y%" (both 0–100) in whole percents, or '' — also for the
 * centre, the renderer's default. Shared by the URL builder (lib/schema
 * ogImageUrl) and the parser, so a signed URL reads back the same value.
 */
export function parseOgFocus(raw: unknown): string {
  const m = /^\s*(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%\s*$/.exec(typeof raw === 'string' ? raw : '')
  if (!m) return ''
  const x = Math.round(Number(m[1]))
  const y = Math.round(Number(m[2]))
  if (x > 100 || y > 100 || (x === 50 && y === 50)) return ''
  return `${x}% ${y}%`
}
