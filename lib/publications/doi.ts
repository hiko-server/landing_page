/**
 * DOI handling. A DOI is "10.<registrant>/<suffix>" (ISO 26324); owners paste
 * it in many shapes, all accepted:
 *
 *   10.1145/3290605.3300857
 *   doi:10.1145/3290605.3300857        DOI: 10.1145/…
 *   https://doi.org/10.1145/…          http://dx.doi.org/10.1145/…
 *
 * `normalizeDoi` returns the bare DOI (case kept as typed — DOIs compare
 * case-insensitively, see `sameDoi`) or '' when the value is not a DOI.
 * `doiUrl` builds the https://doi.org/ resolver link with the characters a
 * URL cannot carry (space, #, ?, %, quotes, <, >, …) percent-encoded, as the
 * DOI Handbook asks.
 */

/** Registrant code of 4–9 digits (optionally with dotted sub-codes), a slash, and a non-empty suffix without spaces. */
export const DOI_RE = /^10\.\d{4,9}(?:\.\d+)*\/\S+$/

const PREFIXES = [/^https?:\/\/(?:dx\.)?doi\.org\//i, /^doi\.org\//i, /^doi\s*:\s*/i, /^doi\s+/i]

/** The bare DOI, or '' when `value` is not a DOI. */
export function normalizeDoi(value: unknown): string {
  if (typeof value !== 'string') return ''
  let v = value.trim()
  for (const re of PREFIXES) v = v.replace(re, '')
  // A DOI pasted from a sentence often drags a trailing full stop or comma along.
  v = v.replace(/[.,;]+$/, '')
  try {
    // A resolver link may already be percent-encoded ("10.1000/a%23b").
    if (/%[0-9a-f]{2}/i.test(v)) v = decodeURIComponent(v)
  } catch {
    /* keep the raw value; the shape check decides */
  }
  return DOI_RE.test(v) ? v : ''
}

/** True for a value `normalizeDoi` accepts (blank counts as "no DOI", not invalid — check that separately). */
export function isValidDoi(value: unknown): boolean {
  return normalizeDoi(value) !== ''
}

/** DOIs are case-insensitive. */
export function sameDoi(a: unknown, b: unknown): boolean {
  const x = normalizeDoi(a)
  return !!x && x.toLowerCase() === normalizeDoi(b).toLowerCase()
}

/** https://doi.org/<doi> for a DOI (bare or in any accepted shape); '' when it is not one. */
export function doiUrl(value: unknown): string {
  const doi = normalizeDoi(value)
  if (!doi) return ''
  // encodeURI keeps the characters a path may hold (; : @ & = + $ , ( ) …)
  // readable; "#" and "?" would start a fragment / query, so they are encoded too.
  const path = encodeURI(doi).replace(/[#?]/g, (c) => encodeURIComponent(c))
  return `https://doi.org/${path}`
}
