/**
 * Dashboard tab ⇆ URL query mapping (pure — unit tested).
 *
 *   ?tab=home | cv | versions | storage   (legacy alias: history → versions)
 *   ?view=raw                             (CV tab only: the raw JSON editor)
 */

export const DASHBOARD_TABS = ['home', 'cv', 'versions', 'storage'] as const
export type DashboardTab = (typeof DASHBOARD_TABS)[number]

export const CV_VIEWS = ['studio', 'raw'] as const
export type CvView = (typeof CV_VIEWS)[number]

type Query = Record<string, string | string[] | undefined>

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

export function parseDashboardQuery(query: Query): { tab: DashboardTab; view: CvView } {
  const t = first(query.tab).toLowerCase()
  const tab: DashboardTab =
    t === 'history'
      ? 'versions'
      : (DASHBOARD_TABS as readonly string[]).includes(t)
        ? (t as DashboardTab)
        : 'home'
  const view: CvView = tab === 'cv' && first(query.view).toLowerCase() === 'raw' ? 'raw' : 'studio'
  return { tab, view }
}

/** Query for a tab / view, keeping unrelated params and dropping a stale ?view=. */
export function dashboardQuery(query: Query, tab: DashboardTab, view: CvView = 'studio'): Query {
  const next: Query = { ...query, tab }
  if (tab === 'cv' && view === 'raw') next.view = 'raw'
  else delete next.view
  return next
}
