/**
 * The site's syndication feeds — one list for <link rel="alternate">
 * discovery (components/General-UI/CustomHead.tsx) and the footer's
 * "Subscribe" entry. Client-safe: no server imports here; the documents are
 * built by lib/feedHtml.ts.
 */

export type FeedType = 'application/rss+xml' | 'application/feed+json'

export type FeedLink = {
  /** Same-site path of the feed document. */
  href: string
  type: FeedType
  /** Feed title as readers show it (also the <link> title). */
  title: string
  /** Short label for menus. */
  label: string
}

export const FEEDS: readonly FeedLink[] = [
  { href: '/feed.xml', type: 'application/rss+xml', title: 'Li Yanpei — Writing', label: 'Writing (RSS)' },
  { href: '/feed.json', type: 'application/feed+json', title: 'Li Yanpei — Writing (JSON Feed)', label: 'Writing (JSON Feed)' },
  { href: '/work/feed.xml', type: 'application/rss+xml', title: 'Li Yanpei — Case studies', label: 'Case studies (RSS)' },
]

/** Feeds are cheap to rebuild but crawled often: 10 min at the edge, a day stale. */
export const FEED_CACHE_CONTROL = 'public, s-maxage=600, stale-while-revalidate=86400'

// XML 1.0 forbids most C0 control characters even when escaped.
// eslint-disable-next-line no-control-regex
const XML_INVALID_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g

/** Escape text for XML element content and attribute values. */
export function xmlEscape(s: string): string {
  return s
    .replace(XML_INVALID_RE, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Wrap markup in a CDATA section; a literal "]]>" is split across two sections. */
export function cdata(s: string): string {
  return `<![CDATA[${s.replace(XML_INVALID_RE, '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
}
