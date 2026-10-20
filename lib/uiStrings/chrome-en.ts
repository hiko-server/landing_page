/**
 * The English words of the always-loaded site chrome (lib/uiStrings/chrome):
 * the type every language fills in, and the English table. Its own module
 * because the chrome is in the shared bundle (pages/_app): every page
 * carries the English words as the default, and a Chinese page receives its
 * own words with its props (chromeUiFor), so the shared bundle never holds
 * the other languages. The parts that load on demand — the mobile menu, the
 * theme menu, back-to-top, the "G then …" hint — keep their words in
 * ./menu instead. `{name}` marks a value filled in with fillUi.
 */

/** Primary navigation labels, keyed like components/Chrome/chrome NAV_KEYS. */
export type NavStrings = {
  home: string
  about: string
  work: string
  writing: string
  cv: string
  publications: string
  now: string
  uses: string
  contact: string
  colophon: string
}

export type ChromeStrings = {
  nav: NavStrings
  /** The skip link before the header. */
  skip: string
  /** Header: the wordmark's name ({brand}: "lucian-dev.com"), the nav landmark, the ⌘K trigger, the menu button. */
  homeLink: string
  primaryNav: string
  search: string
  openPalette: string
  openMenu: string
  /** "● Last commit · 2h ago" ({n}: minutes / hours / days). */
  lastCommit: string
  minutesAgo: string
  hoursAgo: string
  daysAgo: string
  /** The owner's own controls (signed in only). */
  dashboard: string
  logout: string
  logoutTitle: string
  loggedOut: string
  logoutFailed: string
  /** The header's theme control. */
  theme: string
  toLight: string
  toDark: string
  themePreference: string
  themeTitle: string
  /** Footer; `newTab` is appended to a link that opens another site (screen readers). */
  footerNav: string
  site: string
  thisSite: string
  elsewhere: string
  privacy: string
  source: string
  /** Feed links, keyed by their href (lib/feeds FEEDS). */
  feeds: Readonly<Record<string, string>>
  builtWith: string
  build: string
  deployedFrom: string
  newTab: string
  /** The slow-navigation status. */
  loading: string
}

export const CHROME_EN: ChromeStrings = {
  nav: {
    home: 'Home',
    about: 'About',
    work: 'Work',
    writing: 'Writing',
    cv: 'CV',
    publications: 'Publications',
    now: 'Now',
    uses: 'Uses',
    contact: 'Contact',
    colophon: 'Colophon',
  },
  skip: 'Skip to content',
  homeLink: '{brand} — home',
  primaryNav: 'Primary',
  search: 'Search',
  openPalette: 'Open command palette',
  openMenu: 'Open menu',
  lastCommit: 'Last commit',
  minutesAgo: '{n}m ago',
  hoursAgo: '{n}h ago',
  daysAgo: '{n}d ago',
  dashboard: 'Dashboard',
  logout: 'Logout',
  logoutTitle: 'Sign out of this browser (other devices: Admin → Security)',
  loggedOut: 'Logged out',
  logoutFailed: 'Logout failed',
  theme: 'Theme',
  toLight: 'Switch to light theme',
  toDark: 'Switch to dark theme',
  themePreference: 'Theme preference',
  themeTitle: 'Theme: System, Light or Dark',
  footerNav: 'Footer',
  site: 'Site',
  thisSite: 'This site',
  elsewhere: 'Elsewhere',
  privacy: 'Privacy',
  source: 'Source',
  feeds: {
    '/feed.xml': 'Writing (RSS)',
    '/feed.json': 'Writing (JSON Feed)',
    '/work/feed.xml': 'Case studies (RSS)',
  },
  builtWith: 'Built with Next.js · Set in Geist',
  build: 'Build {sha}',
  deployedFrom: 'Deployed from commit {sha}',
  newTab: ' (opens in a new tab)',
  loading: 'Loading…',
}
