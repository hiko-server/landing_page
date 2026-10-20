/**
 * Open a passage "Ask" cites (components/Search/AskView).
 *
 *   Another page   a full navigation (location.assign): browsers apply a
 *                  text directive (#:~:text=…) only when a document loads,
 *                  so a client-side route change would lose the highlight.
 *   This page      a navigation would not reload it, so the quote is found
 *                  here (the same matching rules, lib/search/quoteLocate),
 *                  scrolled to the middle of the viewport, marked with the
 *                  CSS Custom Highlight API (::highlight(cited-quote) in
 *                  styles/globals.css; the selection where that API is
 *                  missing) until the next click or key, and its block
 *                  takes focus so reading continues there. When the quote
 *                  cannot be found, the source's anchor is scrolled to.
 */

import { flatten, locateQuote } from '../../lib/search/quoteLocate'

const HIGHLIGHT = 'cited-quote'

type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void }
type HighlightCtor = new (...ranges: Range[]) => unknown

const visible = (el: HTMLElement | null): el is HTMLElement => !!el && el.getClientRects().length > 0

/** The visible element of an anchor: its id, or a CV Reading view twin (`data-cv-anchor`). */
function anchorElement(id: string): HTMLElement | null {
  if (!id) return null
  const byId = document.getElementById(id)
  if (visible(byId)) return byId
  const twins = Array.from(document.querySelectorAll<HTMLElement>('[data-cv-anchor]')).filter((el) => el.dataset.cvAnchor === id)
  return twins.find(visible) || byId
}

/** Visible text nodes under `root`, in document order. */
function textNodes(root: Node): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const parent = n.parentElement
      if (!parent || !n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT
      if (parent.closest('script, style, noscript, [aria-hidden="true"], [hidden]')) return NodeFilter.FILTER_REJECT
      return parent.getClientRects().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text)
  return out
}

/** A DOM Range for the quote under `root`, or null. */
export function findQuoteRange(root: Node, terms: readonly string[]): Range | null {
  const nodes = textNodes(root)
  if (!nodes.length || !terms.length) return null
  // One string of all text nodes (a space between nodes keeps words apart), with each character's node.
  let text = ''
  const owner: Array<{ node: Text; offset: number }> = []
  for (const node of nodes) {
    const value = node.nodeValue || ''
    for (let i = 0; i < value.length; i++) owner.push({ node, offset: i })
    text += value
    owner.push({ node, offset: value.length })
    text += ' '
  }
  const flat = flatten(text)
  const hit = locateQuote(flat, terms)
  if (!hit) return null
  const from = owner[flat.map[hit.start]]
  const to = owner[flat.map[hit.end - 1]]
  if (!from || !to) return null
  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, Math.min(to.offset + 1, (to.node.nodeValue || '').length))
  return range
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

let clearMark: (() => void) | null = null

/** Mark `range` until the next pointer or key press. */
function mark(range: Range): void {
  clearMark?.()
  const css = (window as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS
  const Highlight = (window as unknown as { Highlight?: HighlightCtor }).Highlight
  let undo: () => void
  if (css?.highlights && Highlight) {
    css.highlights.set(HIGHLIGHT, new Highlight(range))
    undo = () => css.highlights?.delete(HIGHLIGHT)
  } else {
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    undo = () => undefined
  }
  const done = () => {
    undo()
    window.removeEventListener('pointerdown', done, true)
    window.removeEventListener('keydown', done, true)
    clearMark = null
  }
  // Attached on the next frame, so the key press that opened the citation does not clear it.
  window.requestAnimationFrame(() => {
    window.addEventListener('pointerdown', done, true)
    window.addEventListener('keydown', done, true)
  })
  clearMark = done
}

/**
 * Move focus to the block that holds the quote (without scrolling it again),
 * once the palette's focus trap has let go (it is released as the dialog
 * unmounts, just after its exit).
 */
function focusBlock(el: HTMLElement | null, attempts = 8): void {
  if (!el || !el.isConnected) return
  if (!el.hasAttribute('tabindex')) {
    el.setAttribute('tabindex', '-1')
    el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true })
  }
  el.focus({ preventScroll: true })
  // The trap may still pull focus back for a frame or two: try again until it stays.
  window.requestAnimationFrame(() => {
    if (document.activeElement !== el && attempts > 1) focusBlock(el, attempts - 1)
  })
}

/** Scroll, mark and focus a quote on the current page; false when neither it nor its anchor is there. */
export function revealQuoteHere(url: URL, terms: readonly string[]): boolean {
  const anchorId = decodeURIComponent(url.hash.replace(/^#/, '').split(':~:')[0] || '')
  const anchor = anchorElement(anchorId)
  const behavior: ScrollBehavior = reducedMotion() ? 'auto' : 'smooth'
  const range = (anchor && findQuoteRange(anchor, terms)) || findQuoteRange(document.querySelector('main') || document.body, terms)
  if (range) {
    const rect = range.getBoundingClientRect()
    window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - window.innerHeight * 0.35), behavior })
    mark(range)
    const block = (range.startContainer.parentElement?.closest('p, li, blockquote, figure, h2, h3, [id]') as HTMLElement | null) || anchor
    focusBlock(block)
    return true
  }
  if (anchor) {
    anchor.scrollIntoView({ block: 'start', behavior })
    focusBlock(anchor)
    return true
  }
  return false
}

const samePath = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '')

/** Open a cited passage (see the module comment). `href` is same-site; `terms` its text-directive terms. */
export function openCitation(href: string, terms: readonly string[]): void {
  let url: URL
  try {
    url = new URL(href, window.location.href)
  } catch {
    return
  }
  if (url.origin !== window.location.origin) return
  if (samePath(url.pathname, window.location.pathname) && url.search === window.location.search && revealQuoteHere(url, terms)) return
  window.location.assign(url.href)
}
