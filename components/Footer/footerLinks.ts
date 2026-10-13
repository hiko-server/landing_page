/**
 * What the footer lists (components/Footer/Footer.tsx), as data so the
 * columns are unit-tested (tests/chrome-identity.test.ts):
 *
 *   Site        every primary page (the same list as the header and drawer)
 *   This site   how it is made (/colophon), the privacy promise
 *               (/colophon#privacy), the feeds and the source
 *   Elsewhere   the owner's profiles (home.socials, resolved by SiteChrome)
 */

import { PRIMARY_LINKS, type NavLink } from '../Chrome/chrome'
import { FEEDS, type FeedType } from '../../lib/feeds'
import { REPO_URL } from '../../lib/build'

export type FooterLink = {
  label: string
  href: string
  /** Opens a new tab (another site). */
  external?: boolean
  /** Media type of a feed link (`type` attribute). */
  type?: FeedType
  /** Tooltip / accessible description (feed titles). */
  title?: string
}

/** Anchor of the privacy section on /colophon. */
export const PRIVACY_HREF = '/colophon#privacy'

export const SITE_LINKS: readonly NavLink[] = PRIMARY_LINKS

export const ABOUT_SITE_LINKS: readonly FooterLink[] = [
  { label: 'Colophon', href: '/colophon' },
  { label: 'Privacy', href: PRIVACY_HREF },
  ...FEEDS.map((f) => ({ label: f.label, href: f.href, type: f.type, title: f.title })),
  { label: 'Source', href: REPO_URL, external: true },
]

/** The column headings, in order (ids derive from them). */
export const FOOTER_COLUMNS = ['Site', 'This site', 'Elsewhere'] as const
