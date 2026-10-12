import { useEffect, useState } from 'react'
import { normalizeHost } from './chrome'

// The wordmark tracks the domain the site is actually served from: it seeds
// from the configured host for SSR / first paint (so server and client agree),
// then switches to the live hostname after hydration. Change the domain and the
// header/footer follow with no code edit.
const BRAND_FALLBACK =
  process.env.NEXT_PUBLIC_SITE_HOST || process.env.NEXT_PUBLIC_PRODUCT_NAME || 'lucian-dev.com'

export function useBrandHost(): string {
  const [brand, setBrand] = useState(() => normalizeHost(BRAND_FALLBACK))
  useEffect(() => {
    const host = window.location?.hostname
    if (host) setBrand(normalizeHost(host))
  }, [])
  return brand
}
