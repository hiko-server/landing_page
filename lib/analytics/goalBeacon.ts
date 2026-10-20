import type { ClientGoal } from './eventsShared'

/**
 * Browser side of the goal events (server: lib/analytics/events, POST
 * /api/g). This module ships in the shared bundle (pages/_app installs the
 * click listener), so it stays tiny and imports nothing at runtime; the
 * read-through, print and search senders live in their page chunks and
 * reuse sendGoal().
 *
 * One event per beacon: `{ n, p, v? }` — the event name, the page path
 * (location.pathname, never the query or hash) and, for an outbound click,
 * the destination's host name only; for a search that found nothing, its
 * normalised text. No cookies, storage or identifiers. Nothing is sent from
 * /admin, from automated browsers (navigator.webdriver), or when the
 * browser asks not to be tracked (Do Not Track / Global Privacy Control) —
 * the server enforces the same rules and validates every field again.
 */

type PrivacyNavigator = Navigator & { globalPrivacyControl?: boolean; webdriver?: boolean }

/** Whether this page may send goal events (the client half of the server's rules). */
export function goalsAllowed(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as PrivacyNavigator
  return !nav.webdriver && nav.doNotTrack !== '1' && nav.globalPrivacyControl !== true && !/^\/admin(\/|$)/.test(location.pathname)
}

/** Send one goal event for the current page (never throws, never blocks navigation). */
export function sendGoal(name: ClientGoal, value?: string): void {
  if (!goalsAllowed()) return
  // `v` is left out of the JSON when undefined.
  const body = JSON.stringify({ n: name, p: location.pathname, v: value })
  try {
    // A string body goes out as text/plain: no CORS preflight, survives unload.
    if (navigator.sendBeacon('/api/g', body)) return
  } catch {
    // Fall through to fetch.
  }
  // Same defaults as the beacon: text/plain for a string body, same-origin credentials.
  fetch('/api/g', { method: 'POST', body, keepalive: true }).catch(() => undefined)
}

/**
 * A click (or middle click) on a link: mailto: → email_click (no address is
 * sent: the server records the page path); http(s) to another host →
 * outbound_click with that host. Links whose default action was cancelled
 * by the page are not followed, so they are not counted.
 */
function onLinkClick(e: MouseEvent) {
  if (e.defaultPrevented || (e.type === 'auxclick' && e.button !== 1)) return
  const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!link) return
  try {
    // `href` is resolved: a protocol-relative or relative link is already absolute here.
    const url = new URL(link.href)
    if (url.protocol === 'mailto:') sendGoal('email_click')
    else if (/^https?:$/.test(url.protocol) && url.host !== location.host) sendGoal('outbound_click', url.hostname)
  } catch {
    // A malformed href: nothing to count, and a click handler must never throw.
  }
}

const TYPES = ['click', 'auxclick'] as const

/** Count e-mail and outbound link clicks site-wide (pages/_app, once). Returns the cleanup. */
export function installGoalClicks(): () => void {
  TYPES.forEach((t) => document.addEventListener(t, onLinkClick))
  return () => TYPES.forEach((t) => document.removeEventListener(t, onLinkClick))
}
