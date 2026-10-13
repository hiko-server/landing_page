import { Children, isValidElement, type ReactNode } from 'react'

/**
 * Print helpers (the print stylesheet itself is in styles/globals.css).
 *
 *  - Closed <details> print as their summary only, so every closed one is
 *    opened for the print and closed again afterwards.
 *  - External links in article prose print their URL after the link text
 *    (paper has no hover), except where the text already shows the URL.
 */

type DetailsLike = { open: boolean }
type DetailsRoot = { querySelectorAll(selector: string): ArrayLike<DetailsLike> }

/** Open every closed <details> under `root`; returns a function that closes exactly those again. */
export function openDetailsForPrint(root: DetailsRoot): () => void {
  const opened = Array.from(root.querySelectorAll('details:not([open])'))
  for (const d of opened) d.open = true
  return () => {
    for (const d of opened) d.open = false
  }
}

type PrintTarget = {
  document: DetailsRoot
  addEventListener(type: 'beforeprint' | 'afterprint', listener: () => void): void
  removeEventListener(type: 'beforeprint' | 'afterprint', listener: () => void): void
}

/** Open closed <details> on `beforeprint` and restore them on `afterprint`; returns the cleanup. */
export function installPrintDetails(win: PrintTarget): () => void {
  let restore: (() => void) | null = null
  const before = () => {
    restore?.()
    restore = openDetailsForPrint(win.document)
  }
  const after = () => {
    restore?.()
    restore = null
  }
  win.addEventListener('beforeprint', before)
  win.addEventListener('afterprint', after)
  return () => {
    win.removeEventListener('beforeprint', before)
    win.removeEventListener('afterprint', after)
    after()
  }
}

/** Plain text of rendered link children (strings, numbers, nested elements). */
export function textOfNode(node: ReactNode): string {
  let out = ''
  Children.forEach(node, (child) => {
    if (typeof child === 'string' || typeof child === 'number') out += String(child)
    else if (isValidElement<{ children?: ReactNode }>(child)) out += textOfNode(child.props.children)
  })
  return out
}

/** "https://www.Example.com/a/" → "example.com/a": how a URL reads when written out in text. */
function comparableUrl(value: string): string {
  return value
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

/**
 * The URL to print after an external link, or undefined: only http(s)
 * links with visible text (not a linked image), and not when the text
 * already is that URL (with or without the scheme, "www." or a trailing
 * slash).
 */
export function printableLinkUrl(href: string, text: string): string | undefined {
  const url = href.trim()
  if (!/^https?:\/\//i.test(url)) return undefined
  const shown = comparableUrl(text)
  if (!shown || shown === comparableUrl(url)) return undefined
  return url
}
