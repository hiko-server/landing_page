import { makeUiIcon } from './base'

/**
 * Icons of the persistent chrome (header, footer, scroll-to-top): they ship
 * in the shared bundle, so keep this file small. Lucide (ISC / MIT, see
 * ./base.tsx).
 */

export const SearchIcon = /*#__PURE__*/ makeUiIcon('SearchIcon', [
  ['circle', { cx: '11', cy: '11', r: '8' }],
  ['path', { d: 'm21 21-4.3-4.3' }],
])

export const MenuIcon = /*#__PURE__*/ makeUiIcon('MenuIcon', [
  ['line', { x1: '4', x2: '20', y1: '12', y2: '12' }],
  ['line', { x1: '4', x2: '20', y1: '6', y2: '6' }],
  ['line', { x1: '4', x2: '20', y1: '18', y2: '18' }],
])

export const ChevronDownIcon = /*#__PURE__*/ makeUiIcon('ChevronDownIcon', [
  ['path', { d: 'm6 9 6 6 6-6' }],
])

export const ArrowUpIcon = /*#__PURE__*/ makeUiIcon('ArrowUpIcon', [
  ['path', { d: 'm5 12 7-7 7 7' }],
  ['path', { d: 'M12 19V5' }],
])

/** Lucide "languages": the header's language switch (F3) and an article's (F2). */
export const LanguagesIcon = /*#__PURE__*/ makeUiIcon('LanguagesIcon', [
  ['path', { d: 'm5 8 6 6' }],
  ['path', { d: 'm4 14 6-6 2-3' }],
  ['path', { d: 'M2 5h12' }],
  ['path', { d: 'M7 2h1' }],
  ['path', { d: 'm22 22-5-10-5 10' }],
  ['path', { d: 'M14 18h6' }],
])
