/**
 * Hydration-safe "what month is it" for server-rendered pages.
 *
 * Some text depends on the current month: a future graduation reads
 * "Expected Jun 2026", a project that is still running reads "Present", the
 * footer prints the year. If the server (UTC container) and the browser (a
 * visitor in UTC+8) each ask `new Date()`, they disagree for a few hours at
 * every month boundary, React finds a text mismatch while hydrating and
 * re-renders the whole page on the client.
 *
 * So a page computes ONE reference month on the server, in the site's own
 * time zone, ships it as `pageProps.clockMonth`, and pages/_app.tsx provides
 * it through <ClockProvider>. Every renderer that makes a time-based decision
 * reads useReferenceMonth(), so the server HTML and the hydrating client
 * render identical text. Pages that do not ship a month fall back to the
 * month computed at render time.
 */

import { createContext, createElement, useContext, type ReactNode } from 'react'

/** The owner is in Hong Kong; "this month" means this month there. */
export const SITE_TIME_ZONE = 'Asia/Hong_Kong'

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

/** True for a 'YYYY-MM' string with a valid month. */
export function isReferenceMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_RE.test(value)
}

/** 'YYYY-MM' of `now` in `timeZone` (default: the site's time zone). */
export function referenceMonth(now: Date = new Date(), timeZone: string = SITE_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(now)
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  return `${year}-${month}`
}

/** Months since year 0 for a 'YYYY-MM' (comparable as plain numbers). */
export function monthIndex(month: string): number {
  const m = MONTH_RE.exec(month)
  if (!m) return Number.NaN
  return Number(m[1]) * 12 + (Number(m[2]) - 1)
}

/** 'YYYY' of a reference month. */
export function referenceYear(month: string): string {
  return month.slice(0, 4)
}

const ClockContext = createContext<string | null>(null)

/** Provides the page's server-computed reference month (ignored unless 'YYYY-MM'). */
export function ClockProvider({ month, children }: { month?: unknown; children?: ReactNode }) {
  return createElement(ClockContext.Provider, { value: isReferenceMonth(month) ? month : null }, children)
}

/**
 * The reference month for time-based text: the one the page's server render
 * used when the page shipped it, otherwise the month right now.
 */
export function useReferenceMonth(): string {
  return useContext(ClockContext) ?? referenceMonth()
}
