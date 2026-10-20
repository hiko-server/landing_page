/**
 * Editorial actions of the post / case-study tools, as events (H4, H6, H16).
 *
 * The admin audit log lives elsewhere (admin-ops); this module only lets it —
 * or anything else server-side — hear what the editorial tools did, without
 * a second log: subscribe once with onEditorialEvent() and every rename,
 * "Publish changes", discard, redirect removal, tag rename / merge and
 * content export is reported after it succeeded. A listener that throws is
 * ignored (an audit hiccup must never fail the write); listeners run
 * synchronously, so a slow one should queue its own work.
 *
 * Events carry slugs, tag names and counts — never bodies or personal data.
 * The second argument is the API request, for a listener that records who
 * and from where.
 *
 * The listener list lives on globalThis: Next bundles pages and API routes
 * into separate webpack runtimes, and a listener registered in one must hear
 * events emitted in another (the same reason lib/db keeps its handle there).
 */

export type EditorialEvent =
  | { action: 'publish-changes'; collection: 'blog' | 'work'; slug: string; markedUpdated: boolean }
  | { action: 'discard-changes'; collection: 'blog' | 'work'; slug: string }
  | { action: 'rename'; collection: 'blog' | 'work'; from: string; to: string; redirect: boolean; linksRewritten: number }
  | { action: 'redirect-removed'; collection: 'blog' | 'work'; from: string; to: string }
  | { action: 'tag-rename' | 'tag-merge'; collection: 'blog' | 'work'; from: string[]; to: string; items: number }
  | { action: 'content-export'; files: number; bytes: number }

export type EditorialListener = (event: EditorialEvent & { at: number }, context: { req?: unknown }) => void

type Registry = typeof globalThis & { __editorialListeners?: Set<EditorialListener> }

function listeners(): Set<EditorialListener> {
  const g = globalThis as Registry
  return (g.__editorialListeners ??= new Set())
}

/** Hear every editorial action; returns the unsubscribe function. */
export function onEditorialEvent(listener: EditorialListener): () => void {
  listeners().add(listener)
  return () => {
    listeners().delete(listener)
  }
}

/** Report a completed editorial action to every listener (never throws). */
export function emitEditorialEvent(event: EditorialEvent, context: { req?: unknown } = {}): void {
  const stamped = { ...event, at: Date.now() }
  for (const listener of Array.from(listeners())) {
    try {
      listener(stamped, context)
    } catch {
      // A failing listener never fails the action it reports.
    }
  }
}
