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

// Article callouts (`> [!NOTE]` …, components/MDX/Callout): one icon per type.
export const InfoIcon = /*#__PURE__*/ makeUiIcon('InfoIcon', [
  ['circle', { cx: '12', cy: '12', r: '10' }],
  ['path', { d: 'M12 16v-4' }],
  ['path', { d: 'M12 8h.01' }],
])

export const LightbulbIcon = /*#__PURE__*/ makeUiIcon('LightbulbIcon', [
  ['path', { d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5' }],
  ['path', { d: 'M9 18h6' }],
  ['path', { d: 'M10 22h4' }],
])

export const MessageSquareWarningIcon = /*#__PURE__*/ makeUiIcon('MessageSquareWarningIcon', [
  ['path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }],
  ['path', { d: 'M12 7v2' }],
  ['path', { d: 'M12 13h.01' }],
])

export const TriangleAlertIcon = /*#__PURE__*/ makeUiIcon('TriangleAlertIcon', [
  ['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }],
  ['path', { d: 'M12 9v4' }],
  ['path', { d: 'M12 17h.01' }],
])

export const OctagonAlertIcon = /*#__PURE__*/ makeUiIcon('OctagonAlertIcon', [
  ['path', { d: 'M12 16h.01' }],
  ['path', { d: 'M12 8v4' }],
  [
    'path',
    {
      d: 'M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z',
    },
  ],
])

// The article share row (components/Article/ArticleEnd).
export const CopyIcon = /*#__PURE__*/ makeUiIcon('CopyIcon', [
  ['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }],
  ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
])

export const ShareIcon = /*#__PURE__*/ makeUiIcon('ShareIcon', [
  ['path', { d: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8' }],
  ['polyline', { points: '16 6 12 2 8 6' }],
  ['line', { x1: '12', x2: '12', y1: '2', y2: '15' }],
])

export const QrCodeIcon = /*#__PURE__*/ makeUiIcon('QrCodeIcon', [
  ['rect', { width: '5', height: '5', x: '3', y: '3', rx: '1' }],
  ['rect', { width: '5', height: '5', x: '16', y: '3', rx: '1' }],
  ['rect', { width: '5', height: '5', x: '3', y: '16', rx: '1' }],
  ['path', { d: 'M21 16h-3a2 2 0 0 0-2 2v3' }],
  ['path', { d: 'M21 21v.01' }],
  ['path', { d: 'M12 7v3a2 2 0 0 1-2 2H7' }],
  ['path', { d: 'M3 12h.01' }],
  ['path', { d: 'M12 3h.01' }],
  ['path', { d: 'M12 16v.01' }],
  ['path', { d: 'M16 12h1' }],
  ['path', { d: 'M21 12v.01' }],
  ['path', { d: 'M12 21v-1' }],
])

/** Lucide "languages": the article's language switch (F2). */
export const LanguagesIcon = /*#__PURE__*/ makeUiIcon('LanguagesIcon', [
  ['path', { d: 'm5 8 6 6' }],
  ['path', { d: 'm4 14 6-6 2-3' }],
  ['path', { d: 'M2 5h12' }],
  ['path', { d: 'M7 2h1' }],
  ['path', { d: 'm22 22-5-10-5 10' }],
  ['path', { d: 'M14 18h6' }],
])

/** Lucide "lock": a privately shared CV (/cv/r/…, E4). */
export const LockIcon = /*#__PURE__*/ makeUiIcon('LockIcon', [
  ['rect', { x: '3', y: '11', width: '18', height: '11', rx: '2', ry: '2' }],
  ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
])
