/**
 * CHANGELOG.md → structured releases for /colophon.
 *
 * Only dated releases are taken: `## [x.y.z] — YYYY-MM-DD` (em dash, en dash
 * or hyphen). "Unreleased" and undated archive headings are skipped. Inside a
 * release:
 *   - text before the first `###` is the release's intro paragraph;
 *   - `### Added` / `### Fixed` / `### Security` / `### Changed` (any
 *     heading, in file order) start a group;
 *   - `- ` / `* ` bullets are kept as markdown, continuation lines included
 *     (two-space indent removed, so nested lists survive).
 * Pure, so the page can parse at build time and tests can parse the real file.
 */

export type ChangelogGroup = { title: string; items: string[] }
export type ChangelogRelease = {
  version: string
  date: string
  intro: string
  groups: ChangelogGroup[]
}

const RELEASE_RE = /^##\s+\[(\d+\.\d+\.\d+)\]\s+[—–-]\s+(\d{4}-\d{2}-\d{2})\s*$/
const GROUP_RE = /^###\s+(.+?)\s*$/
const BULLET_RE = /^[-*]\s+(.*)$/

export function parseChangelog(md: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = []
  let release: ChangelogRelease | null = null
  let group: ChangelogGroup | null = null
  let item: string[] | null = null
  let intro: string[] = []

  const closeItem = () => {
    if (item && group) {
      const text = item.join('\n').trim()
      if (text) group.items.push(text)
    }
    item = null
  }
  const closeRelease = () => {
    closeItem()
    if (release) {
      release.intro = intro.join(' ').replace(/\s+/g, ' ').trim()
      release.groups = release.groups.filter((g) => g.items.length > 0)
      releases.push(release)
    }
    release = null
    group = null
    intro = []
  }

  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.startsWith('## ')) {
      closeRelease()
      const m = RELEASE_RE.exec(raw)
      if (m) release = { version: m[1], date: m[2], intro: '', groups: [] }
      continue
    }
    if (!release) continue

    const g = GROUP_RE.exec(raw)
    if (g) {
      closeItem()
      group = { title: g[1], items: [] }
      release.groups.push(group)
      continue
    }

    const b = BULLET_RE.exec(raw)
    if (b && group) {
      closeItem()
      item = [b[1]]
      continue
    }

    if (item) {
      // Blank lines and indented lines continue the current bullet (wrapped
      // text, nested lists, a second paragraph); anything else ends it.
      if (raw.trim() === '' || /^\s{2,}\S/.test(raw)) {
        item.push(raw.replace(/^ {2}/, ''))
        continue
      }
      closeItem()
    }

    if (!group && raw.trim()) intro.push(raw.trim())
  }
  closeRelease()
  return releases
}

/**
 * Escape the characters MDX would read as JSX or expressions (`<`, `{`, `}`)
 * outside inline code spans, so plain-markdown changelog text always compiles.
 */
export function escapeMdx(md: string): string {
  return md
    .split(/(`+[^`]*`+)/g)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/[<{}]/g, (c) => `\\${c}`)))
    .join('')
}

/** A group's bullets as one markdown list (nested lines re-indented under their bullet). */
export function groupMarkdown(items: readonly string[]): string {
  return items.map((it) => `- ${escapeMdx(it).replace(/\n/g, '\n  ')}`).join('\n')
}
