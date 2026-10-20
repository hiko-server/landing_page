/**
 * Browser side of a share link's open counter (E4; server: pages/api/cv/share).
 *
 * An open is counted only once the page has really been looked at: it
 * rendered in a browser that runs scripts (link unfurlers, mail scanners
 * and previews fetch the HTML and stop), and it stayed VISIBLE for
 * VISIBLE_MS in total (a prerender or a background tab does not count).
 * Then one beacon with the token — nothing else: no cookie, storage,
 * identifier, address or device detail. Once per token per tab (switching
 * the language does not count again). Nothing is sent from automated
 * browsers or when the browser asks not to be tracked (Do Not Track /
 * Global Privacy Control); the server applies the same rules and skips a
 * signed-in owner.
 */

export const VISIBLE_MS = 2500
const ENDPOINT = '/api/cv/share'
const counted = new Set<string>()

type PrivacyNavigator = Navigator & { globalPrivacyControl?: boolean; webdriver?: boolean }

export function openCountingAllowed(nav: PrivacyNavigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!nav) return false
  return !nav.webdriver && nav.doNotTrack !== '1' && nav.globalPrivacyControl !== true
}

function send(token: string) {
  const body = JSON.stringify({ t: token })
  try {
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ENDPOINT, body)) return
  } catch {
    /* fall through */
  }
  fetch(ENDPOINT, { method: 'POST', body, keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }).catch(
    () => undefined,
  )
}

/** Start watching for a real view of the page; returns the cleanup. */
export function watchShareOpen(token: string): () => void {
  if (typeof window === 'undefined' || counted.has(token) || !openCountingAllowed()) return () => undefined
  let seen = 0
  let since = document.visibilityState === 'visible' ? performance.now() : null
  let timer: number | undefined
  const fire = () => {
    if (counted.has(token)) return
    counted.add(token)
    cleanup()
    send(token)
  }
  const schedule = () => {
    window.clearTimeout(timer)
    if (since !== null) timer = window.setTimeout(fire, Math.max(0, VISIBLE_MS - seen))
  }
  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      if (since === null) since = performance.now()
    } else if (since !== null) {
      seen += performance.now() - since
      since = null
    }
    schedule()
  }
  function cleanup() {
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  }
  document.addEventListener('visibilitychange', onVisibility)
  schedule()
  return cleanup
}
