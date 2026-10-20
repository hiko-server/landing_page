/**
 * Unpublished changes on live items (H4) — the editor-side rules, pure and
 * unit-tested (the server side is lib/pendingRevisions + lib/mdx-admin).
 *
 *   - A new item, publishing and unpublishing write the item itself.
 *   - Any other save of a PUBLISHED item stores a pending revision: the
 *     public page keeps the published version until "Publish changes".
 *   - Saves of a draft write the draft (nothing public to protect).
 */

export type SaveTarget = 'live' | 'pending'

export function saveTarget(input: {
  isNew: boolean
  /** The save changes the published state (publish: false, unpublish: true). */
  draftChange?: boolean
  /** The stored item is published (its live frontmatter has no truthy `draft`). */
  livePublished: boolean
  /** An explicit target wins (e.g. "Publish changes" → live). */
  explicit?: SaveTarget
}): SaveTarget {
  if (input.explicit) return input.explicit
  if (input.isNew || input.draftChange !== undefined) return 'live'
  return input.livePublished ? 'pending' : 'live'
}

export type PendingMeta = { updatedAt: number; baseUpdatedAt: number }

/** The live item changed after the pending revision was started (a restore, a rename, a tag merge). */
export function isPendingStale(pending: PendingMeta | null | undefined, liveUpdatedAt: number | null | undefined): boolean {
  if (!pending || !liveUpdatedAt) return false
  return pending.baseUpdatedAt > 0 && pending.baseUpdatedAt !== Math.trunc(liveUpdatedAt)
}

/**
 * What the editor's primary actions are for the item's state:
 *   draft      → Save draft + Publish…
 *   published  → Save changes (pending) + Publish changes…
 */
export type EditorMode = 'draft' | 'published'

export function editorMode(isNew: boolean, livePublished: boolean): EditorMode {
  return !isNew && livePublished ? 'published' : 'draft'
}

/** "Publish changes…" is offered once there is something to publish: saved pending changes or unsaved edits. */
export function canPublishChanges(input: { mode: EditorMode; hasPending: boolean; dirty: boolean }): boolean {
  return input.mode === 'published' && (input.hasPending || input.dirty)
}
