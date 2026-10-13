/**
 * The automatic /now and /uses pages as editable Markdown.
 *
 * When the owner has not written /now or /uses, visitors see a page composed
 * from real data (lib/nowSignals.ts: the public CV, the currently-coding
 * note, the latest post and case study; lib/stack.ts: the site's curated
 * stack). The admin editor offers "Start from this": these helpers turn the
 * same signals into Markdown the owner can edit, and describe in one line
 * per source what the automatic page is built from.
 *
 * Pure (no DB / fs access) so it is unit-tested; GET /api/admin/page-derived
 * feeds it the public data. Every link is an absolute site path ("/blog/x");
 * text is escaped so it can never turn into MDX JSX or an {expression}.
 */

import type { CvSectionLike } from './cvVisibility'
import type { CvNow } from './cvFormat'
import type { CurrentlyCoding } from './currentlyCoding'
import type { StackGroup } from './stack'
import {
  currentRoles,
  currentlyCodingSignal,
  latestPost,
  latestWork,
  type NowLink,
  type NowRole,
} from './nowSignals'

export type NowPageSignals = {
  roles: NowRole[]
  coding: CurrentlyCoding | null
  post: NowLink | null
  work: NowLink | null
}

export type UsesPageSignals = { groups: StackGroup[] }

export type PageSignals = ({ name: 'now' } & NowPageSignals) | ({ name: 'uses' } & UsesPageSignals)

type PostLike = Parameters<typeof latestPost>[0]
type WorkLike = Parameters<typeof latestWork>[0]

/**
 * The /now signals exactly as the public page composes them. `cvWebsiteEn`
 * must already be the public website view (readPublicCvSections), so hidden
 * entries, fields and dates never reach this function.
 */
export function buildNowSignals(input: {
  cvWebsiteEn: CvSectionLike[] | null | undefined
  manualCoding: Partial<CurrentlyCoding> | null | undefined
  posts: PostLike
  work: WorkLike
  now: CvNow
}): NowPageSignals {
  const roles = currentRoles(input.cvWebsiteEn, input.now)
  return {
    roles,
    coding: currentlyCodingSignal(input.cvWebsiteEn, input.manualCoding, input.now),
    post: latestPost(input.posts),
    work: latestWork(input.work),
  }
}

/** Escape Markdown / MDX syntax in plain text (one line). */
export function escapeMarkdownText(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\`*_[\]{}<>|#~]/g, (c) => `\\${c}`)
    .trim()
}

const capitalize = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text)

/** An absolute site path safe for a Markdown link destination, else null. */
function sitePath(href: string): string | null {
  if (!/^\/(?!\/)/.test(href)) return null
  return href.replace(/[\s()<>]/g, (c) => encodeURIComponent(c))
}

function linkLine(link: NowLink): string {
  const title = escapeMarkdownText(link.title)
  const href = sitePath(link.href)
  const head = href ? `[${title}](${href})` : title
  const tail = [link.description ? `— ${escapeMarkdownText(link.description)}` : '', link.date ? `(${escapeMarkdownText(link.date)})` : '']
    .filter(Boolean)
    .join(' ')
  return `- ${head}${tail ? ` ${tail}` : ''}`
}

function roleLine(role: NowRole): string {
  const title = `**${escapeMarkdownText(role.title)}**`
  const org = role.org ? `, ${escapeMarkdownText(role.org)}` : ''
  const where = role.location ? ` · ${escapeMarkdownText(role.location)}` : ''
  const when = role.when ? ` — ${escapeMarkdownText(role.when)}` : ''
  return `- ${role.status === 'upcoming' ? 'Next: ' : ''}${title}${org}${where}${when}`
}

function nowMarkdown(s: NowPageSignals): string {
  const blocks: string[] = []
  if (s.roles.length) blocks.push(['## Currently', '', ...s.roles.map(roleLine)].join('\n'))
  if (s.coding) {
    // Headed by the chip's own label, like the page (components/Now/NowSignals.tsx).
    const heading = capitalize(escapeMarkdownText(s.coding.label)) || 'Currently coding'
    const note = s.coding.note ? ` — ${escapeMarkdownText(s.coding.note)}` : ''
    blocks.push([`## ${heading}`, '', `- **${escapeMarkdownText(s.coding.project)}**${note}`].join('\n'))
  }
  if (s.post) blocks.push(['## Latest writing', '', linkLine(s.post)].join('\n'))
  if (s.work) blocks.push(['## Latest case study', '', linkLine(s.work)].join('\n'))
  return blocks.join('\n\n')
}

function usesMarkdown(s: UsesPageSignals): string {
  return s.groups
    .filter((g) => g.items.length)
    .map((g) => {
      const lines = [`## ${escapeMarkdownText(g.label)}`, '']
      if (g.hint) lines.push(escapeMarkdownText(g.hint), '')
      for (const it of g.items) {
        lines.push(`- ${escapeMarkdownText(it.name)}${it.version ? ` ${escapeMarkdownText(it.version)}` : ''}`)
      }
      return lines.join('\n')
    })
    .join('\n\n')
}

/** Markdown with one H2 per block and bullet lines (links as absolute paths). */
export function signalsToMarkdown(name: 'now', signals: NowPageSignals): string
export function signalsToMarkdown(name: 'uses', signals: UsesPageSignals): string
export function signalsToMarkdown(name: 'now' | 'uses', signals: NowPageSignals | UsesPageSignals): string {
  const md = name === 'now' ? nowMarkdown(signals as NowPageSignals) : usesMarkdown(signals as UsesPageSignals)
  return md ? `${md}\n` : ''
}

/** What the automatic page is built from, one short phrase per real source. */
export function signalSources(signals: PageSignals): string[] {
  if (signals.name === 'uses') {
    const count = signals.groups.reduce((n, g) => n + g.items.length, 0)
    return count ? [`the stack read from this site’s package.json (${count} tools in ${signals.groups.length} groups)`] : []
  }
  const out: string[] = []
  const current = signals.roles.filter((r) => r.status === 'current').length
  const upcoming = signals.roles.length - current
  if (signals.roles.length) {
    const parts = [current ? `${current} current` : '', upcoming ? `${upcoming} upcoming` : ''].filter(Boolean).join(', ')
    out.push(`your public CV (${parts} role${signals.roles.length === 1 ? '' : 's'})`)
  }
  if (signals.coding) out.push(`the currently-coding note (${signals.coding.project})`)
  if (signals.post) out.push(`your latest post, “${signals.post.title}”`)
  if (signals.work) out.push(`your latest case study, “${signals.work.title}”`)
  return out
}
