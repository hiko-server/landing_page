/**
 * The page's Trusted Types `default` policy, as an inline script
 * (pages/_document.tsx renders it first in <body>, before any Next.js
 * script; lib/security/inlineScripts.ts hashes it for the CSP).
 *
 * Trusted Types run report-only (lib/csp.js buildReportOnlyCsp): a string
 * that reaches a DOM-XSS sink (innerHTML, a script's text or src,
 * DOMParser …) is reported to the Errors panel and nothing is blocked.
 * Without a default policy every page view would report the same harmless
 * framework writes dozens of times — Next.js's page loader sets each
 * prefetched chunk's `script.src` from a plain string, `next/head` writes
 * the JSON-LD and font-face blocks with innerHTML, React creates script
 * elements through `innerHTML = "<script></script>"` — burying the sinks
 * worth fixing under noise and making every visitor upload kilobytes of
 * reports. The default policy approves exactly those safe shapes, so what
 * is still reported is real work before Trusted Types can be enforced:
 *
 *   - createHTML: text without `<`. Such a string cannot create an element
 *     (it parses to a single text node, entities included), so as markup
 *     it is as safe as textContent. The same text between Cloudflare's
 *     `<!--email_off-->` markers (components/Common/EmailText.tsx: comments
 *     and text only). React's inert, empty `<script></script>` (a script
 *     created by innerHTML never runs).
 *   - createScript: JSON. Every JSON text is a side-effect-free JavaScript
 *     expression (the JSON-LD blocks next/head writes into script.text).
 *   - createScriptURL: this origin's /_next/static/ files — the build's own
 *     chunks, which script-src 'self' allows anyway.
 * Anything else returns null: reported now, refused once enforced.
 *
 * The browser calls a default policy only for a plain string at a sink, so
 * values from the 'nextjs' and 'nextjs#bundler' policies never reach it.
 * Plain ES5, no `<` in the source (it is HTML-inlined), and harmless where
 * Trusted Types are unsupported (no `window.trustedTypes`: nothing to do) or
 * already have a default policy (createPolicy throws: caught).
 */

/** Policy name (also listed in the report-only `trusted-types` directive). */
export const TRUSTED_TYPES_DEFAULT_POLICY = 'default'

export const TRUSTED_TYPES_DEFAULT_POLICY_SCRIPT =
  '(function(){var t=window.trustedTypes;if(!t||!t.createPolicy)return;try{var o=location.origin;' +
  `t.createPolicy('${TRUSTED_TYPES_DEFAULT_POLICY}',{` +
  "createHTML:function(s){s=String(s);var b=s.replace(/^\\x3c!--email_off-->([^\\x3c]*)\\x3c!--\\/email_off-->$/,'$1');" +
  "return b.indexOf('\\x3c')===-1||s==='\\x3cscript>\\x3c/script>'?s:null}," +
  'createScript:function(s){try{JSON.parse(s);return String(s)}catch(e){return null}},' +
  "createScriptURL:function(s){try{var u=new URL(s,document.baseURI);return u.origin===o&&u.pathname.indexOf('/_next/static/')===0?String(s):null}catch(e){return null}}" +
  '})}catch(e){}})();'
