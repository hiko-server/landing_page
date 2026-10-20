import { useEffect } from 'react'
import { goalsAllowed, sendGoal } from './goalBeacon'

/**
 * cv_print (H9): one event per CV page view when the print dialog opens —
 * Ctrl/⌘+P, the browser menu, the page's Print button or /cv?print=1 all
 * fire `beforeprint`; the print media query covers browsers that do not.
 * Loaded with the CV page chunk. The server derives the language from the
 * page path (/cv → en, /cv/zh → zh); nothing else is sent.
 */
export function usePrintGoal(): void {
  useEffect(() => {
    if (!goalsAllowed()) return
    let sent = false
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null
    const onPrint = () => {
      if (sent) return
      sent = true
      sendGoal('cv_print')
    }
    const onMedia = (e: MediaQueryListEvent) => {
      if (e.matches) onPrint()
    }
    window.addEventListener('beforeprint', onPrint)
    media?.addEventListener?.('change', onMedia)
    return () => {
      window.removeEventListener('beforeprint', onPrint)
      media?.removeEventListener?.('change', onMedia)
    }
  }, [])
}
