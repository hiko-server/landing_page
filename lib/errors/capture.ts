/**
 * The always-loaded part of the browser error monitor: two listeners and a
 * boundary hook that load lib/errors/client.ts the first time something goes
 * wrong. Kept tiny on purpose — it ships in the shared bundle.
 */

const load = () => import('./client')

function forward(e: Event) {
  load()
    .then((m) => m.handleErrorEvent(e))
    .catch(() => {
      // Reporting must never surface errors of its own.
    })
}

/** Start capturing uncaught errors and unhandled rejections; returns the cleanup. */
export function installErrorCapture(): () => void {
  window.addEventListener('error', forward)
  window.addEventListener('unhandledrejection', forward)
  return () => {
    window.removeEventListener('error', forward)
    window.removeEventListener('unhandledrejection', forward)
  }
}

/** Report an error a React error boundary caught (it never reaches window.onerror). */
export function reportBoundaryError(error: Error, boundary?: string): void {
  if (typeof window === 'undefined') return
  load()
    .then((m) => m.reportClientError({ kind: 'boundary', error, boundary }))
    .catch(() => {
      // Reporting must never surface errors of its own.
    })
}
