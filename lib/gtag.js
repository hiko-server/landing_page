// Google Analytics (gtag.js) page views for client-side navigations.
//
// Inert unless NEXT_PUBLIC_GA_ID is set at build time AND the gtag script is
// present on the page (window.gtag): _app only subscribes when the ID exists,
// and every call is guarded so analytics can never break navigation.

export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_ID || ''

// https://developers.google.com/analytics/devguides/collection/gtagjs/pages
export const pageview = (url) => {
  if (!GA_TRACKING_ID || typeof window === 'undefined' || typeof window.gtag !== 'function') return
  try {
    window.gtag('config', GA_TRACKING_ID, { page_path: url })
  } catch {
    // Analytics is best effort.
  }
}
