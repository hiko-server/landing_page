/**
 * The site's interface words in English and Chinese — the single source of
 * UI strings (F1). A typed dictionary, not an i18n framework: nothing is
 * loaded at runtime, there is no locale routing and no message syntax.
 *
 * Every word lives in this directory, one module per part of the
 * interface, so a page bundles only the tables it uses (webpack keeps a
 * module's used exports wherever the module goes, so the split is by file):
 *
 *   ./article     ARTICLE_UI — the page around a post or case study: back
 *                 links, eyebrow, meta labels, outline and progress, "At a
 *                 glance", author card, share row, prev / next, related;
 *   ./content     CONTENT_UI — the pieces inside an article body that run
 *                 in the browser: code-copy button, image zoom and viewer,
 *                 video facade (in English on /now, /uses and the about bio);
 *   ./compile     COMPILE_UI — words the MDX compiler writes into the tree
 *                 on the server: callout titles, footnotes, heading
 *                 self-links;
 *   ./lists       LIST_UI — the blog and work indexes and the project
 *                 archive (F3), and the index line of a piece with
 *                 translations;
 *   ./languages   LANGUAGE_AUTONYMS / READ_IN — language names and "Read in
 *                 …" links, each written in the language it names (they
 *                 never follow the page).
 *
 * The bilingual site (F3) adds its modules the same way:
 *
 *   ./chrome      CHROME_UI — header, footer, skip link, theme control
 *                 (English in ./chrome-en, the only table the shared bundle
 *                 holds; a Chinese page receives its words as props);
 *   ./menu        MENU_UI — the mobile menu, theme menu, back-to-top and
 *                 the "G then …" hint (lazy chunks only);
 *   ./palette     PALETTE_UI — the command palette (its own chunk);
 *   ./notFound    NOT_FOUND_UI — the 404 page;
 *   ./home, ./about, ./contact   the home, about and contact pages (with
 *                 ./github-en and ./askEntry), shipped as page props in the
 *                 page's language;
 *   ./cv, ./cvFields   the CV page's controls; the certificate and meta
 *                 description words of the CV helpers.
 *
 * Each is a `UiTable` of its own strings type:
 *
 *   - every table holds every interface language (`UiTable<T>`): a key added
 *     to one language and not the others fails the type check;
 *   - entries are plain strings, `{name}` marking a value (fillUi), so a
 *     page can receive just its own language's words as props — the
 *     article pages do (lib/uiStrings/article articleUiFor);
 *   - pick a table's words with `uiText(TABLE, lang)` for any BCP-47 page
 *     language: Chinese pages get Simplified or Traditional Chinese, every
 *     other language English. Inside an article, components deep in the body
 *     read the language from context (components/Common/uiLang.ts).
 *
 * Only interface words live here — never owner content. Pure and
 * client-safe.
 */

/** Interface languages, English first (the site's language). */
export const UI_LANGS = ['en', 'zh-Hans', 'zh-Hant'] as const
export type UiLang = (typeof UI_LANGS)[number]

/** One table of the dictionary: the same keys in every interface language. */
export type UiTable<T> = Readonly<Record<UiLang, T>>

const HANT_RE = /^zh-(hant|tw|hk|mo)(-|$)/

/** The interface language for a page language: Chinese pages get Chinese words, every other page English. */
export function uiLangOf(lang: string | undefined | null): UiLang {
  const l = (lang || '').trim().toLowerCase().replace(/_/g, '-')
  if (l === 'zh' || l.startsWith('zh-')) return HANT_RE.test(l) ? 'zh-Hant' : 'zh-Hans'
  return 'en'
}

/** The words of `table` for a page language (any BCP-47 tag). */
export function uiText<T>(table: UiTable<T>, lang: string | undefined | null): T {
  return table[uiLangOf(lang)]
}

/**
 * `lang` attribute for interface words inside an element in `pageLang`:
 * undefined when the words are in the page's language already (English on
 * an English page, Chinese on a Chinese one), else 'en' — the English
 * labels of a Japanese or Korean article.
 */
export function uiLangAttr(pageLang: string | undefined | null): string | undefined {
  if (uiLangOf(pageLang) !== 'en') return undefined
  const page = (pageLang || 'en').trim().toLowerCase()
  return page === 'en' || page.startsWith('en-') ? undefined : 'en'
}

/**
 * A dictionary string with its `{name}` placeholders filled in
 * (`fillUi('{n} min', { n: 6 })` → "6 min"). The tables hold plain strings,
 * so a page can receive its words as JSON props; a placeholder without a
 * value stays as written.
 */
export function fillUi(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole))
}
