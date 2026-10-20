/**
 * Dashboard tab ⇆ URL query mapping (pure — unit tested).
 *
 *   ?tab=home | cv | versions | storage | inbox | analytics   (legacy alias: history → versions)
 *   ?view=raw | variants                  (CV tab only: the raw JSON editor; CV
 *                                          variants and their private links, E4)
 */

// Order = Alt/⌃+1…6 shortcuts; new tabs go at the end so existing ones keep their keys.
export const DASHBOARD_TABS = ['home', 'cv', 'versions', 'storage', 'inbox', 'analytics'] as const
export type DashboardTab = (typeof DASHBOARD_TABS)[number]

export const CV_VIEWS = ['studio', 'raw', 'variants'] as const
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
  const v = first(query.view).toLowerCase()
  const view: CvView = tab === 'cv' && (CV_VIEWS as readonly string[]).includes(v) ? (v as CvView) : 'studio'
  return { tab, view }
}

/** Query for a tab / view, keeping unrelated params and dropping a stale ?view=. */
export function dashboardQuery(query: Query, tab: DashboardTab, view: CvView = 'studio'): Query {
  const next: Query = { ...query, tab }
  if (tab === 'cv' && view !== 'studio') next.view = view
  else delete next.view
  return next
}
