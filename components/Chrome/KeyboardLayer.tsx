import { useEffect } from 'react'
import { getShortcutsEnabled } from '../../lib/keyboardShortcuts'
import { layerKeyOf } from '../../lib/keyboardLayer'
import { openCommandPalette } from './paletteEvents'
import { noteKeyboardUse } from './hardwareKeyboard'

/** An open modal dialog (the palette, the menu, the lightbox) owns the keyboard. */
const OPEN_MODAL = '[aria-modal="true"]'

/**
 * The visitor keyboard layer (lib/keyboardLayer.ts lists the keys).
 *
 * This listener is all the shared bundle carries: it classifies the key,
 * opens the palette for "/" and "?" itself, and hands everything else to
 * keyboardLayerActions — a chunk of its own, fetched while the browser is
 * idle (or by the first key, whose time is kept, so a "G then …" typed
 * before the chunk arrived still counts). Nothing fires while single-key
 * shortcuts are off (WCAG 2.1.4), in a text field, in a widget that owns the
 * keyboard or while a dialog is open.
 */

const loadActions = () => import('./keyboardLayerActions')

/** Fetch the actions chunk ahead of time (idempotent; failures are retried on the next key). */
export function preloadKeyboardLayer(): void {
  loadActions().catch(() => undefined)
}

export default function KeyboardLayer() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A tablet with a keyboard case: the keyboard hints come back (components/Chrome/platform).
      noteKeyboardUse(e)
      const key = layerKeyOf(e)
      if (!key || !getShortcutsEnabled() || document.querySelector(OPEN_MODAL)) return
      if (key === '/' || key === '?') {
        e.preventDefault()
        openCommandPalette('', { page: key === '?' ? 'shortcuts' : null, instant: true })
      } else if (key !== 'other') {
        e.preventDefault()
      }
      const at = Date.now()
      const char = e.key
      loadActions().then(
        (actions) => actions.handleLayerKey(key, char, at),
        () => undefined,
      )
    }
    document.addEventListener('keydown', onKey)

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    const idle = w.requestIdleCallback ? w.requestIdleCallback(preloadKeyboardLayer, { timeout: 6000 }) : null
    const timer = idle === null ? window.setTimeout(preloadKeyboardLayer, 2500) : 0
    return () => {
      document.removeEventListener('keydown', onKey)
      if (idle !== null) w.cancelIdleCallback?.(idle)
      window.clearTimeout(timer)
    }
  }, [])

  return null
}
