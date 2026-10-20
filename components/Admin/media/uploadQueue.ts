/**
 * The media library's upload queue (H7) — the pure part, unit-tested; the
 * hook (useUploadQueue) drives it. Files go one at a time (the server
 * encodes one image at a time anyway, lib/imageJobs); a refusal for load
 * (429 too many uploads, 503 the encoder is busy) waits the time the server
 * names and carries on by itself; anything else is an error with Retry.
 */

export type QueueStatus = 'queued' | 'uploading' | 'waiting' | 'done' | 'error'

export type QueueItem = {
  id: string
  fileName: string
  size: number
  /** Object URL of the picked file, for its row. */
  preview: string | null
  status: QueueStatus
  error?: string
  warning?: string
  /** The stored upload's name once done. */
  uploaded?: string
  /** While waiting: when it tries again (ms). */
  until?: number
}

/** The next item to send at `now`: the first queued one, or a waiting one whose time has come. */
export function nextRunnable(items: readonly QueueItem[], now: number): QueueItem | null {
  for (const it of items) {
    if (it.status === 'queued') return it
    if (it.status === 'waiting' && (it.until ?? 0) <= now) return it
  }
  return null
}

/** The earliest moment a waiting item may go (null when none waits). */
export function nextWakeUp(items: readonly QueueItem[]): number | null {
  const times = items.filter((i) => i.status === 'waiting' && typeof i.until === 'number').map((i) => i.until as number)
  return times.length ? Math.min(...times) : null
}

export type QueueSummary = { total: number; done: number; failed: number; active: boolean; waiting: boolean }

export function summarize(items: readonly QueueItem[]): QueueSummary {
  const done = items.filter((i) => i.status === 'done').length
  const failed = items.filter((i) => i.status === 'error').length
  return {
    total: items.length,
    done,
    failed,
    active: items.some((i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'waiting'),
    waiting: items.some((i) => i.status === 'waiting'),
  }
}

/** The panel's heading: "Uploading 2 of 5", "Waiting to continue…", "5 uploaded · 1 failed". */
export function queueHeading(s: QueueSummary): string {
  if (s.active) return s.waiting && !s.done ? 'Waiting to continue…' : `Uploading ${Math.min(s.total, s.done + s.failed + 1)} of ${s.total}`
  const parts = [`${s.done} uploaded`]
  if (s.failed) parts.push(`${s.failed} failed`)
  return parts.join(' · ')
}

/** "in 12 s" for a waiting row. */
export function waitLabel(until: number | undefined, now: number): string {
  const s = Math.max(0, Math.ceil(((until ?? now) - now) / 1000))
  if (s >= 60) return `continues in ${Math.ceil(s / 60)} min`
  return `continues in ${s} s`
}
