/**
 * Author names: parsing, the owner's own name (emphasised in every author
 * list), and the APA / BibTeX name forms.
 *
 * The owner's name is never hard-coded. Its variants come from the PUBLIC
 * Personal Info of each CV language (first / last / preferred name, and the
 * Chinese family + given name), so a renamed or hidden name is followed
 * automatically. Recognised forms, for first "Yanpei", last "Li", preferred
 * "Lucian", Chinese 李 + 彦霈:
 *
 *   Yanpei Li · Li, Yanpei · Li Yanpei · Y. Li · Li, Y. · Li Y · Lucian Li ·
 *   YANPEI LI · Yanpei Li* · Yanpei Li¹ · 李彦霈 · 李 彦霈
 *
 * Marks after a name (*, †, ‡, §, ¶, #, superscript digits) are kept for
 * display and ignored for matching; diacritics and case are ignored too.
 */

import { HIDDEN_ITEM_MARK } from '../cvVisibility'

/** One language's name parts, as typed in Personal Info. */
export type NameSource = { firstName?: string; lastName?: string; nickName?: string }

/** Pre-computed owner name forms (plain data — safe to ship as page props). */
export type OwnerNames = {
  /** Latin-script given/family pairs: given names as lowercase tokens, family name lowercase. */
  latin: Array<{ given: string[]; family: string }>
  /** CJK full names without spaces ("李彦霈"). */
  cjk: string[]
}

export const NO_OWNER_NAMES: OwnerNames = { latin: [], cjk: [] }

const HAN_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const TRAILING_MARKS_RE = /[\s*†‡§¶#✉⁎∗\d¹²³⁴⁵⁶⁷⁸⁹⁰,]+$/u

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Strip diacritics, lowercase. */
function fold(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase()
}

/** Split a given-name string into lowercase tokens ("Yan-Pei" → ["yan", "pei"]). */
function tokens(s: string): string[] {
  return fold(s)
    .replace(/[.'’]/g, ' ')
    .split(/[\s\-‐‑–]+/)
    .filter(Boolean)
}

export function hasCjk(s: string): boolean {
  return HAN_RE.test(s)
}

/** The author name without trailing marks ("Yanpei Li*" → "Yanpei Li"). */
export function stripMarks(name: string): string {
  return name.replace(/\([^)]*\)/g, ' ').replace(TRAILING_MARKS_RE, '').replace(/\s+/g, ' ').trim()
}

/** The marks after a name, e.g. "*" or "†" ('' when none). Superscript digits count; plain digits do not. */
export function nameMarks(name: string): string {
  const m = name.trim().match(/[*†‡§¶#✉¹²³⁴⁵⁶⁷⁸⁹⁰]+$/u)
  return m ? m[0] : ''
}

export type ParsedName = {
  /** The name as it should be displayed (marks removed). */
  display: string
  /** Given names (raw case), e.g. ["Yanpei"] or ["Y."]. */
  given: string[]
  /** Family name (raw case), e.g. "Li"; for a single-word or CJK name, the whole name. */
  family: string
  /** True for a name written in CJK script ("李彦霈"). */
  cjk: boolean
  /** True when the name was written "Family, Given". */
  inverted: boolean
}

/**
 * Parse an author name. "Family, Given" is explicit; otherwise the last word
 * is the family name ("Yanpei Li"). CJK names are kept whole. Particles such
 * as "van der" stay with the given names unless the comma form is used — the
 * Studio asks for "Family, Given" when the order is ambiguous.
 */
export function parseName(raw: string): ParsedName {
  const display = stripMarks(raw)
  if (hasCjk(display)) {
    return { display, given: [], family: display.replace(/\s+/g, ''), cjk: true, inverted: false }
  }
  const comma = display.indexOf(',')
  if (comma > 0) {
    const family = display.slice(0, comma).trim()
    const given = display
      .slice(comma + 1)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    return { display, given, family, cjk: false, inverted: true }
  }
  const parts = display.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { display, given: [], family: parts[0] || '', cjk: false, inverted: false }
  return { display, given: parts.slice(0, -1), family: parts[parts.length - 1], cjk: false, inverted: false }
}

/**
 * Owner name forms from the public Personal Info of one or more CV languages
 * (pass the EN and the ZH section). Names hidden by the owner arrive blank
 * and contribute nothing.
 */
export function ownerNamesFrom(sources: ReadonlyArray<NameSource | null | undefined>): OwnerNames {
  const latin: OwnerNames['latin'] = []
  const cjk = new Set<string>()
  const seen = new Set<string>()
  const addLatin = (given: string, family: string) => {
    const g = tokens(given)
    const f = tokens(family).join(' ')
    if (!g.length || !f) return
    const key = `${g.join(' ')}|${f}`
    if (seen.has(key)) return
    seen.add(key)
    latin.push({ given: g, family: f })
  }
  for (const s of sources) {
    if (!s) continue
    const first = str(s.firstName)
    const last = str(s.lastName)
    const nick = str(s.nickName)
    if (first && last && (hasCjk(first) || hasCjk(last))) {
      cjk.add(`${last}${first}`.replace(/\s+/g, ''))
    } else if (last) {
      if (first) addLatin(first, last)
      if (nick && !hasCjk(nick)) addLatin(nick, last)
    }
  }
  // The preferred name with the Latin family name of another language
  // ("Lucian" from the 中文 Personal Info + "Li" from the English one).
  const families = Array.from(new Set(latin.map((n) => n.family)))
  for (const s of sources) {
    const nick = str(s?.nickName)
    if (nick && !hasCjk(nick)) for (const f of families) addLatin(nick, f)
  }
  return { latin, cjk: Array.from(cjk) }
}

/** Extract the name parts from a (public) personalInformation section. Hidden names arrive blank. */
export function nameSourceOf(section: unknown): NameSource | null {
  if (!section || typeof section !== 'object') return null
  const s = section as Record<string, unknown>
  const redacted = new Set(Array.isArray(s.redacted) ? s.redacted : [])
  const hidden = new Set(Array.isArray(s.hiddenFields) ? s.hiddenFields : [])
  const get = (k: string) => (redacted.has(k) || hidden.has(k) ? '' : str(s[k]))
  return { firstName: get('firstName'), lastName: get('lastName'), nickName: get('nickName') }
}

/** Owner names from public CV section lists (any languages): their personalInformation sections. */
export function ownerNamesFromSections(...langs: ReadonlyArray<ReadonlyArray<{ sessionName?: string }> | null | undefined>): OwnerNames {
  return ownerNamesFrom(langs.map((list) => nameSourceOf((list || []).find((s) => s?.sessionName === 'personalInformation'))))
}

/**
 * Given-name tokens of an author as written: "Yanpei" → ["yanpei"],
 * "Y.-P." → ["y", "p"], and — inside a mixed-case name — a run of two or
 * three capitals is a run of initials ("YP Li" → ["y", "p"]).
 */
function givenTokens(parts: readonly string[], mixedCase: boolean): string[] {
  return parts.flatMap((part) => (mixedCase && /^[A-Z]{2,3}$/.test(part) ? part.toLowerCase().split('') : tokens(part)))
}

/** An author's given-name tokens match the owner's given names: in full, or as initials. */
function givenMatches(author: readonly string[], owner: readonly string[]): boolean {
  if (!author.length || !owner.length) return false
  if (author.every((t) => t.length > 1)) return author.join('') === owner.join('')
  if (!author.every((t) => t.length === 1)) return false
  const initials = owner.map((t) => t[0]).join('')
  const typed = author.join('')
  return typed === initials || (author.length === 1 && typed === initials[0])
}

/** True when `name` is one of the owner's names (see the module comment for the recognised forms). */
export function isOwnerName(name: string, owner: OwnerNames): boolean {
  const raw = str(name)
  if (!raw || raw === HIDDEN_ITEM_MARK) return false
  const p = parseName(raw)
  if (p.cjk) return owner.cjk.includes(p.family)
  if (!owner.latin.length || !p.given.length) return false
  const mixedCase = /\p{Ll}/u.test(p.display)
  const family = tokens(p.family).join(' ')
  const given = givenTokens(p.given, mixedCase)
  for (const o of owner.latin) {
    if (family === o.family && givenMatches(given, o.given)) return true
    // Family name first without a comma: "Li Yanpei", "Li Yan Pei", "Li Y", "Li YP".
    if (!p.inverted && tokens(p.given[0]).join(' ') === o.family) {
      const rest = givenTokens([...p.given.slice(1), p.family], mixedCase)
      if (givenMatches(rest, o.given)) return true
    }
  }
  return false
}

// ── Citation name forms ──────────────────────────────────────────────────

/** Initials of given names, APA style: "Yanpei" → "Y.", "Yan-Pei" → "Y.-P.", "Jean Paul" → "J. P.". */
export function initialsOf(given: readonly string[]): string {
  return given
    .map((g) =>
      g
        .split(/([-‐‑])/)
        .map((part) => (/^[-‐‑]$/.test(part) ? '-' : part ? `${Array.from(part.replace(/\./g, ''))[0]?.toUpperCase() || ''}.` : ''))
        .join(''),
    )
    .filter((s) => s && s !== '.')
    .join(' ')
}

/** APA 7 form: "Li, Y." — CJK and single-word names stay as written. */
export function apaName(raw: string): string {
  const p = parseName(raw)
  if (p.cjk || !p.given.length) return p.display
  const initials = initialsOf(p.given)
  return initials ? `${p.family}, ${initials}` : p.family
}

/** BibTeX form: "Li, Yanpei" (family first, so every style splits it right); names holding " and " are braced. */
export function bibtexName(raw: string): string {
  const p = parseName(raw)
  // "and" separates names in BibTeX: a name containing it is kept whole.
  if (/\band\b/i.test(p.display)) return `{${p.display}}`
  if (p.cjk || !p.given.length) {
    const whole = p.display
    return /\s/.test(whole) || /\band\b/i.test(whole) ? `{${whole}}` : whole
  }
  const family = /\band\b/i.test(p.family) || /\s/.test(p.family) ? `{${p.family}}` : p.family
  return `${family}, ${p.given.join(' ')}`
}
