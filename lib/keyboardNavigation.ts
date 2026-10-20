/**
 * The keyboard layer's state and arithmetic (components/Chrome/
 * keyboardLayerActions.ts), framework-free so it is unit-tested: the
 * "G then …" chord, and J / K through the list on screen.
 *
 * A list item carries `data-kbd-item` (the /blog rows, the /work cards, the
 * /publications entries); the item's page, when it has one, is its
 * `data-vt-morph` pathname.
 */

/** How long the second key of a "G then …" sequence is awaited (ms). */
export const CHORD_MS = 1200

/** G with no second key for this long shows the hint (ms). */
export const CHORD_HINT_DELAY_MS = 450


export const LIST_ITEM_ATTR = 'data-kbd-item'

type Box = { top: number; bottom: number }

/**
 * The item reading starts from: the first one not hidden under the sticky
 * header (`topEdge`, px from the viewport top), or `count` when the list
 * lies entirely above it.
 */
export function anchorIndex(boxes: readonly Box[], topEdge: number): number {
  const i = boxes.findIndex((b) => b.bottom > topEdge + 1)
  return i === -1 ? boxes.length : i
}

/**
 * The item J (`step` 1) or K (-1) moves to. From an item that has focus, the
 * next / previous one (clamped at the ends, no wrap). Without one, J takes
 * the anchor item (the first one in view) and K the one before it, so the
 * first keypress never jumps away from what is on screen.
 */
export function stepIndex(current: number, anchor: number, count: number, step: 1 | -1): number {
  if (count <= 0) return -1
  const clamp = (i: number) => Math.min(count - 1, Math.max(0, i))
  if (current >= 0 && current < count) return clamp(current + step)
  return step > 0 ? clamp(anchor) : clamp(anchor - 1)
}

/**
 * The link J / K focuses in an item: the one that opens the item's own page
 * (`own`, its pathname), else its first link; -1 when the item has none (the
 * item itself then takes focus).
 */
export function primaryLinkIndex(paths: readonly string[], own: string | null): number {
  if (!paths.length) return -1
  if (own) {
    const i = paths.indexOf(own)
    if (i !== -1) return i
  }
  return 0
}

// ── "G then …" ──────────────────────────────────────────────────────────────

export type Chord = { armedUntil: number }

/** The chord state after G at `now`. */
export function armChord(now: number): Chord {
  return { armedUntil: now + CHORD_MS }
}

/** True while the second key of a "G then …" sequence is awaited. */
export function chordArmed(chord: Chord | null, now: number): boolean {
  return !!chord && now < chord.armedUntil
}
