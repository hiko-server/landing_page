import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast, type ToastId } from '@chakra-ui/react'
import { createDeleteQueue } from './deleteQueue'
import UndoToast from './UndoToast'

/**
 * Delete with Undo for the admin Inbox (rules: deleteQueue.ts). `commit`
 * sends the delete (with `keepalive` when the page is going away) and
 * resolves true on success; `onDeleted` drops the ids from the caller's
 * list, `onFailed` is told when a delete did not go through (the messages
 * are shown again).
 */

export const UNDO_MS = 8000

type Options = {
  commit: (ids: string[], keepalive: boolean) => Promise<boolean>
  onDeleted: (ids: string[]) => void
  onFailed: (ids: string[]) => void
  /** Undo brought these back (the caller may reopen them). */
  onRestored?: (ids: string[]) => void
  undoKeys?: string
}

export function useDeferredDelete({ commit, onDeleted, onFailed, onRestored, undoKeys }: Options) {
  const toast = useToast()
  const queue = useRef(createDeleteQueue()).current
  const toasts = useRef(new Map<number, ToastId>())
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  const opts = useRef({ commit, onDeleted, onFailed, onRestored })
  opts.current = { commit, onDeleted, onFailed, onRestored }

  const sync = useCallback(() => setHidden(queue.hidden()), [queue])

  const send = useCallback(
    async (key: number, ids: string[], keepalive: boolean) => {
      let ok = false
      try {
        ok = await opts.current.commit(ids, keepalive)
      } catch {
        ok = false
      }
      const restore = queue.settle(key, ok)
      if (ok) opts.current.onDeleted(ids)
      else opts.current.onFailed(restore)
      sync()
    },
    [queue, sync],
  )

  const finalize = useCallback(
    (key: number) => {
      toasts.current.delete(key)
      const ids = queue.take(key)
      if (ids) void send(key, ids, false)
    },
    [queue, send],
  )

  const undo = useCallback(
    (key: number) => {
      const ids = queue.undo(key)
      const id = toasts.current.get(key)
      toasts.current.delete(key)
      if (id !== undefined) toast.close(id)
      sync()
      if (ids) opts.current.onRestored?.(ids)
      return ids
    },
    [queue, sync, toast],
  )

  const remove = useCallback(
    (ids: string[]) => {
      const batch = queue.add(ids)
      if (!batch) return
      sync()
      const n = batch.ids.length
      const title = n === 1 ? 'Message deleted' : `${n} messages deleted`
      const id = toast({
        position: 'bottom-right',
        duration: UNDO_MS,
        onCloseComplete: () => finalize(batch.key),
        render: ({ onClose }) => <UndoToast title={title} undoKeys={undoKeys} onUndo={() => undo(batch.key)} onClose={onClose} />,
      })
      toasts.current.set(batch.key, id)
    },
    [queue, sync, toast, finalize, undo, undoKeys],
  )

  /** Undo the newest delete still pending (⌘Z); false when there is none. */
  const undoLast = useCallback(() => {
    const key = queue.lastPending()
    if (key === null) return false
    return !!undo(key)
  }, [queue, undo])

  // The page is going away: send what is pending now (keepalive survives unload).
  const flush = useCallback(() => {
    for (const [key, ids] of queue.takeAll()) {
      const id = toasts.current.get(key)
      toasts.current.delete(key)
      if (id !== undefined) toast.close(id)
      void send(key, ids, true)
    }
  }, [queue, send, toast])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      // Leaving the Inbox (another tab or page): nothing pending may be lost.
      flush()
    }
  }, [flush])

  return { hidden, remove, undoLast }
}
