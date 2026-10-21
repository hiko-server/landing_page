import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Global } from '@emotion/react'
import { BOTTOM_BAR_VAR } from './useBottomBarOffset'

/**
 * Room after the footer for a fixed bottom bar: the site chrome's column
 * (the page and the footer, components/Chrome/SiteChrome) gets a bottom
 * padding of the bar's measured height (`--bottom-bar-h`, safe-area inset
 * included, published by useBottomBarOffset; 0 until it is measured), so the
 * page can always scroll its last line — and a focused footer link, whose
 * scroll margin is that height (globals.css) — clear of the bar (WCAG 2.2
 * SC 2.4.11). Not the body's padding: html, body and #__next are 100% tall
 * and the page overflows them, so padding there never reached the end of
 * the scrollable page. The column is at least a viewport tall (border-box),
 * so on a short page the footer ends right above the bar; on a long one the
 * padding only adds room at the very end.
 */
export const BOTTOM_BAR_ROOM = { '[data-site-chrome]': { paddingBottom: `var(${BOTTOM_BAR_VAR}, 0px)` } } as const

/**
 * Hosts a page's fixed bottom bar (the review link's "Preview" bar, the
 * owner's draft-preview bar). Pages render inside the site's <main>, a
 * stacking context of its own (z-index 1) that the footer — the next
 * stacking context — paints over, so a bar left there sinks under the
 * footer once the page reaches its end. The server HTML has the bar in
 * place (nothing shifts at hydration); once mounted it moves to <body>,
 * above the footer, and the page gets the room below the footer for it.
 */
export default function BottomBarHost({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => setHost(document.body), [])
  return (
    <>
      <Global styles={BOTTOM_BAR_ROOM} />
      {host ? createPortal(children, host) : children}
    </>
  )
}
