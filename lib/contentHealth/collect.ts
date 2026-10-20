import { listItems } from '../contentStore'
import { readCvDataWithVersion } from '../cvdata'
import { readHomeWithVersion } from '../home'
import { PAGE_NAMES, readPage } from '../mdx-admin'
import { pageAdminPath, pagePublicPath } from '../pageNames'
import { isR2Configured } from '../r2'
import { SITE_HOST } from '../schema'
import {
  analyzeContent,
  publicIssues,
  type Analysis,
  type AnalyzeInput,
  type HealthDoc,
} from './analyze'
import { imageInfo } from './images'
import { isPersistentFailure, type LinkRecord } from './linkCheck'
import { linkRuntime, readLinkStore } from './linkStore'
import { linkScheduleStatus } from './schedule'
import { countIssues, type HealthReport, type HealthSummary, type LinkHealth } from './types'

/**
 * The content health report from the live store (SERVER-ONLY): gathers the
 * inputs of lib/contentHealth/analyze.ts — published posts and case studies
 * (drafts never), the /now, /uses and /about pages that have a body, the CV
 * and the home document, the stored link results and the image file facts —
 * and adds the link checker's state. Cheap enough to run per request (the
 * body scans are memoised); it never touches the network.
 */

const PAGE_TITLE: Record<string, string> = { now: 'Now', uses: 'Uses', about: 'About bio', 'about-zh': 'About bio (中文)' }

const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

export function publishedDocs(): { docs: HealthDoc[]; known: AnalyzeInput['known'] } {
  const docs: HealthDoc[] = []
  const known: AnalyzeInput['known'] = { blog: {}, work: {} }
  for (const collection of ['blog', 'work'] as const) {
    for (const item of listItems(collection)) {
      const fm = (item.frontmatter || {}) as Record<string, unknown>
      const draft = !!fm.draft
      known[collection][item.slug] = { draft }
      if (draft) continue
      const slug = encodeURIComponent(item.slug)
      docs.push({
        key: `${collection}/${item.slug}`,
        kind: collection === 'blog' ? 'post' : 'work',
        slug: item.slug,
        title: str(fm.title) || item.slug,
        description: str(fm.description),
        body: typeof item.body === 'string' ? item.body : '',
        frontmatter: fm,
        version: Math.trunc(item.updated_at),
        editHref: `/admin/${collection}/edit?slug=${slug}`,
        publicHref: `/${collection}/${item.slug}`,
      })
    }
  }
  for (const name of PAGE_NAMES) {
    const page = readPage(name)
    if (!page.body.trim()) continue
    docs.push({
      key: `page/${name}`,
      kind: 'page',
      slug: name,
      title: str(page.frontmatter?.title) || PAGE_TITLE[name] || name,
      description: '',
      body: page.body,
      frontmatter: page.frontmatter || {},
      version: page.updatedAt,
      editHref: pageAdminPath(name),
      publicHref: pagePublicPath(name),
    })
  }
  return { docs, known }
}

export function collectInput(
  links: Readonly<Record<string, LinkRecord>> = readLinkStore().links,
  now = Date.now()
): AnalyzeInput {
  const { docs, known } = publishedDocs()
  const cv = readCvDataWithVersion()
  const home = readHomeWithVersion()
  const r2Configured = isR2Configured()
  return {
    siteHost: SITE_HOST,
    now,
    docs,
    known,
    cv: { version: cv.version, doc: { en: cv.en, zh: cv.zh } },
    home: home.home
      ? { version: home.version, doc: home.home as unknown as Record<string, any> }
      : null,
    links,
    imageInfo: (src) => imageInfo(src, { r2Configured }),
  }
}

export function buildAnalysis(now = Date.now()): Analysis {
  return analyzeContent(collectInput(readLinkStore().links, now))
}

/** External URLs the public content references right now (what a link check requests). */
export function currentExternalUrls(): string[] {
  return Array.from(analyzeContent(collectInput({})).external.keys())
}

function linkHealth(
  analysis: Analysis,
  links: Readonly<Record<string, LinkRecord>>,
  lastRun: LinkHealth['lastRun'],
  now: number
): LinkHealth {
  const rt = linkRuntime()
  const schedule = linkScheduleStatus()
  let checked = 0
  let broken = 0
  let moved = 0
  const unverifiable: LinkHealth['unverifiable'] = []
  for (const [key, entry] of analysis.external) {
    const r = links[key]
    if (!r) continue
    checked++
    if (r.outcome === 'broken' || isPersistentFailure(r, now)) broken++
    else if (r.outcome === 'moved') moved++
    else if (r.outcome === 'unverifiable') {
      unverifiable.push({
        url: entry.url,
        reason: r.reason || (r.status ? `HTTP ${r.status}` : 'Not checkable'),
        refs: entry.refs.map((x) => ({ item: x.item, where: x.where })),
      })
    }
  }
  return {
    running: rt.running,
    progress: rt.running ? { done: rt.done, total: rt.total } : null,
    lastRun,
    nextAt: schedule.nextAt,
    intervalHours: schedule.intervalHours,
    total: analysis.external.size,
    checked,
    broken,
    moved,
    unverifiable,
  }
}

export function buildReport(now = Date.now()): HealthReport {
  const store = readLinkStore()
  const analysis = analyzeContent(collectInput(store.links, now))
  const issues = publicIssues(analysis.issues)
  return {
    generatedAt: now,
    items: analysis.items,
    issues,
    counts: countIssues(issues),
    scanned: {
      items: Object.keys(analysis.items).length,
      links: analysis.external.size,
      images: analysis.images,
    },
    links: linkHealth(analysis, store.links, store.lastRun, now),
  }
}

export function buildSummary(now = Date.now()): HealthSummary {
  const report = buildReport(now)
  return {
    generatedAt: report.generatedAt,
    counts: report.counts,
    scanned: report.scanned,
    links: { ...report.links, unverifiable: report.links.unverifiable.length },
  }
}

/** Only the link checker's state (polled by the panel while a check runs). */
export function linkStatus(): Pick<
  LinkHealth,
  'running' | 'progress' | 'lastRun' | 'nextAt' | 'intervalHours'
> {
  const rt = linkRuntime()
  const schedule = linkScheduleStatus()
  return {
    running: rt.running,
    progress: rt.running ? { done: rt.done, total: rt.total } : null,
    lastRun: readLinkStore().lastRun,
    nextAt: schedule.nextAt,
    intervalHours: schedule.intervalHours,
  }
}
