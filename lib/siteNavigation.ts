export type SiteLink = {
  label: string
  href: string
  external?: boolean
}

export const primaryNavigationLinks: SiteLink[] = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'CV', href: '/cv' },
]

export const secondaryNavigationLinks: SiteLink[] = [
  { label: 'Crypto', href: '/crypto' },
  { label: 'Quick Payment', href: '/quick-payment' },
]

export const socialNavigationLinks: SiteLink[] = [
  { label: 'GitHub', href: 'https://github.com/HikoPLi', external: true },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/liyanpeihiko/',
    external: true,
  },
  { label: 'WhatsApp', href: 'https://wa.me/85262040827', external: true },
]
