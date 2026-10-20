/**
 * Pure rules that keep the rich editor's React tree and TipTap in step
 * without feedback loops (components/Admin/RichEditor.tsx).
 *
 * The loop this guards against: every TipTap transaction re-rendered the
 * whole editor; the bubble menus (LinkBubble / ImageBubble) pass fresh
 * `options` / `shouldShow` props on every render, and TipTap's <BubbleMenu>
 * answers changed props by dispatching an "updateOptions" transaction —
 * which re-rendered the editor again. React stopped it with error #185
 * (maximum update depth exceeded) as soon as any parent render (e.g. the
 * "Changed elsewhere" dialog opening after a 409) started the cycle.
 *
 * The rules:
 *   - React components subscribe to editor *state* through selectors whose
 *     result only changes when something they render changes
 *     (sameViewSnapshot / sameToolbarState). A transaction that carries only
 *     plugin metadata keeps the same doc, selection and stored marks, so it
 *     never re-renders a subscriber.
 *   - A `value` coming from the parent is applied to TipTap only when it
 *     differs from what TipTap holds (planVisualSync); programmatic content
 *     changes never emit updates, so they can't echo back as edits.
 */

/** Markdown compared for content equality: line endings and trailing whitespace don't count. */
export function normalizeMarkdown(md: string): string {
  return md.replace(/\r\n?/g, '\n').replace(/\s+$/, '')
}

export function sameMarkdown(a: string, b: string): boolean {
  return a === b || normalizeMarkdown(a) === normalizeMarkdown(b)
}

/** What the visual editor must do to show `value`. */
export type VisualSync = 'none' | 'record' | 'apply'

/**
 * Decide whether TipTap needs `value`:
 *   - 'none'   it already holds that content (`lastApplied`, the content it
 *              was last given or last serialised);
 *   - 'record' its document already serialises to `value` (only the
 *              bookkeeping changes);
 *   - 'apply'  set the content — always with updates suppressed, so the
 *              change never comes back through onChange.
 * `currentMarkdown` serialises TipTap's document on demand; it is only
 * consulted when `value` differs from `lastApplied`.
 */
export function planVisualSync(value: string, lastApplied: string, currentMarkdown?: () => string | null): VisualSync {
  if (sameMarkdown(value, lastApplied)) return 'none'
  const current = currentMarkdown ? currentMarkdown() : null
  if (current !== null && sameMarkdown(value, current)) return 'record'
  return 'apply'
}

/** The parts of a ProseMirror state a bubble menu renders from. */
export type ViewSnapshot = {
  doc: unknown
  selection: unknown
  storedMarks: unknown
  editable: boolean
}

type StateLike = { doc: unknown; selection: unknown; storedMarks: unknown }

export function viewSnapshot(state: StateLike, editable: boolean): ViewSnapshot {
  return { doc: state.doc, selection: state.selection, storedMarks: state.storedMarks, editable }
}

/**
 * Identity comparison: ProseMirror keeps the doc, selection and stored-marks
 * objects when a transaction has no steps and sets no selection or marks, so
 * metadata-only transactions (bubble-menu option updates, show / hide
 * signals, focus bookkeeping) compare equal.
 */
export function sameViewSnapshot(a: ViewSnapshot | null, b: ViewSnapshot | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.doc === b.doc && a.selection === b.selection && a.storedMarks === b.storedMarks && a.editable === b.editable
}

/** What the formatting toolbar shows. */
export type ToolbarState = {
  heading2: boolean
  bold: boolean
  italic: boolean
  strike: boolean
  code: boolean
  bulletList: boolean
  orderedList: boolean
  blockquote: boolean
  codeBlock: boolean
  link: boolean
  table: boolean
  callout: boolean
  canUndo: boolean
  canRedo: boolean
}

export const EMPTY_TOOLBAR_STATE: ToolbarState = {
  heading2: false,
  bold: false,
  italic: false,
  strike: false,
  code: false,
  bulletList: false,
  orderedList: false,
  blockquote: false,
  codeBlock: false,
  link: false,
  table: false,
  callout: false,
  canUndo: false,
  canRedo: false,
}

export function sameToolbarState(a: ToolbarState | null, b: ToolbarState | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (Object.keys(EMPTY_TOOLBAR_STATE) as (keyof ToolbarState)[]).every((k) => a[k] === b[k])
}
