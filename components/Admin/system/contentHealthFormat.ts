import {
  FIX_LABEL,
  HEALTH_CHECKS,
  SEVERITIES,
  type HealthCheck,
  type HealthFixType,
  type HealthIssue,
  type HealthItem,
  type LinkHealth,
  type Severity,
} from '../../../lib/contentHealth/types'

/**
 * Pure helpers of the Content health view (unit-tested): filtering,
 * grouping by item, the bulk-fix summary and the link checker's status line.
 */

export type IssueFilter = { severity: Severity | null; check: HealthCheck | ''; item: string }

export const NO_FILTER: IssueFilter = { severity: null, check: '', item: '' }

export function filterIssues(issues: readonly HealthIssue[], f: IssueFilter): HealthIssue[] {
  return issues.filter(
    (i) =>
      (!f.severity || i.severity === f.severity) &&
      (!f.check || i.check === f.check) &&
      (!f.item || i.item === f.item)
  )
}

export function isFiltered(f: IssueFilter): boolean {
  return !!(f.severity || f.check || f.item)
}

export type SeverityCounts = Record<Severity, number>

export type IssueGroup = { item: HealthItem; issues: HealthIssue[]; counts: SeverityCounts }

const RANK: Record<Severity, number> = { error: 0, warning: 1, notice: 2 }

const emptyCounts = (): SeverityCounts => ({ error: 0, warning: 0, notice: 0 })

/**
 * Issues grouped by the content they are in: the worst first (most errors,
 * then warnings), inside a group by severity and then by line.
 */
export function groupIssues(
  items: Readonly<Record<string, HealthItem>>,
  issues: readonly HealthIssue[]
): IssueGroup[] {
  const map = new Map<string, IssueGroup>()
  for (const issue of issues) {
    const item = items[issue.item]
    if (!item) continue
    const g = map.get(issue.item) || { item, issues: [], counts: emptyCounts() }
    g.issues.push(issue)
    g.counts[issue.severity]++
    map.set(issue.item, g)
  }
  const groups = Array.from(map.values())
  for (const g of groups) {
    g.issues.sort(
      (a, b) =>
        RANK[a.severity] - RANK[b.severity] ||
        (a.line ?? 0) - (b.line ?? 0) ||
        a.where.localeCompare(b.where)
    )
  }
  return groups.sort(
    (a, b) =>
      b.counts.error - a.counts.error ||
      b.counts.warning - a.counts.warning ||
      b.counts.notice - a.counts.notice ||
      a.item.title.localeCompare(b.item.title)
  )
}

/** Per item, how many issues of each severity ("2 errors · 1 warning"). */
export function countsLine(c: SeverityCounts): string {
  return SEVERITIES.filter((s) => c[s])
    .map((s) => `${c[s]} ${c[s] === 1 ? s : `${s}s`}`)
    .join(' · ')
}

/** What "Apply all safe fixes" will do, one line per kind of fix. */
export function fixSummary(
  issues: readonly HealthIssue[]
): Array<{ type: HealthFixType; count: number; text: string }> {
  const n = new Map<HealthFixType, number>()
  const items = new Map<HealthFixType, Set<string>>()
  for (const i of issues) {
    if (!i.fix) continue
    n.set(i.fix.type, (n.get(i.fix.type) || 0) + 1)
    items.set(i.fix.type, (items.get(i.fix.type) || new Set()).add(i.item))
  }
  const perItem = new Set<HealthFixType>(['paragraph-breaks', 'visible-breaks'])
  return Array.from(n.entries()).map(([type, count]) => {
    const k = perItem.has(type) ? (items.get(type)?.size ?? count) : count
    return { type, count, text: FIX_LABEL[type].summary(k) }
  })
}

/** Distinct items a set of fixes will save. */
export function itemsTouched(issues: readonly HealthIssue[]): number {
  return new Set(
    issues.filter((i) => i.fix && i.fix.type !== 'generate-variants').map((i) => i.item)
  ).size
}

/** Checks that have at least one issue, in the canonical order, with counts. */
export function checkOptions(
  byCheck: Partial<Record<HealthCheck, number>>
): Array<{ check: HealthCheck; count: number }> {
  return HEALTH_CHECKS.filter((c) => (byCheck[c] || 0) > 0).map((c) => ({
    check: c,
    count: byCheck[c] as number,
  }))
}

/** "github.com/example/repo" — protocol and trailing slash dropped, long ones shortened in the middle. */
export function shortUrl(url: string, max = 72): string {
  const s = url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  if (s.length <= max) return s
  const head = Math.ceil((max - 1) * 0.6)
  return `${s.slice(0, head)}…${s.slice(s.length - (max - 1 - head))}`
}

/** The link checker's state in one line. */
export function linkStatusLine(
  links: Pick<
    LinkHealth,
    'running' | 'progress' | 'lastRun' | 'nextAt' | 'intervalHours' | 'total' | 'checked'
  >,
  relative: (ms: number) => string
): string {
  if (links.running) {
    const p = links.progress
    return p && p.total ? `Checking ${p.done} of ${p.total}…` : 'Starting the check…'
  }
  const parts: string[] = []
  const run = links.lastRun
  if (!run) parts.push(links.total ? 'Not checked yet' : 'No external links')
  else if (run.error) parts.push(`Last check failed ${relative(run.finishedAt ?? run.startedAt)}`)
  else
    parts.push(
      `Checked ${relative(run.finishedAt ?? run.startedAt)}${run.partial ? ' (partly)' : ''}`
    )
  // Before the first run every link is unchecked: "Not checked yet" says it already.
  if (run && links.total && links.checked < links.total)
    parts.push(`${links.total - links.checked} not checked yet`)
  if (links.intervalHours <= 0) parts.push('daily check off')
  else if (links.nextAt) parts.push(`next ${relative(links.nextAt)}`)
  return parts.join(' · ')
}
