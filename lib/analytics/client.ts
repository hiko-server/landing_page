import { useEffect } from 'react'
import type { NextRouter } from 'next/router'
import type { NextWebVitalsMetric } from 'next/app'
import { isVitalName, normalizeNavType, normalizeTrackedPath, type NavType } from './shared'

/**
 * Browser side of the first-party analytics (server: lib/analytics/ingest).
 *
 *   useAnalytics(router)          one page view on mount and after every
 *                                 client-side navigation to a new path
 *   export { reportWebVitals }    from pages/_app: Core Web Vitals of the
 *                                 landing page, sent when the tab is hidden
 *
 * Nothing is sent from /admin, from automated browsers (navigator.webdriver),
 * or when the browser asks not to be tracked (Do Not Track / Global Privacy
 * Control) — the server enforces the same rules. No cookies, no storage, no
 * identifiers: the beacon carries the path, the external referrer of the
 * landing page and the page language.
 */

const ENDPOINT = '/api/a'
const MAX_PER_BEACON = 10

type PrivacyNavigator = Navigator & { globalPrivacyControl?: boolean; webdriver?: boolean }

function trackingAllowed(pathname: string): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as PrivacyNavigator
  if (nav.webdriver) return false
  if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return false
  return !pathname.startsWith('/admin')
}

function send(payload: unknown) {
  const body = JSON.stringify(payload)
  try {
    // A string body goes out as text/plain: no CORS preflight, survives unload.
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ENDPOINT, body)) return
  } catch {
    // Fall through to fetch.
  }
  fetch(ENDPOINT, {
    method: 'POST',
    body,
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
  }).catch(() => {
    // Analytics must never surface errors to the visitor.
  })
}

// ── Page views ────────────────────────────────────────────────────────────

let lastPath: string | null = null
let sentFirst = false

/** Send a page view for the current location unless it repeats the previous one (query/hash changes, Strict Mode re-runs). */
export function trackPageview() {
  if (typeof window === 'undefined') return
  const path = window.location.pathname
  if (path === lastPath) return
  lastPath = path
  if (!trackingAllowed(path) || !normalizeTrackedPath(path)) return
  // The external referrer belongs to the landing page only; later client-side
  // navigations are internal.
  const referrer = sentFirst ? '' : document.referrer
  sentFirst = true
  send({ t: 'pv', p: path, r: referrer, l: document.documentElement.lang })
}

/** Wire page views to the Next router (call once, in pages/_app). */
export function useAnalytics(router: Pick<NextRouter, 'events'>) {
  useEffect(() => {
    trackPageview()
    const onRouteChange = () => trackPageview()
    router.events.on('routeChangeComplete', onRouteChange)
    return () => router.events.off('routeChangeComplete', onRouteChange)
  }, [router.events])
}

// ── Web Vitals ────────────────────────────────────────────────────────────

/** Vitals describe the hard-loaded page, even when reported after client-side navigation. */
const landingPath = typeof window === 'undefined' ? '' : window.location.pathname
const vitalsQueue: Array<{ t: 'v'; route: string; name: string; value: number; nav: NavType | null }> = []
let listening = false

function navigationType(): NavType | null {
  try {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const prerendered = (document as Document & { prerendering?: boolean }).prerendering === true
    return prerendered ? 'prerender' : normalizeNavType(entry?.type)
  } catch {
    return null
  }
}

function flushVitals() {
  while (vitalsQueue.length) send(vitalsQueue.splice(0, MAX_PER_BEACON))
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') flushVitals()
}

/** Next's reportWebVitals hook: queue the landing page's LCP / INP / CLS / FCP / TTFB, flush when the tab is hidden. */
export function reportWebVitals(metric: NextWebVitalsMetric) {
  if (metric.label !== 'web-vital' || !isVitalName(metric.name)) return
  if (!trackingAllowed(landingPath)) return
  const route = normalizeTrackedPath(landingPath)
  if (!route || typeof metric.value !== 'number' || !Number.isFinite(metric.value)) return
  vitalsQueue.push({ t: 'v', route, name: metric.name, value: metric.value, nav: navigationType() })
  if (!listening) {
    listening = true
    document.addEventListener('visibilitychange', onVisibilityChange)
    // Safari does not always fire visibilitychange on unload.
    window.addEventListener('pagehide', flushVitals)
  }
}
