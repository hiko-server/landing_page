import { makeUiIcon } from './base'

/**
 * Icons of page content (home widgets, work, CV, contact, lightbox): page
 * chunks only. Lucide (ISC / MIT, see ./base.tsx).
 */

export const ChevronRightIcon = /*#__PURE__*/ makeUiIcon('ChevronRightIcon', [
  ['path', { d: 'm9 18 6-6-6-6' }],
])

export const ArrowLeftIcon = /*#__PURE__*/ makeUiIcon('ArrowLeftIcon', [
  ['path', { d: 'm12 19-7-7 7-7' }],
  ['path', { d: 'M19 12H5' }],
])

export const ArrowRightIcon = /*#__PURE__*/ makeUiIcon('ArrowRightIcon', [
  ['path', { d: 'M5 12h14' }],
  ['path', { d: 'm12 5 7 7-7 7' }],
])

export const StarIcon = /*#__PURE__*/ makeUiIcon('StarIcon', [
  [
    'path',
    {
      d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
    },
  ],
])

export const PlayIcon = /*#__PURE__*/ makeUiIcon('PlayIcon', [
  ['polygon', { points: '6 3 20 12 6 21 6 3' }],
])

export const PauseIcon = /*#__PURE__*/ makeUiIcon('PauseIcon', [
  ['rect', { x: '14', y: '4', width: '4', height: '16', rx: '1' }],
  ['rect', { x: '6', y: '4', width: '4', height: '16', rx: '1' }],
])

export const PlusIcon = /*#__PURE__*/ makeUiIcon('PlusIcon', [
  ['path', { d: 'M5 12h14' }],
  ['path', { d: 'M12 5v14' }],
])

export const ZapIcon = /*#__PURE__*/ makeUiIcon('ZapIcon', [
  [
    'path',
    {
      d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
    },
  ],
])

export const CircleAlertIcon = /*#__PURE__*/ makeUiIcon('CircleAlertIcon', [
  ['circle', { cx: '12', cy: '12', r: '10' }],
  ['line', { x1: '12', x2: '12', y1: '8', y2: '12' }],
  ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16' }],
])

export const EllipsisIcon = /*#__PURE__*/ makeUiIcon('EllipsisIcon', [
  ['circle', { cx: '12', cy: '12', r: '1' }],
  ['circle', { cx: '19', cy: '12', r: '1' }],
  ['circle', { cx: '5', cy: '12', r: '1' }],
])

export const LinkIcon = /*#__PURE__*/ makeUiIcon('LinkIcon', [
  ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
  ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }],
])

export const PrinterIcon = /*#__PURE__*/ makeUiIcon('PrinterIcon', [
  ['path', { d: 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2' }],
  ['path', { d: 'M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6' }],
  ['rect', { x: '6', y: '14', width: '12', height: '8', rx: '1' }],
])

export const FileDownIcon = /*#__PURE__*/ makeUiIcon('FileDownIcon', [
  ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
  ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
  ['path', { d: 'M12 18v-6' }],
  ['path', { d: 'm9 15 3 3 3-3' }],
])

export const CodeIcon = /*#__PURE__*/ makeUiIcon('CodeIcon', [
  ['polyline', { points: '16 18 22 12 16 6' }],
  ['polyline', { points: '8 6 2 12 8 18' }],
])

export const GitBranchIcon = /*#__PURE__*/ makeUiIcon('GitBranchIcon', [
  ['line', { x1: '6', x2: '6', y1: '3', y2: '15' }],
  ['circle', { cx: '18', cy: '6', r: '3' }],
  ['circle', { cx: '6', cy: '18', r: '3' }],
  ['path', { d: 'M18 9a9 9 0 0 1-9 9' }],
])

export const GitForkIcon = /*#__PURE__*/ makeUiIcon('GitForkIcon', [
  ['circle', { cx: '12', cy: '18', r: '3' }],
  ['circle', { cx: '6', cy: '6', r: '3' }],
  ['circle', { cx: '18', cy: '6', r: '3' }],
  ['path', { d: 'M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9' }],
  ['path', { d: 'M12 12v3' }],
])
