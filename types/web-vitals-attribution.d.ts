/**
 * web-vitals (v4) attribution build as bundled by Next.js
 * (node_modules/next/dist/compiled/web-vitals-attribution). Only the entry
 * points lib/analytics/client.ts uses; tests/perf-g6-attribution.test.ts
 * checks they exist in the installed copy.
 */
declare module 'next/dist/compiled/web-vitals-attribution' {
  type Metric = { id: string; name: string; value: number; navigationType?: string; attribution?: unknown }
  type Subscribe = (callback: (metric: Metric) => void, opts?: { reportAllChanges?: boolean }) => void
  export const onLCP: Subscribe
  export const onINP: Subscribe
  export const onCLS: Subscribe
  export const onFCP: Subscribe
  export const onTTFB: Subscribe
}
