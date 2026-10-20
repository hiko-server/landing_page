/**
 * Pure helpers of the Activity view (unit tested).
 */

export type DayGroup<T> = { key: string; label: string; items: T[] }

const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Today", "Yesterday", or "Mon 6 Oct" / "6 Oct 2025" (local time; older years carry the year). */
export function dayLabel(ms: number, now: number): string {
  const key = dayKey(ms)
  if (key === dayKey(now)) return 'Today'
  if (key === dayKey(now - 86_400_000)) return 'Yesterday'
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return new Intl.DateTimeFormat('en-GB', sameYear ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

/** Items (newest first) grouped by local calendar day, order kept. */
export function groupByDay<T extends { ts: number }>(items: readonly T[], now: number): DayGroup<T>[] {
  const out: DayGroup<T>[] = []
  for (const item of items) {
    const key = dayKey(item.ts)
    const last = out[out.length - 1]
    if (last && last.key === key) last.items.push(item)
    else out.push({ key, label: dayLabel(item.ts, now), items: [item] })
  }
  return out
}

/** "14:05" in local time. */
export function clockTime(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(ms)
}

/** "Chrome on macOS · 203.0.113.x · HK" — whatever is known, never more. */
export function actorLine(a: { device: string | null; ipPrefix: string | null; country: string | null }): string {
  return [a.device, a.ipPrefix && a.ipPrefix !== 'loopback' ? a.ipPrefix : a.ipPrefix === 'loopback' ? 'this server' : null, a.country]
    .filter(Boolean)
    .join(' · ')
}
