/**
 * Deferred deletes of the admin Inbox (pure — unit tested; driven by
 * useDeferredDelete).
 *
 * Deleting hides the messages at once and offers Undo; the request is sent
 * only when the Undo toast closes, or right away (keepalive) when the page is
 * hidden or left, or another view replaces the Inbox. A batch is
 *
 *   pending ──undo──▶ undone (shown again, nothing sent)
 *      │
 *      └─take──▶ committing ──settle(ok)──▶ done (gone for good)
 *                     └──────settle(fail)──▶ done (shown again)
 */

export type BatchState = 'pending' | 'undone' | 'committing' | 'done'
export type DeleteBatch = { key: number; ids: string[]; state: BatchState }

export function createDeleteQueue() {
  let seq = 0
  const batches = new Map<number, DeleteBatch>()

  const drop = (key: number) => batches.delete(key)

  return {
    /** Hide `ids` (duplicates of hidden ids are ignored); returns the batch, or null when nothing new. */
    add(ids: readonly string[]): DeleteBatch | null {
      const hidden = this.hidden()
      const fresh = Array.from(new Set(ids)).filter((id) => !hidden.has(id))
      if (!fresh.length) return null
      const batch: DeleteBatch = { key: ++seq, ids: fresh, state: 'pending' }
      batches.set(batch.key, batch)
      return batch
    },
    /** Undo a pending batch: its ids, or null when it is already being sent (too late). */
    undo(key: number): string[] | null {
      const b = batches.get(key)
      if (!b || b.state !== 'pending') return null
      b.state = 'undone'
      drop(key)
      return b.ids
    },
    /** Start sending a pending batch: its ids, or null when it was undone or is already sent. */
    take(key: number): string[] | null {
      const b = batches.get(key)
      if (!b || b.state !== 'pending') return null
      b.state = 'committing'
      return b.ids
    },
    /** Start sending every pending batch (page hidden / left): [key, ids] pairs. */
    takeAll(): Array<[number, string[]]> {
      const out: Array<[number, string[]]> = []
      for (const b of batches.values()) {
        if (b.state !== 'pending') continue
        b.state = 'committing'
        out.push([b.key, b.ids])
      }
      return out
    },
    /** The request finished: on failure the ids are returned so they can be shown again. */
    settle(key: number, ok: boolean): string[] {
      const b = batches.get(key)
      if (!b) return []
      b.state = 'done'
      drop(key)
      return ok ? [] : b.ids
    },
    /** Newest batch that can still be undone. */
    lastPending(): number | null {
      let last: number | null = null
      for (const b of batches.values()) if (b.state === 'pending') last = b.key
      return last
    },
    /** Ids hidden from the list right now (pending or being sent). */
    hidden(): Set<string> {
      const out = new Set<string>()
      for (const b of batches.values()) if (b.state === 'pending' || b.state === 'committing') b.ids.forEach((id) => out.add(id))
      return out
    },
    get size() {
      return batches.size
    },
  }
}

export type DeleteQueue = ReturnType<typeof createDeleteQueue>
