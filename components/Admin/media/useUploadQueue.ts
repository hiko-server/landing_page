import { useCallback, useEffect, useRef, useState } from 'react'
import { fileProblem, uploadOne } from './api'
import { nextRunnable, nextWakeUp, summarize, type QueueItem } from './uploadQueue'

/**
 * Upload queue for the media library and the image picker (H7): add files
 * (picked or dropped), they go one at a time through
 * /api/admin/upload-image — the editors' pipeline — and `onUploaded` hears
 * each stored name. A 429 / 503 waits the server's Retry-After and carries
 * on; a failure stays in the list with Retry. Object URLs of the previews
 * are revoked when rows are cleared and on unmount.
 */
export function useUploadQueue(onUploaded: (name: string) => void) {
  const [items, setItems] = useState<QueueItem[]>([])
  const itemsRef = useRef(items)
  itemsRef.current = items
  const files = useRef(new Map<string, File>())
  const running = useRef(false)
  const timer = useRef<number | null>(null)
  const onUploadedRef = useRef(onUploaded)
  onUploadedRef.current = onUploaded
  const mounted = useRef(true)

  const patch = useCallback((id: string, change: Partial<QueueItem>) => {
    setItems((list) => {
      const next = list.map((i) => (i.id === id ? { ...i, ...change } : i))
      itemsRef.current = next
      return next
    })
  }, [])

  const run = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      for (;;) {
        if (!mounted.current) return
        const item = nextRunnable(itemsRef.current, Date.now())
        if (!item) break
        const file = files.current.get(item.id)
        if (!file) {
          patch(item.id, { status: 'error', error: 'The file is no longer available — add it again.' })
          continue
        }
        patch(item.id, { status: 'uploading', error: undefined, until: undefined })
        const out = await uploadOne(file)
        if (!mounted.current) return
        if (out.ok) {
          patch(item.id, { status: 'done', uploaded: out.name, warning: out.warning })
          files.current.delete(item.id)
          onUploadedRef.current(out.name)
        } else if (out.retryAfter) {
          patch(item.id, { status: 'waiting', until: Date.now() + out.retryAfter * 1000, error: out.error })
        } else {
          patch(item.id, { status: 'error', error: out.error })
        }
      }
    } finally {
      running.current = false
    }
    // Something is waiting for the server: come back when it may go.
    const wake = nextWakeUp(itemsRef.current)
    if (wake !== null && mounted.current) {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        timer.current = null
        void run()
      }, Math.max(250, wake - Date.now()))
    }
  }, [patch])

  const add = useCallback(
    (list: readonly File[]) => {
      if (!list.length) return
      const added: QueueItem[] = list.map((file) => {
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const problem = fileProblem(file)
        if (!problem) files.current.set(id, file)
        let preview: string | null = null
        if (!problem) {
          try {
            preview = URL.createObjectURL(file)
          } catch {
            preview = null
          }
        }
        return { id, fileName: file.name || 'image', size: file.size, preview, status: problem ? 'error' : 'queued', error: problem ?? undefined }
      })
      setItems((cur) => {
        const next = [...cur, ...added]
        itemsRef.current = next
        return next
      })
      queueMicrotask(() => void run())
    },
    [run],
  )

  const retry = useCallback(
    (id: string) => {
      patch(id, { status: 'queued', error: undefined, until: undefined })
      queueMicrotask(() => void run())
    },
    [patch, run],
  )

  /** Remove finished rows (done and failed); returns whether anything is still going. */
  const clearFinished = useCallback(() => {
    setItems((cur) => {
      const keep = cur.filter((i) => i.status !== 'done' && i.status !== 'error')
      for (const i of cur) {
        if (keep.includes(i)) continue
        if (i.preview) URL.revokeObjectURL(i.preview)
        files.current.delete(i.id)
      }
      itemsRef.current = keep
      return keep
    })
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current !== null) window.clearTimeout(timer.current)
      for (const i of itemsRef.current) if (i.preview) URL.revokeObjectURL(i.preview)
    }
  }, [])

  return { items, summary: summarize(items), add, retry, clearFinished }
}
