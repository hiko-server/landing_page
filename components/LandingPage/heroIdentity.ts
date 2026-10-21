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
 *   - A Personal Info section that exists in the stored CV but is switched
 *     off the website (so the public view has none) contributes nothing —
 *     it is not treated as "no CV". getServerSideProps tells heroIdentity
 *     whether the stored CV has the section at all (`storedHasPersonalInfo`).
 *   - The literals are used only when the CV genuinely carries no name: the
 *     stored CV has no Personal Info section at all, or the section's name
 *     fields are empty and not hidden. The 中文 / nickname literals are never
 *     used when the owner hid the EN name, so a hidden name cannot reappear
 *     through another language.
 *   - The 中文 name is dropped when it would repeat the EN name.
 */

import { isRedacted, isSectionOnWebsite } from '../../lib/cvVisibilityRead'
import { bullets, field } from '../CVViewerPage/fields'

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

export type HeroIdentityOptions = {
  /**
   * Whether the STORED CV (before visibility pruning) has a Personal Info
   * section in any language. Defaults to "a public section was passed", so
   * callers without that knowledge keep the old behaviour.
   */
  storedHasPersonalInfo?: boolean
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const CJK = /[㐀-鿿豈-﫿]/

/** lastName + firstName, space-joined unless both halves are CJK. */
export function joinName(last: string, first: string): string {
  const parts = [last, first].filter(Boolean)
  if (parts.length < 2) return parts.join('')
  return CJK.test(last) && CJK.test(first) ? `${last}${first}` : `${last} ${first}`
}

type NameRead = { name: string; hidden: boolean; blank: boolean }

/** The section's name, whether any name part is hidden, and whether it is genuinely blank. */
function readName(pi: Record<string, any>): NameRead {
  const lastHidden = isRedacted(pi, 'lastName')
  const firstHidden = isRedacted(pi, 'firstName')
  const name = joinName(lastHidden ? '' : str(pi.lastName), firstHidden ? '' : str(pi.firstName))
  const hidden = lastHidden || firstHidden
  return { name, hidden, blank: !name && !hidden }
}

/**
 * @param enPi public (pruned) EN personalInformation section, if any
 * @param zhPi public (pruned) ZH personalInformation section, if any
 */
export function heroIdentity(enPi: unknown, zhPi: unknown, opts: HeroIdentityOptions = {}): HeroIdentity {
  const stored = opts.storedHasPersonalInfo ?? (isObject(enPi) || isObject(zhPi))
  if (!stored) return { name: FALLBACK_NAME, nameZh: FALLBACK_NAME_ZH, nick: FALLBACK_NICK }

  const en = isObject(enPi) ? readName(enPi) : null
  const zh = isObject(zhPi) ? readName(zhPi) : null
  // The owner hid (part of) the EN name: no literal may stand in for it anywhere.
  const enHidden = !!en?.hidden

  const name = en ? (en.blank ? FALLBACK_NAME : en.name) : ''
  const nameZh = zh ? (zh.blank && !enHidden ? FALLBACK_NAME_ZH : zh.name) : ''
  const nick = isObject(enPi) && !isRedacted(enPi, 'nickName') ? str(enPi.nickName) : ''
  return {
    name,
    nameZh: nameZh && nameZh !== name ? nameZh : '',
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

/**
 * Accessible name for the portrait: "Li Yanpei (Lucian)"; on a Chinese page
 * (`zh`, F3) "李彦霈（Li Yanpei）" when the CV shows the Chinese name.
 */
export function portraitAlt(id: HeroIdentity, zh = false): string {
  if (zh && id.nameZh) return id.name ? `${id.nameZh}（${id.name}）` : id.nameZh
  const base = id.name || id.nick || id.nameZh
  if (!base) return 'Portrait'
  return id.nick && id.name ? `${id.name} (${id.nick})` : base
}

/**
 * The hero's meta line, from the public (website) CV — never hard-coded:
 *
 *   location   Personal Info `address`, as the owner wrote it
 *   languages  the language section (`extraSkill.points`, "Languages" in the
 *              CV editor): the name of each "Mandarin: Native" point, in the
 *              CV's order, joined with " · "
 *
 * Hidden fields, bullets and website-hidden sections contribute nothing; an
 * empty string means the item is not shown. Only these strings are shipped
 * to the browser, never the sections themselves.
 */
export type HeroMeta = { location: string; languages: string }

/** "Label: detail" / "标签：细节" point → its label. */
const POINT_LABEL = /^([^:：]{1,40})[:：]\s*\S/
/** A plain point (no "label: detail") up to this length is a name on its own. */
const MAX_PLAIN_NAME = 40

/** Language names of the language section's points, in CV order, without repeats. */
export function languageNames(points: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const point of points) {
    const name = (POINT_LABEL.exec(point)?.[1] ?? (point.length <= MAX_PLAIN_NAME ? point : '')).trim()
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push(name)
  }
  return out
}

/** @param enSections public (pruned) EN CV sections — at least personalInformation and extraSkill */
export function heroMeta(enSections: ReadonlyArray<{ sessionName?: string }> | null | undefined): HeroMeta {
  const sections = Array.isArray(enSections) ? enSections : []
  const find = (name: string) => sections.find((s) => s?.sessionName === name && isSectionOnWebsite(s))
  return {
    location: field(find('personalInformation'), 'address'),
    languages: languageNames(bullets(find('extraSkill'), 'points')).join(' · '),
  }
}
