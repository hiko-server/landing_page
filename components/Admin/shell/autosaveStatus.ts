/**
 * The writing bar's save line (H3) — pure and unit-tested. It says where
 * the words are right now: only on this device (the local draft, written
 * one second after typing stops), saved as a draft, saved as unpublished
 * changes of a live page (H4), or live.
 */

export type AutosaveInput = {
  state: 'clean' | 'dirty' | 'saving' | 'error' | 'loading'
  isNew: boolean
  mode: 'draft' | 'published'
  hasPending: boolean
  /** Last save to the server (ms). */
  savedAt?: number
  /** Last copy of unsaved edits on this device (ms). */
  savedLocallyAt: number | null
  now: number
}

export type AutosaveLine = { text: string; tone: 'ok' | 'pending' | 'unsaved' }

/** "just now", "3 min ago", "2 h ago", else the clock time / date. */
export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 6 * 3600) return `${Math.round(s / 3600)} h ago`
  const d = new Date(at)
  const today = new Date(now)
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function autosaveStatus(i: AutosaveInput): AutosaveLine {
  if (i.state === 'loading') return { text: 'Loading…', tone: 'ok' }
  if (i.state === 'saving') return { text: 'Saving…', tone: 'ok' }
  if (i.state === 'dirty') {
    return i.savedLocallyAt
      ? { text: `Unsaved · autosaved on this device ${ago(i.savedLocallyAt, i.now)}`, tone: 'unsaved' }
      : { text: 'Unsaved · autosaving on this device…', tone: 'unsaved' }
  }
  if (i.isNew) return { text: 'Not saved yet', tone: 'unsaved' }
  const when = i.savedAt ? ` ${ago(i.savedAt, i.now)}` : ''
  if (i.mode === 'published') {
    return i.hasPending
      ? { text: `Changes saved${when} · not live yet`, tone: 'pending' }
      : { text: 'Published · everything here is live', tone: 'ok' }
  }
  return { text: `Draft saved${when}`, tone: 'ok' }
}
