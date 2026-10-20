import { themeColorFor } from '../theme/color'
import { THEME_COLOR_SELECTOR } from '../components/Chrome/themeColor'
import {
  DEFAULT_THEME_PREFERENCE,
  LEGACY_COLOR_MODE_KEY,
  SYSTEM_DARK_QUERY,
  THEME_PREFERENCE_ATTRIBUTE,
  THEME_PREFERENCE_KEY,
  parseThemePreference,
  type ThemePreference,
} from './themePreference'

/*
 * The document's inline pre-paint scripts (pages/_document.tsx renders them
 * in <body> before <Main />). Only the document imports this module, so the
 * strings never ship in the client bundle.
 */

type ReadableStorage = { getItem(key: string): string | null }

/**
 * The stored preference: the `theme-preference` value, else a legacy
 * explicit `light` (Chakra's key; its `dark` was written for every visitor
 * and is no choice), else `fallback`. Storage that throws (blocked, private
 * mode) counts as empty.
 */
export function readStoredPreference(storage: ReadableStorage | null | undefined, fallback: ThemePreference = DEFAULT_THEME_PREFERENCE): ThemePreference {
  try {
    const stored = parseThemePreference(storage?.getItem(THEME_PREFERENCE_KEY))
    if (stored) return stored
    if (storage?.getItem(LEGACY_COLOR_MODE_KEY) === 'light') return 'light'
  } catch {
    // Storage unavailable: the default applies.
  }
  return fallback
}

/**
 * Inline pre-paint script (runs synchronously in <body> before the first
 * paint). Mirrors readStoredPreference + resolveColorMode — kept in step by
 * tests/tokens-theme-b2.test.ts, which runs it against fake documents.
 */
export function themePrepaintScript(fallback: ThemePreference = DEFAULT_THEME_PREFERENCE): string {
  return (
    '(function(){try{' +
    'var d=document.documentElement,p=null,l=null,s;' +
    `try{s=window.localStorage;p=s.getItem('${THEME_PREFERENCE_KEY}');l=s.getItem('${LEGACY_COLOR_MODE_KEY}')}catch(e){}` +
    `if(p!=='system'&&p!=='light'&&p!=='dark')p=l==='light'?'light':'${fallback}';` +
    `var m=p==='system'?(window.matchMedia&&window.matchMedia('${SYSTEM_DARK_QUERY}').matches?'dark':'light'):p;` +
    `d.setAttribute('data-theme',m);d.style.colorScheme=m;d.setAttribute('${THEME_PREFERENCE_ATTRIBUTE}',p);` +
    "var b=document.body;if(b){b.classList.add('chakra-ui-'+m);b.classList.remove(m==='dark'?'chakra-ui-light':'chakra-ui-dark')}" +
    '}catch(e){}})();'
  )
}

export const THEME_PREPAINT_SCRIPT = themePrepaintScript()

/**
 * Points the single `<meta name="theme-color">` at the mode the theme
 * script chose (components/Chrome/themeColor.ts keeps it in step after
 * hydration). Inline, synchronous, before first paint (the CSP allows it
 * by its hash: lib/security/inlineScripts.ts).
 */
export const THEME_COLOR_PREPAINT_SCRIPT =
  `(function(){try{var m=document.querySelector('${THEME_COLOR_SELECTOR}');` +
  `if(m)m.setAttribute('content',document.documentElement.getAttribute('data-theme')==='light'?` +
  `'${themeColorFor('light')}':'${themeColorFor('dark')}')}catch(e){}})();`
