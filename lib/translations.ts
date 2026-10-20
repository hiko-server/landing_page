import { absUrl, type Alternate } from './schema'
import { LANGUAGE_AUTONYMS, READ_IN } from './uiStrings/languages'

/**
 * Linked translations of posts and case studies (F2).
 *
 * Versions of one piece in different languages share a `translationKey`
 * in their frontmatter (Hugo's convention): `translationKey: carboy` on
 * work/project-carboy (中文) and on work/carboy-en (English) makes them
 * one piece. Within a collection, the published items with the same key
 * form a translation group when every item is in a different language; a
 * group with two items in one language is ambiguous and links nothing (the
 * admin flags it). Links are therefore always reciprocal — each version
 * lists every other one — which is what hreflang requires.
 *
 * Used by the article pages (the language switch, hreflang alternates,
 * prev/next and related links), the indexes (one entry per piece, in the
 * page's language), the sitemap (xhtml:link alternates), the Markdown twins
 * and llms.txt, and the admin's translation field. Pure and client-safe.
 */

/** A translation key: like a slug (a–z, 0–9, - and _), at most 64 characters. */
export const TRANSLATION_KEY_RE = /^[a-z0-9][a-z0-9-_]{0,63}$/

/** The stored key in its canonical form ('' when missing or malformed). */
export function normalizeTranslationKey(value: unknown): string {
  if (typeof value !== 'string') return ''
  const key = value.trim().toLowerCase()
  return TRANSLATION_KEY_RE.test(key) ? key : ''
}

/**
 * The language a version counts as: 'en', 'zh-Hans', 'zh-Hant', else the
 * primary subtag ('ja', 'ko'). Regional English variants are one language,
 * Simplified and Traditional Chinese are two.
 */
export function translationLang(lang: unknown): string {
  const l = typeof lang === 'string' ? lang.trim().toLowerCase().replace(/_/g, '-') : ''
  if (!l) return 'en'
  if (l === 'zh' || l.startsWith('zh-')) {
    return /^zh-(hant|tw|hk|mo)(-|$)/.test(l) ? 'zh-Hant' : 'zh-Hans'
  }
  return l.split('-')[0] || 'en'
}

const LANG_ORDER = ['en', 'zh-Hans', 'zh-Hant']

function langRank(lang: string): number {
  const i = LANG_ORDER.indexOf(translationLang(lang))
  return i < 0 ? LANG_ORDER.length : i
}

/** Sort by language: English, Simplified Chinese, Traditional Chinese, then the rest alphabetically. */
export function byLanguage<T extends { lang: string }>(a: T, b: T): number {
  return langRank(a.lang) - langRank(b.lang) || translationLang(a.lang).localeCompare(translationLang(b.lang))
}

/** "English", "简体中文", …; the tag itself for a language without a name (lib/uiStrings/languages). */
export function languageAutonym(lang: string): string {
  const key = translationLang(lang)
  return LANGUAGE_AUTONYMS[key] || key
}

/**
 * The sentence of a page's single-language switch, in the language it leads
 * to ("Read in English", "阅读中文版" — lib/uiStrings/languages).
 */
export function readInLabel(lang: string): string {
  return READ_IN[translationLang(lang)] || languageAutonym(lang)
}

/** The hreflang value of a version ('en', 'zh-Hans', 'zh-Hant', 'ja', …). */
export function hreflangOf(lang: string): string {
  return translationLang(lang)
}

/** What the resolver needs of a post or case study (lib/mdx index entries fit). */
export type TranslatableEntry = {
  slug: string
  permalink: string
  lang: string
  frontmatter: { title?: unknown; translationKey?: unknown; draft?: unknown }
}

/** Another language version of the current piece. */
export type TranslationLink = {
  slug: string
  permalink: string
  /** BCP-47 language of that version ('en', 'zh-Hans'). */
  lang: string
  title: string
}

/**
 * A link of an article's language switch with its words worked out on the
 * server — the language's own name and "Read in …" sentence, the hreflang —
 * so the page's JavaScript carries no language tables.
 */
export type SwitchLink = TranslationLink & {
  hreflang: string
  /** "English", "简体中文" (lib/uiStrings/languages). */
  name: string
  /** "Read in English", "阅读中文版". */
  readIn: string
}

export function switchLinks(translations: readonly TranslationLink[]): SwitchLink[] {
  return translations.map((t) => ({ ...t, hreflang: hreflangOf(t.lang), name: languageAutonym(t.lang), readIn: readInLabel(t.lang) }))
}

/** A language a listed piece is also published in, named in itself ("Also in 简体中文" on the indexes). */
export type AlsoIn = { lang: string; name: string }

export function alsoInOf(translations: readonly TranslationLink[]): AlsoIn[] {
  return translations.map((t) => ({ lang: t.lang, name: languageAutonym(t.lang) }))
}

export type TranslationGroups = ReadonlyMap<string, readonly TranslationLink[]>

function linkOf(e: TranslatableEntry): TranslationLink {
  const title = typeof e.frontmatter.title === 'string' && e.frontmatter.title.trim() ? e.frontmatter.title.trim() : e.slug
  return { slug: e.slug, permalink: e.permalink, lang: e.lang, title }
}

/** The members of each key in `entries` (one collection), in entry order. */
export function groupByKey<T extends TranslatableEntry>(entries: readonly T[]): Map<string, T[]> {
  const byKey = new Map<string, T[]>()
  for (const e of entries) {
    const key = normalizeTranslationKey(e.frontmatter.translationKey)
    if (!key) continue
    const list = byKey.get(key)
    if (list) list.push(e)
    else byKey.set(key, [e])
  }
  return byKey
}

/** True when no two members of a group are in the same language. */
export function languagesDistinct(members: ReadonlyArray<{ lang: string }>): boolean {
  const seen = new Set<string>()
  for (const m of members) {
    const l = translationLang(m.lang)
    if (seen.has(l)) return false
    seen.add(l)
  }
  return true
}

/**
 * slug → the other language versions of that item, for every item of
 * `entries` (one collection; pass only what may be linked — the published
 * list, or drafts too in Draft Mode) that is part of a valid group. Items
 * without a key, alone with their key, or in an ambiguous group are absent.
 */
export function translationGroups(entries: readonly TranslatableEntry[]): Map<string, TranslationLink[]> {
  const out = new Map<string, TranslationLink[]>()
  for (const members of groupByKey(entries).values()) {
    if (members.length < 2 || !languagesDistinct(members)) continue
    const links = members.map(linkOf)
    for (const m of members) {
      out.set(
        m.slug,
        links.filter((l) => l.slug !== m.slug).sort(byLanguage),
      )
    }
  }
  return out
}

/**
 * hreflang alternates of a page and its translations: every version
 * (English first) plus x-default — the English version, else the page
 * itself. Empty without translations (a page alone needs none).
 */
export function hreflangAlternates(self: Pick<TranslationLink, 'permalink' | 'lang'>, translations: readonly TranslationLink[]): Alternate[] {
  if (!translations.length) return []
  const all = [{ permalink: self.permalink, lang: self.lang }, ...translations].sort(byLanguage)
  const out: Alternate[] = all.map((v) => ({ hrefLang: hreflangOf(v.lang), href: absUrl(v.permalink) }))
  const fallback = all.find((v) => translationLang(v.lang) === 'en') || self
  out.push({ hrefLang: 'x-default', href: absUrl(fallback.permalink) })
  return out
}

export type CollapsedEntry<T> = {
  entry: T
  /** The piece's versions in other languages (not listed separately). */
  alsoIn: TranslationLink[]
}

/**
 * One entry per piece, keeping `entries`' order: of a translation group,
 * only the version in `preferLang` stays (else the English one, else the
 * first listed), carrying the others in `alsoIn`. Items outside a group
 * pass through. Used by the indexes (/blog, /work, the home page's latest
 * writing — English, the site's language) and by an article's prev/next
 * and related links (the article's own language).
 */
export function collapseTranslations<T extends TranslatableEntry>(
  entries: readonly T[],
  preferLang: string,
  groups: TranslationGroups = translationGroups(entries),
): CollapsedEntry<T>[] {
  const want = translationLang(preferLang)
  const present = new Map(entries.map((e) => [e.slug, e]))
  const out: CollapsedEntry<T>[] = []
  for (const e of entries) {
    const others = groups.get(e.slug)
    if (!others || !others.length) {
      out.push({ entry: e, alsoIn: [] })
      continue
    }
    const members = [e, ...others.map((o) => present.get(o.slug)).filter((x): x is T => !!x)]
    const chosen =
      members.find((m) => translationLang(m.lang) === want) ||
      members.find((m) => translationLang(m.lang) === 'en') ||
      entries.find((x) => members.includes(x)) ||
      e
    if (chosen !== e) continue
    out.push({ entry: e, alsoIn: [...others] })
  }
  return out
}

/**
 * The version of `slug`'s piece that a collapsed list kept: `slug` itself
 * when it is in `kept`, else the translation that is, else `slug`. Lets a
 * post's `project` (a case-study slug) point at the case study in the
 * reader's language.
 */
export function keptVersion(slug: string, groups: TranslationGroups, kept: ReadonlySet<string>): string {
  if (kept.has(slug)) return slug
  for (const t of groups.get(slug) || []) if (kept.has(t.slug)) return t.slug
  return slug
}

/** Every slug of `slug`'s piece: itself and its translations. */
export function pieceSlugs(slug: string, groups: TranslationGroups): string[] {
  return [slug, ...(groups.get(slug) || []).map((t) => t.slug)]
}

// ── Admin: the translation block of the post and case-study editors ──────

/** An item of the collection as the admin lists it (lib/mdx-admin listAll). */
export type AdminTranslatable = {
  slug: string
  /** BCP-47 language of the item (frontmatter `lang`, else detected). */
  lang: string
  title: string
  draft: boolean
  translationKey: string
}

export type TranslationMember = AdminTranslatable & {
  /** In the same language as the item being edited: the group links nothing. */
  sameLanguage: boolean
}

export type TranslationStatus = {
  /** The key in its canonical form ('' when empty or malformed). */
  key: string
  /** The typed key is not a valid key (a–z, 0–9, - and _, at most 64). */
  invalid: boolean
  /** The other items with this key, by language. */
  members: TranslationMember[]
  /** Two versions share a language: no version of the group is linked. */
  ambiguous: boolean
  /** Languages (translationLang) the group has, this item included. */
  languages: string[]
}

/**
 * What the editor shows under the translation key: the other versions with
 * the same key and whether the group can link (every version in its own
 * language). Drafts count — the owner prepares a translation as a draft —
 * but are flagged, since the site links published versions only.
 */
export function translationStatus(self: Pick<AdminTranslatable, 'slug' | 'lang'> & { translationKey: string }, items: readonly AdminTranslatable[]): TranslationStatus {
  const typed = self.translationKey.trim()
  const key = normalizeTranslationKey(typed)
  if (!key) return { key: '', invalid: typed !== '', members: [], ambiguous: false, languages: [] }
  const own = translationLang(self.lang)
  const others = items.filter((i) => i.slug !== self.slug && normalizeTranslationKey(i.translationKey) === key)
  const members = others.map((m) => ({ ...m, sameLanguage: translationLang(m.lang) === own })).sort(byLanguage)
  const ambiguous = !languagesDistinct([{ lang: self.lang }, ...others])
  const languages = Array.from(new Set([own, ...others.map((m) => translationLang(m.lang))]))
  return { key, invalid: false, members, ambiguous, languages }
}

/** What the owner types into the key field, kept to a valid key: lower case, spaces as hyphens, a–z 0–9 - _ only, 64 at most. */
export function cleanTranslationKeyInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/^[-_]+/, '')
    .slice(0, 64)
}

/** The slug suggested for a new version of `slug` in `lang`: "carboy" → "carboy-zh" / "carboy-en". */
export function translationSlug(slug: string, lang: string): string {
  const base = slug.replace(/-(en|zh|zh-hans|zh-hant|ja|ko)$/, '') || slug
  const l = translationLang(lang)
  const suffix = l === 'zh-Hans' ? 'zh' : l.toLowerCase()
  return `${base.slice(0, 63 - suffix.length).replace(/-+$/, '')}-${suffix}`
}
