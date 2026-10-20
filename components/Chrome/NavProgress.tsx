import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { createNavProgress, pendingLinkOf } from '../../lib/navProgress'
import { useChromeUi } from './chromeLang'

/** SiteChrome's <main> (routeFocus.ts MAIN_ID; not imported, so this stays in the chrome's bundle module). */
const MAIN_ID = 'main'

/**
 * Slow-navigation feedback along the bottom edge of the sticky header
 * (lib/navProgress.ts decides when): after 150 ms a thin bar sweeps (a still
 * bar under reduced motion), <main> is aria-busy and the followed link is
 * marked `data-nav-pending`; after a second a polite status says
 * "Loading…". Everything goes as soon as the next page is about to render —
 * before a route transition takes its snapshot.
 *
 * The bar lives inside the header's own view-transition snapshot, so it is
 * never part of the outgoing page's image. No React state: the DOM is
 * updated directly, so a navigation never re-renders the chrome.
 */
export default function NavProgress() {
  const { events } = useRouter()
  const barRef = useRef<HTMLSpanElement>(null)
  const statusRef = useRef<HTMLSpanElement>(null)
  // "Loading…" in the chrome's language, read when it is announced.
  const { t } = useChromeUi()
  const loading = useRef(t.loading)
  loading.current = t.loading

  useEffect(() => {
    let clicked: Element | null = null
    let clickedAt = 0
    let pending: Element | null = null
    const onClick = (e: MouseEvent) => {
      clicked = e.target instanceof Element ? e.target.closest('a[href]') : null
      clickedAt = Date.now()
    }
    const progress = createNavProgress({
      show() {
        barRef.current?.setAttribute('data-state', 'loading')
        document.getElementById(MAIN_ID)?.setAttribute('aria-busy', 'true')
        pending?.setAttribute('data-nav-pending', '')
      },
      announce() {
        if (statusRef.current) statusRef.current.textContent = loading.current
      },
      hide() {
        barRef.current?.setAttribute('data-state', 'idle')
        document.getElementById(MAIN_ID)?.removeAttribute('aria-busy')
        pending?.removeAttribute('data-nav-pending')
        if (statusRef.current) statusRef.current.textContent = ''
      },
    })
    const start = (_url: string, options?: { shallow?: boolean }) => {
      if (options?.shallow) return
      pending?.removeAttribute('data-nav-pending')
      pending = pendingLinkOf(clicked, clickedAt, Date.now())
      progress.start()
    }
    const finish = () => {
      progress.finish()
      pending = null
    }
    document.addEventListener('click', onClick, true)
    events.on('routeChangeStart', start)
    events.on('beforeHistoryChange', finish)
    events.on('routeChangeComplete', finish)
    events.on('routeChangeError', finish)
    return () => {
      document.removeEventListener('click', onClick, true)
      events.off('routeChangeStart', start)
      events.off('beforeHistoryChange', finish)
      events.off('routeChangeComplete', finish)
      events.off('routeChangeError', finish)
      finish()
    }
  }, [events])

  return (
    <>
      <span ref={barRef} className="nav-progress" data-state="idle" aria-hidden="true" />
      <span ref={statusRef} className="sr-only" role="status" />
    </>
  )
}
