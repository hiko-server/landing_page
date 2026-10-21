import { makeUiIcon } from './base'

/**
 * The signed-in owner's header menu (components/Header/AdminMenu — its own
 * chunk, fetched only once the visitor is known to be signed in). Lucide
 * (ISC, see ./base.tsx).
 */

/** Lucide "layout-dashboard": the menu's trigger and its Dashboard item. */
export const DashboardIcon = /*#__PURE__*/ makeUiIcon('DashboardIcon', [
  ['rect', { width: '7', height: '9', x: '3', y: '3', rx: '1' }],
  ['rect', { width: '7', height: '5', x: '14', y: '3', rx: '1' }],
  ['rect', { width: '7', height: '9', x: '14', y: '12', rx: '1' }],
  ['rect', { width: '7', height: '5', x: '3', y: '16', rx: '1' }],
])

/** Lucide "log-out". */
export const LogOutIcon = /*#__PURE__*/ makeUiIcon('LogOutIcon', [
  ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }],
  ['polyline', { points: '16 17 21 12 16 7' }],
  ['line', { x1: '21', x2: '9', y1: '12', y2: '12' }],
])
