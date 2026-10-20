/**
 * The home document in one language (F3) — pure, client-safe and
 * unit-tested.
 *
 * The owner writes the home page's copy in English and, in the Home
 * editor's Chinese fields, in Chinese. A page ships only its own language:
 *
 *   /     the English copy; every `_zh` field is left out
 *   /zh   the Chinese copy in the English fields' places — the tagline, the
 *         "currently coding" lines, the contact blurb, heading and eyebrow,
 *         the availability label and roles; a field with no Chinese copy is
 *         left empty (the page's built-in Chinese wording or nothing shows,
 *         never the English text, never a translation)
 *
 * Highlights and field-note captions are the owner's lines with a meaning of
 * their own: on /zh each keeps its Chinese words when written, else its
 * English ones, marked `lang: 'en'` by the renderer (LandingContent,
 * lib/homePage).
 */

import type { HomeData } from './homeShape'

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** A copy of `o` without the given keys (undefined → absent, for JSON props). */
function without<T extends object>(o: T, keys: readonly string[]): T {
  const out = { ...o } as Record<string, unknown>
  for (const k of keys) delete out[k]
  return out as T
}

const HERO_ZH = ['tagline_zh']
const CODING_ZH = ['label_zh', 'project_zh', 'note_zh']
const CONTACT_ZH = ['heading_zh', 'blurb_zh', 'eyebrow_zh', 'reasons_zh']
const AVAILABILITY_ZH = ['label_zh', 'roles_zh', 'city_zh', 'workStatus_zh']

/** The English home page's document: the Chinese copy left out (it never ships what it does not show). */
export function englishHome(home: HomeData): HomeData {
  const out: HomeData = { ...home, hero: without(home.hero || ({} as HomeData['hero']), HERO_ZH) }
  if (out.hero.currentlyCoding) out.hero = { ...out.hero, currentlyCoding: without(out.hero.currentlyCoding, CODING_ZH) }
  if (home.contact) out.contact = without(home.contact, CONTACT_ZH)
  if (home.availability) out.availability = without(home.availability, AVAILABILITY_ZH)
  if (Array.isArray(home.highlights)) out.highlights = home.highlights.map((h) => without(h, ['value_zh', 'label_zh']))
  if (Array.isArray(home.photos)) out.photos = home.photos.map((p) => without(p, ['describe_zh']))
  return out
}

/**
 * The Chinese home page's document: the owner's Chinese copy in place of the
 * English one, blanks where none is written (see the module comment).
 * Highlights keep both pairs (the renderer picks); photos are handled with
 * their file facts (lib/homePage).
 */
export function chineseHome(home: HomeData): HomeData {
  const hero = home.hero || ({} as HomeData['hero'])
  const coding = hero.currentlyCoding
  const out: HomeData = {
    ...home,
    hero: {
      ...without(hero, HERO_ZH),
      tagline: text(hero.tagline_zh),
      ...(coding ? { currentlyCoding: { label: text(coding.label_zh), project: text(coding.project_zh), note: text(coding.note_zh) } } : {}),
    },
  }
  if (home.contact) {
    const c = home.contact
    out.contact = {
      ...without(c, [...CONTACT_ZH, 'heading', 'blurb', 'eyebrow']),
      heading: text(c.heading_zh),
      blurb: text(c.blurb_zh),
      eyebrow: text(c.eyebrow_zh),
    }
  }
  if (home.availability) {
    const a = home.availability
    const rolesZh = Array.isArray(a.roles_zh) ? a.roles_zh.map(text).filter(Boolean) : []
    // The hero's line: the Chinese label, else the status in the page's words (the renderer's default).
    out.availability = { ...a, label: text(a.label_zh) || undefined, roles: rolesZh.length ? rolesZh : a.roles }
    if (!out.availability.label) delete out.availability.label
  }
  return out
}

/** A highlight as the Chinese page shows it: its Chinese pair, else its English words marked English. */
export function zhHighlight<T extends { value: string; label: string; value_zh?: string; label_zh?: string }>(h: T): T & { lang?: string } {
  const value = text(h.value_zh)
  const label = text(h.label_zh)
  return value && label ? { ...h, value, label } : { ...h, lang: 'en' }
}

/** A field-note caption on the Chinese page: the Chinese one, else the English one marked English. */
export function zhCaption(photo: { describe?: string; describe_zh?: string }): { describe?: string; lang?: string } {
  const zh = text(photo.describe_zh)
  if (zh) return { describe: zh }
  const en = text(photo.describe)
  return en ? { describe: en, lang: 'en' } : {}
}

/**
 * The Chinese home page's meta description, from the owner's own Chinese
 * tagline (never translated): "李彦霈（Lucian）：全栈工程师 · …".
 */
export function zhHomeDescription(nameZh: string, taglineZh: string): string {
  const phrases = text(taglineZh)
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean)
  const who = nameZh ? `${nameZh}（Lucian）` : 'Li Yanpei（Lucian）'
  return phrases.length ? `${who}：${phrases.join('，')}。` : who
}
