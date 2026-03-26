import type { HomeData } from './home'

const FALLBACK_SITE_HOST = 'hiko.dev'
const FALLBACK_IMAGE_PATH = '/images/hikoAvator.png'

export function getSiteUrl(host?: string) {
  return `https://${host || process.env.NEXT_PUBLIC_SITE_HOST || FALLBACK_SITE_HOST}`
}

export function resolveAbsoluteUrl(url: string | undefined, host?: string) {
  if (!url) return undefined
  if (/^https?:\/\//i.test(url)) return url
  if (!url.startsWith('/')) {
    return `${getSiteUrl(host)}/${url}`
  }
  return `${getSiteUrl(host)}${url}`
}

export function getHomeSeoImage(home?: HomeData | null, host?: string) {
  const visiblePhoto = home?.photos?.find((photo) => photo.visible !== false)?.url
  const avatarUrl = home?.hero?.avatarUrl

  return (
    resolveAbsoluteUrl(visiblePhoto, host) ||
    resolveAbsoluteUrl(avatarUrl, host) ||
    resolveAbsoluteUrl(FALLBACK_IMAGE_PATH, host) ||
    FALLBACK_IMAGE_PATH
  )
}

export function getDefaultSeoImage(host?: string) {
  return resolveAbsoluteUrl(FALLBACK_IMAGE_PATH, host) || FALLBACK_IMAGE_PATH
}
