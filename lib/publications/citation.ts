/**
 * Display parts of a citation (the web list, the A4 sheet, the Reading
 * view) and stable citation keys / anchors.
 *
 * The display follows the reading order of an APA reference but keeps each
 * part separate, so every renderer can style it (owner's name emphasised,
 * venue in italics, a status chip) without re-parsing a string:
 *
 *   authors · title · venue, volume(issue), pages · publisher · year
 *
 * A paper under review never names its venue (APA 7: a manuscript submitted
 * for publication does not name the journal), and only published work is
 * shown without a status label.
 */

import { doiUrl } from './doi'
import { hasCjk, isOwnerName, parseName, type OwnerNames } from './names'
import { isPublishedStatus, statusLabel, type PubLang, type Publication } from './types'

export type AuthorPart = {
  /** The name as typed (marks such as "*" kept); '' for a hidden author. */
  name: string
  /** The owner himself — renderers emphasise it. */
  self: boolean
  /** An author the owner hid: render a placeholder ("…"), never a name. */
  hidden: boolean
}

export type CitationParts = {
  authors: AuthorPart[]
  title: string
  /** '' for a paper under review (see above). */
  venue: string
  /** "12(3), 45–67" — volume, issue and pages as far as given. */
  details: string
  publisher: string
  /** Four-digit year, '' when none. */
  year: string
  /** Status label for anything not yet published ('' when published). */
  status: string
  award: string
  /** https://doi.org/… ('' when no DOI). */
  doiUrl: string
  /** True when the owner's name was recognised among the authors. */
  hasSelf: boolean
}

/** Page range with an en dash: "45-67" / "45 – 67" → "45–67". */
export function formatPages(pages: string): string {
  return pages.replace(/\s*(?:--?|–|—)\s*/g, '–').trim()
}

/** "12(3), 45–67"; parts that are missing are left out. */
export function formatDetails(p: Pick<Publication, 'volume' | 'issue' | 'pages'>): string {
  const vol = p.volume && p.issue ? `${p.volume}(${p.issue})` : p.volume || (p.issue ? `(${p.issue})` : '')
  return [vol, p.pages ? formatPages(p.pages) : ''].filter(Boolean).join(', ')
}

/** Whether the venue is part of the reference for this status. */
export function showsVenue(p: Pick<Publication, 'status'>): boolean {
  return p.status !== 'under-review'
}

export function formatCitationParts(p: Publication, lang: PubLang, owner: OwnerNames): CitationParts {
  const authors = p.authors.map((a) => ({ name: a.hidden ? '' : a.name, hidden: a.hidden, self: !a.hidden && isOwnerName(a.name, owner) }))
  const venueShown = showsVenue(p)
  return {
    authors,
    title: p.title,
    venue: venueShown ? p.venue : '',
    details: venueShown ? formatDetails(p) : '',
    publisher: venueShown ? p.publisher : '',
    year: p.year,
    status: isPublishedStatus(p.status) ? '' : statusLabel(p.status, lang),
    award: p.award,
    doiUrl: doiUrl(p.doi),
    hasSelf: authors.some((a) => a.self),
  }
}

// ── Citation keys ────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'on', 'of', 'for', 'in', 'to', 'and', 'at', 'by', 'from', 'with', 'via', 'is', 'are', 'towards', 'toward', 'into', 'over', 'under',
])

/** ASCII letters/digits only, lowercase ("Müller" → "muller"). */
function asciiFold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/** First significant word of a title, ASCII-folded ('' when none — e.g. a Chinese title). */
function firstWord(title: string): string {
  for (const w of title.split(/[\s\-–—:/]+/)) {
    const folded = asciiFold(w)
    if (folded && !STOP_WORDS.has(folded) && /[a-z]/.test(folded)) return folded
  }
  return ''
}

/** Family name of the first visible author, ASCII-folded ('' when none or not Latin script). */
function firstFamily(p: Publication): string {
  const first = p.authors.find((a) => !a.hidden)
  if (!first || hasCjk(first.name)) return ''
  return asciiFold(parseName(first.name).family)
}

/**
 * Base citation key "lastnameYEARfirstword" (Google Scholar style, e.g.
 * li2025deep). No year → "nd" (APA's "no date"), so a key always holds a
 * digit or "nd" and can never collide with a page element id. Without a
 * Latin-script author the key starts with "paper".
 */
export function baseCitationKey(p: Publication): string {
  return `${firstFamily(p) || 'paper'}${p.year || 'nd'}${firstWord(p.title)}`
}

/**
 * Unique keys for a list, in list order: the first holder of a base key
 * keeps it, later ones get b, c, … (li2025deep, li2025deepb). Returned in
 * the order of `list`. The keys double as the /publications anchors.
 */
export function citationKeys(list: readonly Publication[]): string[] {
  const used = new Map<string, number>()
  const taken = new Set<string>()
  return list.map((p) => {
    const base = baseCitationKey(p)
    let n = used.get(base) ?? 0
    let key = n === 0 ? base : `${base}${suffix(n)}`
    while (taken.has(key)) key = `${base}${suffix(++n)}`
    used.set(base, n + 1)
    taken.add(key)
    return key
  })
}

/** 1 → "b", 2 → "c", … 25 → "z", 26 → "ba". */
function suffix(n: number): string {
  let out = ''
  let x = n
  do {
    out = String.fromCharCode(97 + (x % 26)) + out
    x = Math.floor(x / 26)
  } while (x > 0)
  return out
}

// ── Language of parts ────────────────────────────────────────────────────

/**
 * `lang` attribute for a piece of entered text inside a page of `pageLang`
 * (WCAG 3.1.2): Chinese text on an English page → "zh-Hans"; Latin-only text
 * on a Chinese page → "en"; otherwise undefined (inherits).
 */
export function textLang(text: string, pageLang: PubLang): string | undefined {
  const s = text || ''
  if (!s.trim()) return undefined
  const han = (s.match(/\p{Script=Han}/gu) || []).length
  const latin = (s.match(/\p{Script=Latin}/gu) || []).length
  if (pageLang === 'en') return han >= 2 && han >= latin / 3 ? 'zh-Hans' : undefined
  return han === 0 && latin >= 2 ? 'en' : undefined
}
