import { makeUiIcon } from './base'

/**
 * Icons of "Ask Lucian" (the palette's Ask view, the entry on /about and
 * /contact): the palette chunk and those pages only. Lucide (ISC / MIT, see
 * ./base.tsx).
 */

export const MessageCircleQuestionIcon = /*#__PURE__*/ makeUiIcon('MessageCircleQuestionIcon', [
  ['path', { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }],
  ['path', { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' }],
  ['path', { d: 'M12 17h.01' }],
])

export const QuoteIcon = /*#__PURE__*/ makeUiIcon('QuoteIcon', [
  ['path', { d: 'M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z' }],
  ['path', { d: 'M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z' }],
])

export const CornerDownLeftIcon = /*#__PURE__*/ makeUiIcon('CornerDownLeftIcon', [
  ['polyline', { points: '9 10 4 15 9 20' }],
  ['path', { d: 'M20 4v7a4 4 0 0 1-4 4H4' }],
])

export const ArrowUpRightIcon = /*#__PURE__*/ makeUiIcon('ArrowUpRightIcon', [
  ['path', { d: 'M7 7h10v10' }],
  ['path', { d: 'M7 17 17 7' }],
])

export const MailIcon = /*#__PURE__*/ makeUiIcon('MailIcon', [
  ['rect', { width: '20', height: '16', x: '2', y: '4', rx: '2' }],
  ['path', { d: 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' }],
])
