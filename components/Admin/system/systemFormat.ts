/**
 * Formatting for the admin System page (pure — unit tested).
 */

/** "1.4 MB", "820 KB", "12 B" (binary units, one decimal from MB up). */
export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}

/** "3 d 4 h", "5 h 12 min", "42 min", "30 s". */
export function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d} d ${h} h`
  if (h) return `${h} h ${m} min`
  if (m) return `${m} min`
  return `${s} s`
}

/** "1.2 s", "340 ms". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`
}

export type ErrorSourceName = 'client' | 'server' | 'csp'

export function sourceLabel(source: string): string {
  return source === 'client'
    ? 'Browser'
    : source === 'server'
      ? 'Server'
      : source === 'csp'
        ? 'CSP'
        : source
}

const KIND: Record<string, string> = {
  error: 'uncaught error',
  unhandledrejection: 'unhandled rejection',
  boundary: 'caught by an error boundary',
  api: 'API route',
  render: 'page render',
  route: 'route handler',
  middleware: 'middleware',
  log: 'logged error',
  csp: 'policy violation',
}

export function kindLabel(kind: string): string {
  return KIND[kind] || kind
}

/** Sum of a daily series. */
export function seriesTotal(series: readonly number[]): number {
  return series.reduce((n, v) => n + (Number.isFinite(v) ? v : 0), 0)
}

/** Bar heights (0–1) for a sparkline; all zero when the series is empty. */
export function sparkHeights(series: readonly number[]): number[] {
  const max = Math.max(0, ...series)
  return series.map((v) => (max > 0 ? Math.max(0, v) / max : 0))
}

/** Browser-family tally as "Chrome 12 · Safari 3" (most frequent first). */
export function browserTally(browsers: Record<string, number>): string {
  return Object.entries(browsers)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ')
}

/** Drill check status → badge colour scheme. */
export function checkTone(status: string): 'green' | 'orange' | 'red' | 'gray' {
  return status === 'pass' || status === 'passed'
    ? 'green'
    : status === 'warn'
      ? 'orange'
      : status === 'fail' || status === 'failed'
        ? 'red'
        : 'gray'
}
