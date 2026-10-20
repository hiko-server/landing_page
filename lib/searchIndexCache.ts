/**
 * The content generation of the search index (GET /api/search-index, built
 * by lib/searchIndex.ts searchIndexPayload): a process-wide counter that
 * every content or CV save bumps (lib/revalidate.ts → invalidateSearchIndex),
 * so the next request rebuilds the index — documents and "Ask" passages —
 * from the saved content, the way an ISR page is regenerated.
 *
 * Dependency-free on purpose: lib/revalidate.ts imports it without pulling
 * the index builder (and its Markdown parsers) into every write route.
 * The counter lives on globalThis because Next bundles each API route
 * separately; module state would not be shared between them.
 */

type GenerationGlobal = typeof globalThis & { __searchIndexGeneration?: number }

/** The current generation (0 until the first save). */
export function searchIndexGeneration(): number {
  return (globalThis as GenerationGlobal).__searchIndexGeneration ?? 0
}

/** Mark the built index stale: the next request rebuilds it. */
export function invalidateSearchIndex(): number {
  const g = globalThis as GenerationGlobal
  g.__searchIndexGeneration = (g.__searchIndexGeneration ?? 0) + 1
  return g.__searchIndexGeneration
}
