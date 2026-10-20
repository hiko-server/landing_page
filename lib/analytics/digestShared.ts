/**
 * The weekly analytics digest (H10): when it is due, what it says, and how
 * it is written — pure (no Node or DOM APIs), shared by the server
 * (lib/analytics/digest), the admin's digest card and the tests.
 *
 * Content: last week's views and visitor-days with the change vs the week
 * before, the top pages, referrers and countries, the goals that happened,
 * the Source → CV → Download conversion, how many searches found nothing
 * (a count — never the texts: they are kept 35 days only, as /colophon
 * promises), the posts published that week and the Web Vitals p75. Totals
 * only: nothing in it identifies a visitor.
 */
import { formatBucket, formatCount, formatDelta, formatVital } from './format'
import { formatRate } from './goalsFormat'
import { dayMinus, type Kpi, type VitalName, type VitalRating } from './shared'
import type { DaySpan } from './exploreShared'

/** Sent on Mondays (UTC weekday 1) … */
export const DIGEST_WEEKDAY = 1
/** … from 01:00 UTC (the Sunday rollup runs at 00:05). */
export const DIGEST_HOUR_UTC = 1
/** A digest missed by a stopped server is still sent within this many hours of its time, then skipped. */
export const DIGEST_GRACE_HOURS = 48
/** Scheduled attempts per week (an SMTP outage must not mean an e-mail every hour). */
export const DIGEST_MAX_ATTEMPTS = 3

const DAY_MS = 86_400_000
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Midnight UTC of the Monday of the ISO week containing `now`. */
export function mondayOf(now: number): number {
  const d = new Date(now)
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return midnight - ((d.getUTCDay() + 6) % 7) * DAY_MS
}

/** The last finished ISO week (Monday – Sunday, UTC) before the week of `now`. */
export function digestWeek(now: number): DaySpan {
  const monday = mondayOf(now)
  return { from: isoDay(monday - 7 * DAY_MS), to: isoDay(monday - DAY_MS) }
}

/** When this week's digest is due (ms). */
export function digestDueAt(now: number): number {
  return mondayOf(now) + ((DIGEST_WEEKDAY - 1) * 24 + DIGEST_HOUR_UTC) * 3_600_000
}

export type DigestState = { enabled: boolean; lastWeek: string | null; attempts: number }

/**
 * Whether the scheduled digest should go out now: switched on, this week's
 * time has come (and is no more than DIGEST_GRACE_HOURS ago), last week was
 * not sent yet, and fewer than DIGEST_MAX_ATTEMPTS attempts failed.
 */
export function isDigestDue(now: number, state: DigestState): boolean {
  if (!state.enabled) return false
  const due = digestDueAt(now)
  if (now < due || now >= due + DIGEST_GRACE_HOURS * 3_600_000) return false
  if (state.lastWeek === digestWeek(now).from) return false
  return state.attempts < DIGEST_MAX_ATTEMPTS
}

/** The next time a digest will go out (ms), given what was sent. */
export function nextDigestAt(now: number, state: Pick<DigestState, 'enabled' | 'lastWeek'>): number | null {
  if (!state.enabled) return null
  const due = digestDueAt(now)
  const sentThisWeek = state.lastWeek === digestWeek(now).from
  if (!sentThisWeek && now < due) return due
  if (!sentThisWeek && now < due + DIGEST_GRACE_HOURS * 3_600_000) return now
  return due + 7 * DAY_MS
}

// ── Content ────────────────────────────────────────────────────────────────

export type DigestRow = { label: string; value: number; detail?: string }

export type DigestData = {
  /** "lucian-dev.com" */
  site: string
  week: DaySpan
  previous: DaySpan
  /** Whether the week before has data to compare with. */
  comparable: boolean
  views: Kpi
  visitors: Kpi
  pages: DigestRow[]
  referrers: DigestRow[]
  countries: DigestRow[]
  /** Goals with events this week or the week before. */
  goals: Array<{ label: string; visitors: Kpi; events: number; rate: number | null }>
  funnel: Array<{ label: string; visitors: number }>
  /** Searches with no results this week: how many, never what. */
  emptySearches: { events: number; texts: number }
  published: Array<{ title: string; path: string; day: string }>
  vitals: Array<{ name: VitalName; p75: number; rating: VitalRating; samples: number }>
  /** The Analytics view of the week in the admin. */
  adminUrl: string
}

const RATING_TEXT: Record<VitalRating, string> = { good: 'good', 'needs-improvement': 'needs improvement', poor: 'poor' }

function changeText(k: Kpi, comparable: boolean): string {
  if (!comparable) return ''
  const d = formatDelta(k.delta)
  if (d) return ` (${d} vs ${formatCount(k.previous)})`
  return k.previous === 0 && k.value > 0 ? ' (new)' : ''
}

/** "Oct 13 – Oct 19, 2026" */
export function weekLabel(week: DaySpan): string {
  return `${formatBucket(week.from)} – ${formatBucket(week.to)}, ${week.to.slice(0, 4)}`
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function digestSubject(d: DigestData, preview = false): string {
  const change = d.comparable ? formatDelta(d.visitors.delta) : null
  const lead = `${formatCount(d.visitors.value)} visitor-day${d.visitors.value === 1 ? '' : 's'}${change ? ` (${change})` : ''}`
  return `${preview ? 'Preview: ' : ''}${d.site} · week of ${formatBucket(d.week.from)}: ${lead}`
}

/** The digest as plain text and as simple, inline-styled HTML (no images, no remote content, no tracking). */
export function renderDigest(d: DigestData, preview = false): { subject: string; text: string; html: string } {
  const subject = digestSubject(d, preview)
  const lines: string[] = []
  const sections: string[] = []
  const html = (s: string) => sections.push(s)
  const td = 'padding:4px 0;border-bottom:1px solid #ececec;'
  const num = `${td}text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;`

  lines.push(`${d.site} — analytics for ${weekLabel(d.week)} (UTC)`, '')
  if (preview) lines.push('This is a preview you asked for in the admin.', '')
  lines.push(`Views: ${formatCount(d.views.value)}${changeText(d.views, d.comparable)}`)
  lines.push(`Visitor-days: ${formatCount(d.visitors.value)}${changeText(d.visitors, d.comparable)}`)
  if (!d.comparable) lines.push('(No data for the week before to compare with.)')

  html(`<p style="margin:0 0 4px;color:#555;font-size:13px;">${escapeHtml(d.site)} · ${escapeHtml(weekLabel(d.week))} (UTC)</p>`)
  if (preview) html('<p style="margin:0 0 12px;color:#555;font-size:13px;">This is a preview you asked for in the admin.</p>')
  html(
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 4px;border-collapse:collapse;"><tr>` +
      [
        ['Views', d.views],
        ['Visitor-days', d.visitors],
      ]
        .map(
          ([label, k]) =>
            `<td style="padding:0 32px 0 0;vertical-align:top;"><div style="font-size:12px;color:#555;">${label}</div><div style="font-size:26px;font-weight:600;font-variant-numeric:tabular-nums;">${formatCount((k as Kpi).value)}</div><div style="font-size:12px;color:#555;">${escapeHtml(changeText(k as Kpi, d.comparable).replace(/^ \(|\)$/g, '') || (d.comparable ? 'no change' : 'nothing to compare yet'))}</div></td>`,
        )
        .join('') +
      `</tr></table>`,
  )

  const table = (title: string, rows: DigestRow[], valueLabel: string) => {
    if (!rows.length) return
    lines.push('', `${title}:`)
    for (const r of rows) lines.push(`  ${formatCount(r.value).padStart(6)}  ${r.label}${r.detail ? ` — ${r.detail}` : ''}`)
    html(
      `<h2 style="font-size:14px;margin:20px 0 6px;">${escapeHtml(title)}</h2><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px;">` +
        rows
          .map(
            (r) =>
              `<tr><td style="${td}">${escapeHtml(r.label)}${r.detail ? `<div style="color:#666;font-size:12px;">${escapeHtml(r.detail)}</div>` : ''}</td><td style="${num}" title="${valueLabel}">${formatCount(r.value)}</td></tr>`,
          )
          .join('') +
        `</table>`,
    )
  }
  table('Top pages (visitor-days)', d.pages, 'visitor-days')
  table('Referrers (visitor-days)', d.referrers, 'visitor-days')
  table('Countries (visitor-days)', d.countries, 'visitor-days')

  if (d.goals.length) {
    lines.push('', 'Goals (visitor-days · conversion rate):')
    for (const g of d.goals) lines.push(`  ${formatCount(g.visitors.value).padStart(6)}  ${g.label} · ${formatRate(g.rate)}${changeText(g.visitors, d.comparable)}`)
    html(
      `<h2 style="font-size:14px;margin:20px 0 6px;">Goals</h2><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px;">` +
        d.goals
          .map(
            (g) =>
              `<tr><td style="${td}">${escapeHtml(g.label)}</td><td style="${num}">${formatCount(g.visitors.value)} <span style="color:#666;">visitor-day${g.visitors.value === 1 ? '' : 's'} · ${escapeHtml(formatRate(g.rate))}${escapeHtml(changeText(g.visitors, d.comparable))}</span></td></tr>`,
          )
          .join('') +
        `</table>`,
    )
  } else {
    lines.push('', 'Goals: none reached this week.')
    html('<p style="font-size:13px;margin:20px 0 0;">Goals: none reached this week.</p>')
  }

  if (d.funnel.length && d.funnel[0].visitors > 0) {
    const text = d.funnel.map((s) => `${s.label} ${formatCount(s.visitors)}`).join(' → ')
    lines.push('', `Conversion (visitor-days): ${text}`)
    html(`<p style="font-size:13px;margin:16px 0 0;"><strong>Conversion</strong> (visitor-days): ${escapeHtml(text)}</p>`)
  }

  if (d.emptySearches.events > 0) {
    const s = `${formatCount(d.emptySearches.events)} search${d.emptySearches.events === 1 ? '' : 'es'} (${formatCount(d.emptySearches.texts)} different) found nothing — the texts are in the admin for 35 days.`
    lines.push('', s)
    html(`<p style="font-size:13px;margin:16px 0 0;">${escapeHtml(s)}</p>`)
  }

  if (d.published.length) {
    lines.push('', 'Published this week:')
    for (const p of d.published) lines.push(`  ${formatBucket(p.day)}  ${p.title} (${p.path})`)
    html(
      `<h2 style="font-size:14px;margin:20px 0 6px;">Published this week</h2><ul style="margin:0;padding-left:18px;font-size:13px;">` +
        d.published.map((p) => `<li>${escapeHtml(formatBucket(p.day))} — ${escapeHtml(p.title)} <span style="color:#666;">${escapeHtml(p.path)}</span></li>`).join('') +
        `</ul>`,
    )
  }

  if (d.vitals.length) {
    const text = d.vitals.map((v) => `${v.name} ${formatVital(v.name, v.p75)} (${RATING_TEXT[v.rating]})`).join(' · ')
    lines.push('', `Web Vitals, all pages, p75 over the last 7 days: ${text}`)
    html(`<p style="font-size:13px;margin:16px 0 0;"><strong>Web Vitals</strong>, all pages, p75 over the last 7 days: ${escapeHtml(text)}</p>`)
  }

  lines.push('', `Explore the week: ${d.adminUrl}`, '', 'Counted without cookies or identifiers; a visitor-day is one visitor on one UTC day.')
  lines.push('Turn this e-mail off in Admin → Analytics → Weekly digest.')
  html(
    `<p style="margin:24px 0 0;"><a href="${escapeHtml(d.adminUrl)}" style="color:#4338ca;">Explore the week in the admin →</a></p>` +
      `<p style="margin:16px 0 0;color:#666;font-size:12px;">Counted without cookies or identifiers; a visitor-day is one visitor on one UTC day. Turn this e-mail off in Admin → Analytics → Weekly digest.</p>`,
  )

  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:24px;background:#ffffff;color:#111;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;">${sections.join('')}</div></body></html>`
  return { subject, text: `${lines.join('\n')}\n`, html: body }
}

/** The week before `week`. */
export function weekBefore(week: DaySpan): DaySpan {
  return { from: dayMinus(week.from, 7), to: dayMinus(week.to, 7) }
}
