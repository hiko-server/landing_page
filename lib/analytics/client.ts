import { useEffect } from 'react'
import type { NextRouter } from 'next/router'
import { isVitalName, normalizeNavType, normalizeTrackedPath, type NavType, type VitalName } from './shared'

/**
 * Browser side of the first-party analytics (server: lib/analytics/ingest).
 *
 *   useAnalytics(router)          one page view on mount and after every
 *                                 client-side navigation to a new path
 *   useReportWebVitals(reportWebVital)
 *                                 in pages/_app (next/web-vitals): Core Web
 *                                 Vitals of the landing page, sent whenever
 *                                 the tab is hidden (latest value per metric
 *                                 instance) and on pagehide
 *
 * Nothing is sent from /admin, from automated browsers (navigator.webdriver),
 * or when the browser asks not to be tracked (Do Not Track / Global Privacy
 * Control) — the server enforces the same rules. No cookies, no storage, no
 * visitor identifiers: a page view carries the path, the external referrer
 * of the landing page and the page language; a vital carries the route, the
 * metric and the web-vitals instance id (`k`, random per page load and
 * metric — it names a measurement, not a visitor) so that a value reported
 * again replaces the earlier one on the server instead of counting twice.
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
//
// Next 15 calls a legacy `export function reportWebVitals` in pages/_app only
// with its own User Timing measures (hydration, render), never with LCP, INP
// or CLS. Real vitals come from the web-vitals library bundled with Next,
// through `useReportWebVitals` (next/web-vitals), which pages/_app calls with
// the module-level (therefore stable, subscribed once) `reportWebVital` below.

/** The fields of a web-vitals `Metric` this module reads. */
export type WebVitalMetric = { id: string; name: string; value: number; navigationType?: string }

/**
 * One `t: 'v'` event of the beacon (validated again by lib/analytics/ingest).
 * `k` is the web-vitals instance id: ingest keeps one row per instance and
 * replaces its value when the instance is reported again.
 */
export type VitalBeaconEvent = { t: 'v'; route: string; name: VitalName; value: number; nav: NavType | null; k: string }

/**
 * Turns web-vitals reports into beacon events for one measured `route`
 * (null: nothing is collected), keeping the LATEST value of each metric
 * instance. web-vitals reports CLS and INP again under the same `id` each
 * time the page is hidden with a changed value — the final value is the
 * last one — while LCP / FCP / TTFB are final once reported. `drain()`
 * returns every instance whose latest value has not been sent yet (a new
 * instance, or a changed value of one already sent), so a hide → show →
 * hide sequence sends the larger final CLS too; the server keys rows by the
 * instance id (`k`), so a re-sent instance replaces its earlier value and
 * is never counted twice. (A back/forward-cache restore starts new
 * instances with new ids: new measurements.) FID, unknown names and
 * non-finite values are ignored.
 */
export function createVitalsCollector(route: string | null) {
  const latest = new Map<string, { event: VitalBeaconEvent; sent: boolean }>()
  return {
    /** Record `metric`; false when it is ignored or repeats the stored value. `fallbackNav` is read only for a new instance without a navigation type. */
    add(metric: WebVitalMetric, fallbackNav: () => NavType | null = () => null): boolean {
      if (!route || !metric || typeof metric.id !== 'string' || !metric.id) return false
      if (!isVitalName(metric.name) || typeof metric.value !== 'number' || !Number.isFinite(metric.value)) return false
      const known = latest.get(metric.id)
      if (known) {
        if (known.event.name !== metric.name || known.event.value === metric.value) return false
        known.event = { ...known.event, value: metric.value }
        known.sent = false
        return true
      }
      const nav = normalizeNavType(metric.navigationType) ?? fallbackNav()
      latest.set(metric.id, { event: { t: 'v', route, name: metric.name, value: metric.value, nav, k: metric.id }, sent: false })
      return true
    },
    /** The unsent latest values, in beacon-sized batches (at most MAX_PER_BEACON events each); they count as sent. */
    drain(): VitalBeaconEvent[][] {
      const pending: VitalBeaconEvent[] = []
      for (const entry of latest.values()) {
        if (entry.sent) continue
        entry.sent = true
        pending.push(entry.event)
      }
      const batches: VitalBeaconEvent[][] = []
      while (pending.length) batches.push(pending.splice(0, MAX_PER_BEACON))
      return batches
    },
  }
}

/** Vitals describe the hard-loaded page, even when reported after client-side navigation. */
const landingPath = typeof window === 'undefined' ? '' : window.location.pathname
let collector: ReturnType<typeof createVitalsCollector> | null = null
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
  for (const batch of collector?.drain() ?? []) send(batch)
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') flushVitals()
}

/**
 * The `useReportWebVitals` callback (pages/_app): record the landing page's
 * LCP / INP / CLS / FCP / TTFB and send what changed whenever the tab is
 * hidden — the last moment a page is reliably alive on mobile, where
 * pagehide may never come — and on pagehide (Safari, unload, entering the
 * back/forward cache). A CLS or INP that grows after the tab came back is
 * sent again under the same instance id and replaces the earlier value.
 */
export function reportWebVital(metric: WebVitalMetric) {
  if (!trackingAllowed(landingPath)) return
  collector ??= createVitalsCollector(normalizeTrackedPath(landingPath))
  if (!collector.add(metric, navigationType) || listening) return
  listening = true
  // On `window`, in the bubbling phase: `visibilitychange` bubbles up from the
  // document, so this runs after web-vitals' own document listeners have
  // reported the final LCP / CLS / INP for that same event.
  window.addEventListener('visibilitychange', onVisibilityChange)
  // Safari does not always fire visibilitychange on unload.
  window.addEventListener('pagehide', flushVitals)
}
