/**
 * Who the home hero introduces — derived from the public CV, not hard-coded.
 *
 * Pure and dependency-light so getServerSideProps can compute it once and
 * ship only the three display strings (never the whole personalInformation
 * section with its phone number / address) to the browser.
 *
 * Rules:
 *   - EN name = "<lastName> <firstName>" (the site's established order,
 *     "Li Yanpei"); 中文 name = lastName + firstName with no space for CJK.
 *   - A field the owner hid (isRedacted) is left out — never replaced by
 *     the literal fallback.
 *   - The literals are used only when the CV genuinely carries no name
 *     (section absent, or both name fields empty and not hidden).
 *   - The 中文 name is dropped when it would repeat the EN name.
 */

import { isRedacted } from '../../lib/cvVisibility'

export const FALLBACK_NAME = 'Li Yanpei'
export const FALLBACK_NAME_ZH = '李彦霈'
export const FALLBACK_NICK = 'Lucian'
/** Same job title the site's Person JSON-LD declares (lib/schema.ts). */
export const FALLBACK_ROLE = 'Software Engineer'

export type HeroIdentity = {
  /** Display name, e.g. "Li Yanpei"; '' when the owner hid it. */
  name: string
  /** 中文 name, e.g. "李彦霈"; '' when hidden, absent or identical to `name`. */
  nameZh: string
  /** Nickname, e.g. "Lucian"; '' when hidden or not set. */
  nick: string
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const CJK = /[㐀-鿿豈-﫿]/

/** lastName + firstName, space-joined unless both halves are CJK. */
export function joinName(last: string, first: string): string {
  const parts = [last, first].filter(Boolean)
  if (parts.length < 2) return parts.join('')
  return CJK.test(last) && CJK.test(first) ? `${last}${first}` : `${last} ${first}`
}

function nameOf(pi: unknown, fallback: string): string {
  if (!isObject(pi)) return fallback
  const lastHidden = isRedacted(pi, 'lastName')
  const firstHidden = isRedacted(pi, 'firstName')
  const joined = joinName(lastHidden ? '' : str(pi.lastName), firstHidden ? '' : str(pi.firstName))
  if (joined) return joined
  return lastHidden || firstHidden ? '' : fallback
}

/**
 * @param enPi public (pruned) EN personalInformation section, if any
 * @param zhPi public (pruned) ZH personalInformation section, if any
 */
export function heroIdentity(enPi: unknown, zhPi: unknown): HeroIdentity {
  const name = nameOf(enPi, FALLBACK_NAME)
  const zh = nameOf(zhPi, FALLBACK_NAME_ZH)
  let nick = FALLBACK_NICK
  if (isObject(enPi)) nick = isRedacted(enPi, 'nickName') ? '' : str(enPi.nickName)
  return {
    name,
    nameZh: zh && zh !== name ? zh : '',
    nick: nick && nick !== name ? nick : '',
  }
}

/** Tagline phrases stored as "A | B | C" in home.hero.tagline. */
export function taglinePhrases(tagline: unknown): string[] {
  return str(tagline)
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * The first tagline phrase is the owner's own role line and becomes part of
 * the h1; the remaining phrases rotate underneath.
 */
export function heroCopy(tagline: unknown): { role: string; rotating: string[] } {
  const phrases = taglinePhrases(tagline)
  return { role: phrases[0] || FALLBACK_ROLE, rotating: phrases.slice(1) }
}

/** Accessible name for the portrait: "Li Yanpei (Lucian)". */
export function portraitAlt(id: HeroIdentity): string {
  const base = id.name || id.nick
  if (!base) return 'Portrait'
  return id.nick && id.name ? `${id.name} (${id.nick})` : base
}
