/**
 * ORCID iD — the owner's researcher identifier (https://orcid.org).
 *
 * An iD is 16 characters in four groups, `NNNN-NNNN-NNNN-NNNC`: 15 digits and
 * a check character (a digit or `X`) computed with ISO 7064 MOD 11-2 over the
 * 15 digits. Owners paste it in many shapes, all accepted here:
 *
 *   NNNN-NNNN-NNNN-NNNC             NNNNNNNNNNNNNNNC
 *   https://orcid.org/0000-…        http://orcid.org/0000-…   orcid.org/0000-…
 *   ORCID: 0000-…                   orcid:0000-…              https://orcid.org/0000-…/
 *
 * `normalizeOrcidId` returns the canonical hyphenated iD with an upper-case
 * check character — the form the CV stores and every surface prints — or ''
 * when the value is not a well-formed iD with a correct checksum. The iD is
 * displayed as its full URI (`https://orcid.org/0000-…`) next to the ORCID
 * iD icon, as ORCID's iD display guidelines ask.
 *
 * Pure and dependency-free: the Studio, the server and tests share it. Code
 * that ships to every page uses the light lib/orcid/uri instead (the server
 * only ever hands it canonical iDs).
 */

import { ORCID_URL_PREFIX, orcidChecksum } from './uri'

export { ORCID_HOST, ORCID_ID_RE, ORCID_URL_PREFIX, canonicalOrcid, orcidChecksum, orcidRecordUrl } from './uri'

const PREFIXES = [/^https?:\/\/(?:www\.|pub\.|sandbox\.)?orcid\.org\//i, /^(?:www\.)?orcid\.org\//i, /^orcid\s*(?:id|iD)?\s*[:：]\s*/i, /^orcid\s+/i]

/** The 16 characters of `value` without hyphens, upper-cased, or '' when they do not form an iD shape. */
function compactOf(value: unknown): string {
  if (typeof value !== 'string') return ''
  let v = value.trim()
  for (const re of PREFIXES) v = v.replace(re, '')
  v = v.replace(/[/?#].*$/, '').trim()
  // Unicode dashes and spaces between the groups are tolerated.
  const compact = v.replace(/[\s\-‐‑‒–—]/g, '').toUpperCase()
  return /^\d{15}[\dX]$/.test(compact) ? compact : ''
}

export type OrcidIdProblem = '' | 'format' | 'checksum'

/**
 * Why `value` is not an ORCID iD: 'format' when it does not have the shape
 * of one, 'checksum' when the last character does not match the other 15
 * digits (a typo), '' when it is a valid iD. A blank value counts as valid
 * here ("no iD"); check that separately.
 */
export function orcidIdProblem(value: unknown): OrcidIdProblem {
  if (typeof value !== 'string' || !value.trim()) return ''
  const compact = compactOf(value)
  if (!compact) return 'format'
  return orcidChecksum(compact.slice(0, 15)) === compact[15] ? '' : 'checksum'
}

/** The canonical iD ("NNNN-NNNN-NNNN-NNNC") of any accepted shape; '' when `value` is not a valid iD. */
export function normalizeOrcidId(value: unknown): string {
  const compact = compactOf(value)
  if (!compact || orcidChecksum(compact.slice(0, 15)) !== compact[15]) return ''
  return `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}`
}

/** True for a value `normalizeOrcidId` accepts. */
export function isValidOrcidId(value: unknown): boolean {
  return normalizeOrcidId(value) !== ''
}

/** The record's URI, `https://orcid.org/NNNN-NNNN-NNNN-NNNC`; '' when `value` is not a valid iD. */
export function orcidUrl(value: unknown): string {
  const id = normalizeOrcidId(value)
  return id ? `${ORCID_URL_PREFIX}${id}` : ''
}

/**
 * The messages the validator and the Studio show. The format message names
 * the shape without quoting a real iD; the checksum message says what to do.
 */
export const ORCID_MESSAGES: Record<Exclude<OrcidIdProblem, ''>, string> = {
  format: 'ORCID iD must look like 0000-0000-0000-0000 — four groups of four digits, the last one may be X (the https://orcid.org/… link works too).',
  checksum: 'This ORCID iD has a typo: its last character does not match the other digits. Copy it from your ORCID record.',
}

/**
 * The CV sections with every Personal Info `orcid` that is a valid iD in
 * another accepted shape (a pasted https://orcid.org/… link, no hyphens, a
 * lower-case x) rewritten to the bare canonical iD — what the CV stores. A
 * blank or invalid value is left as it is (the validator reports an invalid
 * one). Returns the input itself when nothing changes.
 */
export function withBareOrcid<T>(sections: T): T {
  if (!Array.isArray(sections)) return sections
  let changed = false
  const out = sections.map((s) => {
    if (!s || typeof s !== 'object' || (s as { sessionName?: unknown }).sessionName !== 'personalInformation') return s
    const raw = (s as { orcid?: unknown }).orcid
    const bare = normalizeOrcidId(raw)
    if (!bare || bare === raw) return s
    changed = true
    return { ...s, orcid: bare }
  })
  return (changed ? out : sections) as T
}
