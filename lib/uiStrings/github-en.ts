/**
 * The English words of the GitHub widgets' activity lines, relative times
 * and dates (components/Common/githubEvents): the type every language fills
 * in (lib/uiStrings/home HOME_UI.*.github) and the English table — the
 * helpers' default, so this module is all the browser carries of them.
 * `{name}` marks a value filled in.
 */

export type GithubWords = {
  /** Action phrases, each followed by the repository ({n}: commits, {num}: " #12"). */
  pushedN: string
  pushedOne: string
  pushed: string
  prOpened: string
  prClosed: string
  prUpdated: string
  issueOpened: string
  issueClosed: string
  issueUpdated: string
  createdRepo: string
  /** {ref}: branch / tag. */
  createdRef: string
  refWords: { branch: string; tag: string; ref: string }
  updated: string
  starred: string
  forked: string
  released: string
  /** {words}: GitHub's own (English) name of the event, where a language has room for it; `activity` when it has none. */
  other: string
  activity: string
  /** A group of events ("PR #14, 1 branch"); `one` / `many` per noun, {n} the count. */
  summary: {
    commit: [string, string]
    push: [string, string]
    /** "PR #14" / "PRs #14, #15" (the numbers follow), and a count without numbers. */
    pr: [string, string]
    prCount: [string, string]
    issue: [string, string]
    issueCount: [string, string]
    comment: [string, string]
    review: [string, string]
    reviewComment: [string, string]
    branch: [string, string]
    tag: [string, string]
    ref: [string, string]
    deletion: [string, string]
    release: [string, string]
    other: [string, string]
    created: string
    starred: string
    forked: string
    updated: string
    /** Between the parts. */
    sep: string
  }
  /** Relative and absolute times ({n}; {y} {m} {d} {hh} {mm}; {month} a month name). */
  justNow: string
  minutesAgo: string
  hoursAgo: string
  daysAgo: string
  date: string
  dateTime: string
  day: string
  dayWithYear: string
  monthYear: string
  months: string[]
  monthsLong: string[]
}

export const GITHUB_EN: GithubWords = {
  pushedN: 'Pushed {n} commits to',
  pushedOne: 'Pushed 1 commit to',
  pushed: 'Pushed to',
  prOpened: 'Opened PR{num} in',
  prClosed: 'Closed PR{num} in',
  prUpdated: 'Updated PR{num} in',
  issueOpened: 'Opened issue{num} in',
  issueClosed: 'Closed issue{num} in',
  issueUpdated: 'Updated issue{num} in',
  createdRepo: 'Created repository',
  createdRef: 'Created {ref} in',
  refWords: { branch: 'branch', tag: 'tag', ref: 'ref' },
  updated: 'Updated',
  starred: 'Starred',
  forked: 'Forked',
  released: 'Published a release in',
  other: '{words} in',
  activity: 'Activity in',
  summary: {
    commit: ['{n} commit', '{n} commits'],
    push: ['{n} push', '{n} pushes'],
    pr: ['PR', 'PRs'],
    prCount: ['{n} PR', '{n} PRs'],
    issue: ['issue', 'issues'],
    issueCount: ['{n} issue', '{n} issues'],
    comment: ['{n} comment', '{n} comments'],
    review: ['{n} review', '{n} reviews'],
    reviewComment: ['{n} review comment', '{n} review comments'],
    branch: ['{n} branch', '{n} branches'],
    tag: ['{n} tag', '{n} tags'],
    ref: ['{n} ref', '{n} refs'],
    deletion: ['{n} deletion', '{n} deletions'],
    release: ['{n} release', '{n} releases'],
    other: ['{n} other event', '{n} other events'],
    created: 'repository created',
    starred: 'starred',
    forked: 'forked',
    updated: 'updated',
    sep: ', ',
  },
  justNow: 'just now',
  minutesAgo: '{n}m ago',
  hoursAgo: '{n}h ago',
  daysAgo: '{n}d ago',
  date: '{month} {d}, {y}',
  dateTime: '{month} {d}, {y}, {hh}:{mm} UTC',
  day: '{month} {d}',
  dayWithYear: '{month} {d}, {y}',
  monthYear: '{month} {y}',
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  monthsLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}
