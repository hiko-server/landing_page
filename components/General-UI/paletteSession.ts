/**
 * The ⌘K palette's openings — the framework-free part (unit-tested).
 *
 * Every opening mounts a fresh dialog (`key`). A reopen while the last
 * dialog is still on its way out never brings that one back: after the
 * palette opened a page, the route transition holds the leaving dialog
 * hidden (lib/viewTransition liftDismissibleLayers) until it settles, and a
 * dialog re-entered then could not take focus — the focus trap parked it on
 * the modal container (seen with the CPU slowed 6×); a half-faded one would
 * also keep its opacity when reopened from the keyboard (no entrance).
 *
 * Because the leaving dialog is dropped at once, the palette decides where
 * focus returns itself (the focus trap of a fresh dialog would only know
 * what had focus when it mounted — nothing, at that point):
 *
 *   - a fresh opening returns to what had focus when it opened (as before);
 *   - a reopen that cut a leaving dialog short keeps that dialog's opener
 *     when its close handed focus back, and returns to the start of the page
 *     (lib routeFocus focusPageStart) when the close opened a page — the new
 *     page's content is where focus would have gone;
 *   - a close that opens a page, or that a newer opening replaced, moves
 *     nothing (the new page or the new dialog takes focus).
 *
 * The route transition hides every overlay on screen as the page changes; a
 * palette opened while the next page was loading is not leaving, so
 * CommandPalette shows its layers again at once (they carry their opening's
 * key, `data-palette-session`).
 */

/** Where focus returns: an element, 'page' (the start of the page's content), or null (leave it alone). */
export type FocusReturn<T> = T | 'page' | null

export type PaletteSession<T> = {
  open: boolean
  /** Key of the dialog: a new one for every opening. */
  key: number
  /** The last dialog is still leaving (its exit has not completed). */
  leaving: boolean
  /** Whether the last close hands focus back (false: it opened a page, which takes focus). */
  restores: boolean
  /** Where focus returns when this opening ends. */
  opener: FocusReturn<T>
  /** This opening cut a leaving dialog short: what that dialog's choice left to run, runs now. */
  interrupted: boolean
}

export function initialSession<T>(open: boolean, focused: T | null = null): PaletteSession<T> {
  return { open, key: open ? 1 : 0, leaving: false, restores: true, opener: open ? focused : null, interrupted: false }
}

/**
 * The session after `isOpen` changed. `focused`: what has focus as it opens
 * (ignored when closing); `restores`: whether this close hands focus back
 * (ignored when opening).
 */
export function sessionAfterToggle<T>(s: PaletteSession<T>, isOpen: boolean, ctx: { focused: T | null; restores: boolean }): PaletteSession<T> {
  if (isOpen === s.open) return s
  if (!isOpen) return { ...s, open: false, leaving: true, restores: ctx.restores, interrupted: false }
  const opener: FocusReturn<T> = !s.leaving ? ctx.focused : s.restores ? s.opener : 'page'
  return { open: true, key: s.key + 1, leaving: false, restores: true, opener, interrupted: s.leaving }
}

/** The last dialog has left (its exit completed). */
export function sessionAfterExit<T>(s: PaletteSession<T>): PaletteSession<T> {
  return s.leaving ? { ...s, leaving: false } : s
}

/**
 * Where focus goes as a dialog closes for good. `open`: the palette is open
 * again (a newer dialog took over); `restores`: this close hands focus back;
 * `usable`: whether an element can take focus back (still in the document,
 * not the body).
 */
export function focusReturnTarget<T>(
  s: Pick<PaletteSession<T>, 'opener'>,
  now: { open: boolean; restores: boolean },
  usable: (el: T) => 'yes' | 'gone' | 'body',
): FocusReturn<T> {
  if (now.open || !now.restores) return null
  const opener = s.opener
  if (opener === null || opener === 'page') return opener
  const state = usable(opener)
  if (state === 'yes') return opener
  // The opener left the page meanwhile: the start of the content, like a page change.
  if (state === 'gone') return 'page'
  return null
}
