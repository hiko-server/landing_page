/**
 * SEO origin + structured-data (JSON-LD) builders.
 *
 * Client+server safe — NO node-only imports, so pages and components can both
 * use it. Every URL is pinned to ONE canonical origin (NEXT_PUBLIC_SITE_HOST,
 * default lucian-dev.com) regardless of the host a request arrives on, so
 * Google never sees duplicate URLs/entities across hiko.dev and lucian-dev.com.
 *
 * All facts below are REAL, sourced from the live CV/home content — no
 * placeholder, rating, or invented relationship.
 */

const HOST = process.env.NEXT_PUBLIC_SITE_HOST || 'lucian-dev.com'

export const SITE_HOST = HOST
export const SITE_URL = `https://${HOST}`

/** Absolute URL on the canonical origin. Pass-through for already-absolute URLs. */
export function absUrl(path = '/'): string {
  if (!path) return SITE_URL
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

// Stable @id anchors so every page references the SAME Person / WebSite node
// instead of re-declaring a near-duplicate entity (which splits ranking signals).
export const PERSON_ID = `${SITE_URL}/#person`
export const WEBSITE_ID = `${SITE_URL}/#website`

/** Public display name — kept in one place so it stays consistent everywhere. */
export const PERSON_NAME = 'Li Yanpei (Lucian)'

/** A reference to the canonical Person node (use as author/publisher/mainEntity). */
export const personRef = { '@id': PERSON_ID }

/**
 * The canonical Person entity. Real data only: socials are the actual three
 * accounts, schools are the real alumniOf, skills come from the live CV.
 */
export function personNode(extra: Record<string, unknown> = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': PERSON_ID,
    name: PERSON_NAME,
    alternateName: 'Lucian',
    url: SITE_URL,
    image: absUrl('/images/hikoAvator.png'),
    jobTitle: 'Software Engineer',
    sameAs: [
      'https://github.com/HikoPLi',
      'https://gitlab.com/HikoPLi',
      'https://www.linkedin.com/in/liyanpeihiko/',
    ],
    alumniOf: [
      { '@type': 'CollegeOrUniversity', name: 'Hong Kong Metropolitan University' },
      { '@type': 'CollegeOrUniversity', name: 'UOW College Hong Kong' },
    ],
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Kowloon',
      addressRegion: 'Hong Kong',
      addressCountry: 'HK',
    },
    knowsAbout: [
      'Full-stack web development',
      'TypeScript',
      'React',
      'Next.js',
      'Node.js',
      'Python',
      'C++',
      'MongoDB',
      'Docker',
      'RESTful API design',
      'Machine learning',
      'Computer vision',
      'Embedded software',
    ],
    ...extra,
  }
}

/** The canonical WebSite entity, published by the Person. */
export function websiteNode(extra: Record<string, unknown> = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_HOST,
    url: SITE_URL,
    inLanguage: ['en', 'zh'],
    publisher: personRef,
    ...extra,
  }
}

/** BreadcrumbList from a Home → … → page trail (paths are made absolute). */
export function breadcrumb(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absUrl(it.path),
    })),
  }
}
