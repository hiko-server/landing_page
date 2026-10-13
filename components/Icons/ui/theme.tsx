import { makeUiIcon } from './base'

/**
 * Theme preference icons (the header theme menu and the command palette,
 * both loaded on demand) and the check mark. Lucide (ISC / MIT, see
 * ./base.tsx).
 */

export const MonitorIcon = /*#__PURE__*/ makeUiIcon('MonitorIcon', [
  ['rect', { width: '20', height: '14', x: '2', y: '3', rx: '2' }],
  ['line', { x1: '8', x2: '16', y1: '21', y2: '21' }],
  ['line', { x1: '12', x2: '12', y1: '17', y2: '21' }],
])

export const SunIcon = /*#__PURE__*/ makeUiIcon('SunIcon', [
  ['circle', { cx: '12', cy: '12', r: '4' }],
  ['path', { d: 'M12 2v2' }],
  ['path', { d: 'M12 20v2' }],
  ['path', { d: 'm4.93 4.93 1.41 1.41' }],
  ['path', { d: 'm17.66 17.66 1.41 1.41' }],
  ['path', { d: 'M2 12h2' }],
  ['path', { d: 'M20 12h2' }],
  ['path', { d: 'm6.34 17.66-1.41 1.41' }],
  ['path', { d: 'm19.07 4.93-1.41 1.41' }],
])

export const MoonIcon = /*#__PURE__*/ makeUiIcon('MoonIcon', [
  ['path', { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }],
])

export const CheckIcon = /*#__PURE__*/ makeUiIcon('CheckIcon', [['path', { d: 'M20 6 9 17l-5-5' }]])
