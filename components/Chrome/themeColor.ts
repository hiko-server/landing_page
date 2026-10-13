import { themeColorFor } from '../../theme/color'

/**
 * `<meta name="theme-color">` (mobile address bar, PWA title bar) follows the
 * colour mode that is actually on screen: `data-theme` on <html>.
 *
 * The site is dark-first and ignores prefers-color-scheme (theme/chakra.js),
 * so a `media="(prefers-color-scheme: …)"` pair would paint the wrong colour
 * for a first-time visitor on a light system. Instead there is ONE tag:
 *   - pages/_document.tsx renders it with the dark default (what every
 *     first-time visitor gets);
 *   - THEME_COLOR_PREPAINT_SCRIPT runs right after Chakra's ColorModeScript
 *     (which sets data-theme from the stored choice) and corrects it before
 *     the first paint, so a returning light-mode visitor never sees a dark bar;
 *   - after hydration syncThemeColorMeta keeps it in step with data-theme,
 *     which the theme toggle rewrites.
 * The tag is not managed by next/head, so hydration can never re-apply the
 * server value on top of the visitor's mode.
 */

export const THEME_COLOR_SELECTOR = 'meta[name="theme-color"]'

/** The mode `data-theme` names; anything else is the dark default. */
export function modeOfDataTheme(value: string | null | undefined): 'light' | 'dark' {
  return value === 'light' ? 'light' : 'dark'
}

type DocLike = {
  documentElement: { getAttribute(name: string): string | null }
  querySelector(selector: string): { setAttribute(name: string, value: string): void } | null
}

/** Point the theme-color tag at the colour of the mode on screen. */
export function applyThemeColor(doc: DocLike): void {
  const meta = doc.querySelector(THEME_COLOR_SELECTOR)
  if (meta) meta.setAttribute('content', themeColorFor(modeOfDataTheme(doc.documentElement.getAttribute('data-theme'))))
}

type ObserverLike = { observe(target: unknown, options: { attributes: boolean; attributeFilter: string[] }): void; disconnect(): void }
type ObserverCtor = new (callback: () => void) => ObserverLike

/** Apply now and on every `data-theme` change; returns the cleanup. */
export function syncThemeColorMeta(doc: DocLike, Observer: ObserverCtor): () => void {
  applyThemeColor(doc)
  const observer = new Observer(() => applyThemeColor(doc))
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

/** Inline, synchronous, before first paint (CSP allows inline scripts: lib/csp.js). */
export const THEME_COLOR_PREPAINT_SCRIPT =
  `(function(){try{var m=document.querySelector('${THEME_COLOR_SELECTOR}');` +
  `if(m)m.setAttribute('content',document.documentElement.getAttribute('data-theme')==='light'?` +
  `'${themeColorFor('light')}':'${themeColorFor('dark')}')}catch(e){}})();`
