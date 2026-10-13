/**
 * /now with an owner-written body: the live-signals sidebar must not repeat
 * what the body already says, and the page shows one "updated" date.
 *
 *   - a latest post / case study is dropped when the body links to it
 *     (hrefs compared normalised: same-site absolute URLs, relative paths,
 *     trailing slashes, query strings, fragments and case all collapse);
 *   - a role or study is dropped when the body names it (its title, and its
 *     organisation when it has one, both appear in the body's text);
 *   - the "currently coding" project is dropped when the body names it.
 *
 * Text matching is whole-word on normalised text (case, punctuation and
 * spacing ignored), so a role is only dropped when the owner wrote it out.
 * Pure, so it is unit-tested (tests/chrome-identity.test.ts); pages/now.tsx
 * runs it at build / revalidation time on the compiled tree.
 */

import type { NowSignals } from './nowSignals'

type HastNode = {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  value?: string
}

/** What a compiled body links to and says. */
export type BodyReferences = { hrefs: ReadonlySet<string>; text: string }

const BLOCK_SEPARATOR = ' '

/**
 * A link as a comparable site path ("/blog/swcs"), or null for another site,
 * a mail / phone link, an in-page anchor or anything unparsable.
 */
export function normalizeSitePath(href: unknown, siteHost: string, from = '/now'): string | null {
  if (typeof href !== 'string' || !href.trim() || href.trim().startsWith('#')) return null
  const host = siteHost.replace(/^www\./i, '').toLowerCase()
  let url: URL
  try {
    url = new URL(href.trim(), `https://${host}${from}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.hostname.replace(/^www\./i, '').toLowerCase() !== host) return null
  let path: string
  try {
    path = decodeURI(url.pathname)
  } catch {
    path = url.pathname
  }
  path = path.replace(/\/+$/, '') || '/'
  return path.toLowerCase()
}

/** Lower-case, punctuation-free, single-spaced text with word boundaries at both ends. */
export function normalizeText(s: string): string {
  const words = s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  return words ? ` ${words} ` : ''
}

/** Every link target and the readable text of a compiled (hast) body. */
export function bodyReferences(tree: unknown, siteHost: string): BodyReferences {
  const hrefs = new Set<string>()
  const parts: string[] = []
  const visit = (node: HastNode) => {
    if (node.type === 'text' && typeof node.value === 'string') {
      parts.push(node.value)
      return
    }
    if (node.type === 'element') {
      if (node.tagName === 'a') {
        const path = normalizeSitePath(node.properties?.href, siteHost)
        if (path) hrefs.add(path)
      }
      parts.push(BLOCK_SEPARATOR)
    }
    for (const child of node.children || []) visit(child)
    if (node.type === 'element') parts.push(BLOCK_SEPARATOR)
  }
  if (tree && typeof tree === 'object') visit(tree as HastNode)
  return { hrefs, text: normalizeText(parts.join('')) }
}

/** True when `phrase` appears as whole words in the normalised body text. */
function mentions(refs: BodyReferences, phrase: string, minChars = 3): boolean {
  const needle = normalizeText(phrase)
  if (needle.replace(/\s/g, '').length < minChars) return false
  return refs.text.includes(needle)
}

/** The signals minus everything the body already links to or names. */
export function dedupeNowSignals(signals: NowSignals, refs: BodyReferences, siteHost: string): NowSignals {
  const linked = (href: string | undefined) => {
    const path = normalizeSitePath(href, siteHost)
    return !!path && refs.hrefs.has(path)
  }
  return {
    ...signals,
    roles: signals.roles.filter((r) => !(mentions(refs, r.title, 4) && (!r.org || mentions(refs, r.org)))),
    coding: signals.coding && signals.coding.project && mentions(refs, signals.coding.project) ? null : signals.coding,
    post: signals.post && linked(signals.post.href) ? null : signals.post,
    work: signals.work && linked(signals.work.href) ? null : signals.work,
  }
}

/**
 * The page's one "updated" day (YYYY-MM-DD): the newer of the owner's own
 * date and, when the sidebar shows signals, the day their sources changed.
 * '' when neither is known.
 */
export function nowUpdatedOn(ownerUpdated: string | null | undefined, signalsUpdated: string, signalsShown: boolean): string {
  const day = (v: string | null | undefined) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')
  const own = day(ownerUpdated)
  const live = signalsShown ? day(signalsUpdated) : ''
  return own > live ? own : live
}
