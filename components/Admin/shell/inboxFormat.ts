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
