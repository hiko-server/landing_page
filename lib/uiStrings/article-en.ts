/**
 * The English words of a post or case study page (lib/uiStrings/article):
 * the type every language fills in, and the English table — the default of
 * the article components outside a page that hands them its own words
 * (components/Article/articleUi). Its own module, so the browser bundle
 * carries English only; the other languages arrive with the page props.
 */
export type ArticleStrings = {
  /** Back links above the article. */
  allPosts: string
  allProjects: string
  /** Eyebrows and kind labels. */
  writing: string
  caseStudy: string
  /** Meta labels. */
  date: string
  updated: string
  read: string
  /** {n}: minutes. */
  minutes: string
  tags: string
  role: string
  team: string
  timeline: string
  published: string
  stack: string
  writeup: string
  writeups: string
  visitSite: string
  source: string
  /** "At a glance" (case studies). */
  atAGlance: string
  metricSource: string
  /** Outline and reading progress. */
  onThisPage: string
  articleOutline: string
  readingProgress: string
  progress: string
  /** {pct}: 0–100. */
  percentRead: string
  /** The language switch with several other versions. */
  otherLanguages: string
  /** Author card. */
  writtenBy: string
  viewCv: string
  contact: string
  /** Share row. */
  share: string
  copyLink: string
  copied: string
  linkCopied: string
  copyLinkFailed: string
  shareSheet: string
  opensInNewTab: string
  wechat: string
  /** {url}: the page address. */
  qrCodeOf: string
  qrHelp: string
  /** End-of-article navigation. */
  newer: string
  older: string
  previous: string
  next: string
  moreInCollection: string
  related: string
}

export const ARTICLE_EN: ArticleStrings = {
  allPosts: '← All posts',
  allProjects: '← All projects',
  writing: 'Writing',
  caseStudy: 'Case study',
  date: 'Date',
  updated: 'Updated',
  read: 'Read',
  minutes: '{n} min',
  tags: 'Tags',
  role: 'Role',
  team: 'Team',
  timeline: 'Timeline',
  published: 'Published',
  stack: 'Stack',
  writeup: 'Write-up',
  writeups: 'Write-ups',
  visitSite: 'Visit site',
  source: 'Source',
  atAGlance: 'At a glance',
  metricSource: 'Source',
  onThisPage: 'On this page',
  articleOutline: 'Article outline',
  readingProgress: 'Reading progress',
  progress: 'Progress',
  percentRead: '{pct}% read',
  otherLanguages: 'Other languages',
  writtenBy: 'Written by',
  viewCv: 'View CV',
  contact: 'Contact',
  share: 'Share',
  copyLink: 'Copy link',
  copied: 'Copied',
  linkCopied: 'Link copied to the clipboard',
  copyLinkFailed: 'Could not copy the link',
  shareSheet: 'Share…',
  opensInNewTab: '(opens in a new tab)',
  wechat: 'WeChat',
  qrCodeOf: 'QR code of {url}',
  qrHelp: 'Scan with WeChat to open this page on your phone, then share it from there.',
  newer: 'Newer',
  older: 'Older',
  previous: 'Previous',
  next: 'Next',
  moreInCollection: 'More in this collection',
  related: 'Related',
}
