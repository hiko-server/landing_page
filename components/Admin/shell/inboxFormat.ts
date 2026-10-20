/**
 * Pure formatting helpers for the admin Inbox (unit tested).
 */

export type ReplySource = { email: string; subject: string; message: string; name: string; at: string }

export function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso || '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

export function relative(iso: string, now: number): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.round((now - t) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const days = Math.round(h / 24)
  if (days < 30) return `${days} d ago`
  return formatWhen(iso).split(',')[0]
}

/** mailto: link that answers the visitor with the original message quoted. */
export function replyHref(m: ReplySource): string {
  const subject = /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject || 'your message'}`
  const quoted = m.message
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n')
  const body = `\n\n—\nOn ${formatWhen(m.at)}, ${m.name || m.email} wrote:\n${quoted}`
  return `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/**
 * Which message ↑/↓ opens in the Inbox list.
 *
 * With a message open, the key moves one step from it (clamped to the
 * list). With nothing open, the key opens the message that has keyboard
 * focus — Tab lands on the newest message, so the first ↓ opens that one
 * rather than skipping to the second — or the first message when focus is
 * not on one. Returns -1 for an empty list.
 */
export function inboxArrowTarget(
  count: number,
  selectedIndex: number,
  focusedIndex: number,
  key: 'ArrowDown' | 'ArrowUp',
): number {
  if (count <= 0) return -1
  const clamp = (i: number) => Math.min(count - 1, Math.max(0, i))
  if (selectedIndex >= 0 && selectedIndex < count) return clamp(selectedIndex + (key === 'ArrowDown' ? 1 : -1))
  return focusedIndex >= 0 && focusedIndex < count ? focusedIndex : 0
}

/** Human size for the Inbox storage note: "3.2 MB", "640 KB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes || 0))} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Host + path of a link for display ("jobs.example.com/职位/123"): stored
 * links are percent-encoded, so non-ASCII paths are shown decoded (the href
 * stays encoded); long paths are cut with an ellipsis.
 */
export function shortUrl(url: string, max = 48): string {
  try {
    const u = new URL(url)
    let rest = `${u.pathname}${u.search}`.replace(/\/$/, '')
    try {
      rest = decodeURI(rest)
    } catch {
      /* not valid UTF-8 percent-encoding: keep it encoded */
    }
    return `${u.host}${rest.length > max ? `${rest.slice(0, max - 1)}…` : rest}`
  } catch {
    return url
  }
}
