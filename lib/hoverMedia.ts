import createCache, { type EmotionCache } from '@emotion/cache'

/**
 * Hover styles only where a pointer can hover.
 *
 * On a touch screen the browser keeps `:hover` on the last tapped element
 * until the next tap elsewhere, so a tapped button or card kept its hover
 * look ("sticky hover"). Every Chakra / Emotion rule whose selector involves
 * `:hover` (`_hover`, `_groupHover`, `&:hover …`) is moved into
 * `@media (hover:hover)`; rules already inside such a query are left alone.
 * The site's static CSS follows the same rule by hand (styles/globals.css).
 * Press feedback on touch screens comes from :active.
 *
 * It works on Emotion's output — the CSS text of each rule, after Emotion's
 * own vendor prefixing — rather than as a stylis plugin: a plugin replaces
 * Emotion's built-in prefixer and would have to import stylis itself, which
 * splits stylis out of Emotion's bundle (≈2.5 kB more shared JS). The same
 * text goes into the server render and into the browser's sheets, so class
 * names and CSS match on both sides (no hydration mismatch).
 */

export const HOVER_MEDIA = '@media (hover:hover)'

const HOVER_SELECTOR = /:hover\b/
const HOVER_QUERY = /\(\s*hover\s*:\s*hover\s*\)/
/** Conditional group rules whose inner rules are guarded too. */
const GROUP_RULE = /^@(media|supports|container|layer)\b/

/** Index of the `{` or `}` at or after `from` that is not inside a quoted string; -1 when none. */
function nextBrace(css: string, from: number): number {
  let quote = ''
  for (let i = from; i < css.length; i++) {
    const c = css[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '{' || c === '}') return i
  }
  return -1
}

/** Index of the `}` closing the block opened at `open`; css.length when unbalanced. */
function closingBrace(css: string, open: number): number {
  let depth = 0
  for (let i = open; i < css.length; ) {
    const at = nextBrace(css, i)
    if (at === -1) return css.length
    depth += css[at] === '{' ? 1 : -1
    if (depth === 0) return at
    i = at + 1
  }
  return css.length
}

/**
 * Wraps every rule of `css` (Emotion / stylis output: rules and at-rules,
 * no comments) whose selector involves :hover in `@media (hover:hover)`.
 * Inside @media / @supports / @container / @layer it recurses; inside a
 * (hover: hover) query, @keyframes, @font-face and the like nothing changes.
 */
export function guardHover(css: string): string {
  if (!HOVER_SELECTOR.test(css)) return css
  let out = ''
  let i = 0
  while (i < css.length) {
    const open = nextBrace(css, i)
    if (open === -1 || css[open] === '}') {
      out += css.slice(i)
      break
    }
    const close = closingBrace(css, open)
    const prelude = css.slice(i, open)
    const block = css.slice(i, close + 1)
    const head = prelude.trim()
    if (head.startsWith('@')) {
      out += GROUP_RULE.test(head) && !HOVER_QUERY.test(head) ? `${prelude}{${guardHover(css.slice(open + 1, close))}}` : block
    } else if (HOVER_SELECTOR.test(prelude)) {
      out += `${HOVER_MEDIA}{${block}}`
    } else {
      out += block
    }
    i = close + 1
  }
  return out
}

type SheetLike = { insert(rule: string): void }

/**
 * The Emotion cache of the whole site: Emotion's defaults (key `css`, its
 * own vendor prefixing) with every rule passed through guardHover — the
 * string Emotion returns in a server render, and each rule it inserts into a
 * sheet in the browser (the cache's own and those of <Global> styles).
 */
export function createSiteEmotionCache(): EmotionCache {
  const cache = createCache({ key: 'css' })
  const insert = cache.insert.bind(cache)
  const guarded = new WeakSet<object>()
  cache.insert = (selector, serialized, sheet, shouldCache) => {
    const target = sheet as unknown as SheetLike | undefined
    if (target && typeof target.insert === 'function' && !guarded.has(target)) {
      guarded.add(target)
      const insertRule = target.insert.bind(target)
      target.insert = (rule: string) => insertRule(guardHover(rule))
    }
    const rules = insert(selector, serialized, sheet, shouldCache)
    return typeof rules === 'string' ? guardHover(rules) : rules
  }
  return cache
}
