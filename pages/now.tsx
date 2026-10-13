import type { GetStaticProps } from 'next'
import { Box, Grid } from '@chakra-ui/react'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import PageHeader from '../components/General-UI/PageHeader'
import EmptyState from '../components/General-UI/EmptyState'
import MDXContent from '../components/MDX/MDXContent'
import NowSignals, { UpdatedLine } from '../components/Now/NowSignals'
import {
  getStaticMdxPage,
  listPosts,
  listWork,
  type MDXRendered,
  type PageFrontmatter,
} from '../lib/mdx'
import { getKvMeta, getPage } from '../lib/contentStore'
import {
  currentRoles,
  currentlyCodingSignal,
  hasSignals,
  latestPost,
  latestWork,
  signalsUpdatedOn,
  type NowSignals as Signals,
} from '../lib/nowSignals'
import type { HomeData } from '../lib/homeShape'
import { referenceMonth } from '../lib/clock'
import { absUrl, personAuthor, SITE_HOST } from '../lib/schema'
import { ogPresetUrl } from '../lib/og/presets'
import { bodyReferences, dedupeNowSignals, nowUpdatedOn } from '../lib/nowDedupe'

/**
 * /now — what I'm focused on.
 *
 * When the owner has written the page (admin → pages → now), that text is the
 * primary content and the live signals sit beside it as a compact sidebar —
 * minus whatever the text already links to or names (lib/nowDedupe.ts), so
 * nothing shows twice. When the body is empty, the page is composed only
 * from real data (lib/nowSignals.ts): current roles / studies from the
 * public CV, the "currently coding" note and the latest post and case
 * study. Either way the header carries the page's one "Updated" date (the
 * newest of the owner's date and the shown signals' sources). How it
 * assembles itself is explained on /colophon. ISR (60 s), so it follows the
 * content store.
 */

type Props = {
  tree: MDXRendered<PageFrontmatter>['tree'] | null
  /** The page's one "updated" day (YYYY-MM-DD, '' when unknown). */
  updatedOn: string
  signals: Signals
  /** Reference month ('YYYY-MM', lib/clock.ts) the signals were composed for. */
  clockMonth: string
  /** Public home.socials for the persistent header / footer (null = none set). */
  chromeSocials?: HomeData['socials'] | null
}

const TITLE = 'What I’m focused on.'

export default function NowPage({ tree, updatedOn, signals }: Props) {
  const live = hasSignals(signals)

  return (
    <>
      <CustomHead
        title="Now"
        description="What Li Yanpei (Lucian) is focused on right now: current work and studies, what he is building, and the latest writing."
        url={absUrl('/now')}
        image={ogPresetUrl('now')}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Now',
          url: absUrl('/now'),
          dateModified: updatedOn || undefined,
          author: personAuthor,
        }}
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          <PageHeader
            eyebrow="Now"
            title={TITLE}
            actions={
              tree ? (
                updatedOn ? (
                  <UpdatedLine updatedOn={updatedOn} source={null} />
                ) : null
              ) : live ? (
                <UpdatedLine updatedOn={updatedOn} />
              ) : null
            }
          />

          {tree ? (
            <Grid
              templateColumns={{
                base: 'minmax(0,1fr)',
                lg: live ? 'minmax(0,1fr) 300px' : 'minmax(0,1fr)',
              }}
              gap={{ base: 12, lg: 14 }}
            >
              <Box minW={0}>
                <MDXContent tree={tree} />
              </Box>
              {live ? (
                <Box
                  as="aside"
                  aria-label="Live signals"
                  alignSelf="start"
                  position={{ lg: 'sticky' }}
                  top={{ lg: '96px' }}
                  borderTop={{ base: '1px solid', lg: 'none' }}
                  borderLeft={{ lg: '1px solid' }}
                  borderColor="page.border"
                  pt={{ base: 8, lg: 0 }}
                  pl={{ lg: 8 }}
                >
                  <NowSignals signals={signals} variant="compact" />
                </Box>
              ) : null}
            </Grid>
          ) : live ? (
            <NowSignals signals={signals} variant="full" />
          ) : (
            <EmptyState
              title="Nothing to report yet"
              actions={[
                { label: 'Read the CV', href: '/cv' },
                { label: 'Browse the blog', href: '/blog' },
              ]}
            >
              The CV lists no current role and nothing has been published.
            </EmptyState>
          )}
        </Box>
      </HeaderFooter>
    </>
  )
}

function dateOnly(raw: unknown): string | null {
  if (raw instanceof Date) return raw.toISOString().slice(0, 10)
  return raw ? String(raw).slice(0, 10) : null
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const now = new Date()
  const clockMonth = referenceMonth(now)
  const safe = <T,>(fn: () => T, fallback: T): T => {
    try {
      return fn()
    } catch {
      return fallback
    }
  }

  // Owner-written body (only when it has real content).
  let tree: Props['tree'] = null
  let updated: string | null = null
  try {
    if ((getPage('now')?.body || '').trim()) {
      const page = await getStaticMdxPage('now')
      tree = page?.tree ?? null
      updated = dateOnly(page?.frontmatter.updated)
    }
  } catch {
    tree = null
  }

  // Live signals — each source is optional; a failure only drops that signal.
  let cvEn: any[] = []
  try {
    const { readPublicCvSections } = await import('../lib/cvdata')
    cvEn = readPublicCvSections('website', ['workExperience', 'education', 'project'], ['en']).en
  } catch {
    cvEn = []
  }
  let manualCoding: Record<string, string> | null = null
  let chromeSocials: HomeData['socials'] | null | undefined
  try {
    const { readPublicHome } = await import('../lib/home')
    const home = readPublicHome()
    manualCoding = home?.hero?.currentlyCoding ?? null
    chromeSocials = home?.socials ?? null
  } catch {
    manualCoding = null
  }

  const posts = safe(() => listPosts(), [])
  const work = safe(() => listWork(), [])
  const allSignals: Signals = {
    roles: currentRoles(cvEn, clockMonth),
    coding: currentlyCodingSignal(cvEn, manualCoding, clockMonth),
    post: latestPost(posts),
    work: latestWork(work),
    composed: now.toISOString().slice(0, 10),
  }
  // Beside the owner's text, only what the text does not already cover.
  const signals = tree ? dedupeNowSignals(allSignals, bodyReferences(tree, SITE_HOST), SITE_HOST) : allSignals
  const roles = signals.roles

  // When the sources behind the visible signals last changed: the CV (roles,
  // a CV-derived "currently coding"), the home document (an owner-written
  // "currently coding") and the shown post / case study.
  const kvStamp = (key: string) => safe(() => getKvMeta(key)?.updatedAt ?? null, null)
  const ownCoding =
    !!manualCoding && Object.values(manualCoding).some((v) => typeof v === 'string' && v.trim())
  const signalsUpdated = signalsUpdatedOn([
    roles.length || (signals.coding && !ownCoding) ? kvStamp('cvdata') : null,
    signals.coding && ownCoding ? kvStamp('home') : null,
    signals.post ? posts.find((p) => p.permalink === signals.post?.href)?.updatedAt : null,
    signals.work ? work.find((w) => w.permalink === signals.work?.href)?.updatedAt : null,
  ])

  return {
    props: {
      tree,
      updatedOn: tree ? nowUpdatedOn(updated, signalsUpdated, hasSignals(signals)) : signalsUpdated,
      signals,
      clockMonth,
      // Omitted when the home document could not be read: the chrome then
      // loads the public view itself.
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
      // Whether /publications exists, for the nav link (lib/publicationsData).
      ...(await import('../lib/publicationsData')).chromePublicationsProp(),
    },
    revalidate: 60,
  }
}
