/**
 * The ⌘K palette's "Edit this page" target for the signed-in owner. Its own
 * module (re-exported from ./chrome for existing callers) so it ships in the
 * palette's lazy chunk only: imported from chrome.ts by the palette, it was
 * kept in the shared bundle every visitor downloads.
 */

/** The owner's "edit what I am looking at" target for a public route, or null. */
export function adminEditTarget(pathname: string, slug: unknown): { label: string; href: string } | null {
  const s = typeof slug === 'string' && /^[\w-]+$/.test(slug) ? slug : ''
  switch (pathname) {
    case '/blog/[slug]':
      return s ? { label: 'Edit this post', href: `/admin/blog/edit?slug=${encodeURIComponent(s)}` } : null
    case '/work/[slug]':
      return s ? { label: 'Edit this case study', href: `/admin/work/edit?slug=${encodeURIComponent(s)}` } : null
    case '/cv':
    case '/cv/zh':
      return { label: 'Edit the CV in CV Studio', href: '/admin/dashboard?tab=cv' }
    case '/publications':
      return { label: 'Edit publications in CV Studio', href: '/admin/dashboard?tab=cv' }
    case '/':
      return { label: 'Edit the home page', href: '/admin/dashboard?tab=home' }
    // The Chinese pages (F3): their copy is in the Home editor's Chinese section and the Chinese bio.
    case '/zh':
    case '/zh/contact':
      return { label: 'Edit the Chinese copy', href: '/admin/dashboard?tab=home#home-chinese' }
    case '/zh/about':
      return { label: 'Edit the Chinese bio', href: '/admin/about?lang=zh' }
    case '/now':
      return { label: 'Edit /now', href: '/admin/now' }
    case '/uses':
      return { label: 'Edit /uses', href: '/admin/uses' }
    default:
      return null
  }
}
