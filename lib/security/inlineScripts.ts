import { createHash } from 'crypto'
import { TAG_PREPAINT_SCRIPT } from '../tagFilter'
import { THEME_COLOR_PREPAINT_SCRIPT, THEME_PREPAINT_SCRIPT } from '../themePrepaint'
import { TRUSTED_TYPES_DEFAULT_POLICY_SCRIPT } from '../trustedTypesDefault'
import { VIEW_TRANSITION_GUARD_SCRIPT } from '../viewTransitionGuard'

/**
 * Every inline (executable) script the app renders — the only inline code
 * the CSP lets run (lib/csp.js: `script-src 'self' <these hashes>`, no
 * 'unsafe-inline'). Server-only: the proxy imports this module, pages import
 * the script constants themselves, so neither the list nor node:crypto
 * reaches the client bundle.
 *
 * The hashes are computed here, at start-up, from the same exported
 * constants the pages render — a script and its hash cannot drift apart.
 * Adding an inline script anywhere means adding it here (a test scans the
 * pages and components for `<script dangerouslySetInnerHTML>` and fails on
 * any source not listed, and the E2E suite checks every inline script of
 * the rendered pages against the CSP the server sent with them).
 *
 * The constants are build-time values (NEXT_PUBLIC_DEFAULT_THEME is inlined
 * into both the proxy and the page bundles), so a static page rendered at
 * build time and the proxy that serves it agree.
 */

export type InlineScript = {
  /** Stable name (tests, docs). */
  id: string
  /** The exact text between <script> and </script>. */
  source: string
  /** Where it is rendered. */
  renderedBy: string
}

export const INLINE_SCRIPTS: readonly InlineScript[] = [
  { id: 'trusted-types-default-policy', source: TRUSTED_TYPES_DEFAULT_POLICY_SCRIPT, renderedBy: 'pages/_document.tsx' },
  { id: 'theme-prepaint', source: THEME_PREPAINT_SCRIPT, renderedBy: 'pages/_document.tsx' },
  { id: 'theme-color-prepaint', source: THEME_COLOR_PREPAINT_SCRIPT, renderedBy: 'pages/_document.tsx' },
  { id: 'tag-prepaint', source: TAG_PREPAINT_SCRIPT, renderedBy: 'components/Article/TagFilter.tsx' },
  { id: 'view-transition-guard', source: VIEW_TRANSITION_GUARD_SCRIPT, renderedBy: 'pages/_document.tsx' },
]

/** CSP hash source of a script: `'sha256-<base64 of SHA-256 over its UTF-8 text>'`. */
export function cspScriptHash(source: string): string {
  return `'sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}'`
}

/** The hash sources of INLINE_SCRIPTS, in order (computed once per process). */
export const INLINE_SCRIPT_HASHES: readonly string[] = INLINE_SCRIPTS.map((s) => cspScriptHash(s.source))
