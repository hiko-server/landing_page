/**
 * The light half of lib/orcid/id, for code that ships to every page (the
 * Person JSON-LD in lib/schema, the iD link): the canonical iD shape, the
 * ISO 7064 MOD 11-2 check and the record URI — but none of the parsing of
 * pasted shapes. The server hands the browser canonical iDs only (lib/orcid/
 * cv orcidOf → normalizeOrcidId), so a renderer just checks and formats.
 */

export const ORCID_HOST = 'orcid.org'
export const ORCID_URL_PREFIX = `https://${ORCID_HOST}/`

/** Canonical shape: four groups of four, the last character a digit or X. */
export const ORCID_ID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/

/** The MOD 11-2 check character (ISO 7064) for the first 15 digits of an iD. */
export function orcidChecksum(digits15: string): string {
  let total = 0
  for (const ch of digits15) total = (total + Number(ch)) * 2
  const result = (12 - (total % 11)) % 11
  return result === 10 ? 'X' : String(result)
}

/**
 * `value` when it is already a canonical iD ("0000-0002-1825-0097") or its
 * record URI, with a correct check character: the bare iD; '' otherwise.
 * (Anything an owner might paste is lib/orcid/id normalizeOrcidId's job.)
 */
export function canonicalOrcid(value: unknown): string {
  if (typeof value !== 'string') return ''
  const id = value.startsWith(ORCID_URL_PREFIX) ? value.slice(ORCID_URL_PREFIX.length) : value
  if (!ORCID_ID_RE.test(id)) return ''
  return orcidChecksum(id.replace(/-/g, '').slice(0, 15)) === id[18] ? id : ''
}

/** The record URI (`https://orcid.org/0000-…`) of a canonical iD or URI; '' otherwise. */
export function orcidRecordUrl(value: unknown): string {
  const id = canonicalOrcid(value)
  return id ? `${ORCID_URL_PREFIX}${id}` : ''
}
