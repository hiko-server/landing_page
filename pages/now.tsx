import type { GetStaticProps } from 'next'
import NextLink from 'next/link'
import { Box, Grid, Link, Text } from '@chakra-ui/react'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import PageHeader from '../components/General-UI/PageHeader'
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
import { absUrl, ogImageUrl, personAuthor } from '../lib/schema'

/**
 * /now — what I'm focused on.
 *
 * When the owner has written the page (admin → pages → now), that text is the
 * primary content and the live signals sit beside it as a compact sidebar.
 * When the body is empty, the page is composed only from real data
 * (lib/nowSignals.ts): current roles / studies from the public CV, the
 * "currently coding" note and the latest post and case study, under one
 * status line saying when those sources last changed. How it assembles itself
 * is explained on /colophon. ISR (60 s), so it follows the content store.
 */

type Props = {
  tree: MDXRendered<PageFrontmatter>['tree'] | null
  updated: string | null
  signals: Signals
  /** YYYY-MM-DD of the newest change among the signals' sources ('' when unknown). */
  signalsUpdated: string
  /** Reference month ('YYYY-MM', lib/clock.ts) the signals were composed for. */
  clockMonth: string
  /** Public home.socials for the persistent header / footer (null = none set). */
  chromeSocials?: HomeData['socials'] | null
}

const mono = 'var(--font-geist-mono), monospace'
const TITLE = 'What I’m focused on.'

export default function NowPage({ tree, updated, signals, signalsUpdated }: Props) {
  const live = hasSignals(signals)

  return (
    <>
      <CustomHead
        title="Now"
        description="What Li Yanpei (Lucian) is focused on right now: current work and studies, what he is building, and the latest writing."
        url={absUrl('/now')}
        image={ogImageUrl({ kind: 'page', title: 'Now', subtitle: 'What I’m focused on' })}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Now',
          url: absUrl('/now'),
          dateModified: (tree ? updated : signalsUpdated) || undefined,
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
                updated ? (
                  <Text
                    fontFamily={mono}
                    fontSize="12px"
                    color="page.fg-secondary"
                    className="tnum"
                    m={0}
                  >
                    Last updated · <time dateTime={updated}>{updated}</time>
                  </Text>
                ) : null
              ) : live ? (
                <UpdatedLine updatedOn={signalsUpdated} />
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
                  <Box mb={6}>
                    <UpdatedLine updatedOn={signalsUpdated} />
                  </Box>
                  <NowSignals signals={signals} variant="compact" />
                </Box>
              ) : null}
            </Grid>
          ) : live ? (
            <NowSignals signals={signals} variant="full" />
          ) : (
            <Box
              border="1px dashed"
              borderColor="page.border-strong"
              borderRadius="12px"
              px={[5, 8]}
              py={[8, 10]}
              textAlign="center"
            >
              <Text fontSize={['15px', '16px']} color="page.fg-secondary" lineHeight="1.65">
                Nothing to report yet: the CV lists no current role and nothing has been published.
              </Text>
              <Text fontFamily={mono} fontSize="12px" mt={4} color="page.fg-secondary">
                <Link as={NextLink} href="/cv" color="accent.text">
                  Read the CV
                </Link>
                {' · '}
                <Link as={NextLink} href="/blog" color="accent.text">
                  Browse the blog
                </Link>
              </Text>
            </Box>
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
  const roles = currentRoles(cvEn, clockMonth)
  const signals: Signals = {
    roles,
    coding: currentlyCodingSignal(cvEn, manualCoding, clockMonth),
    post: latestPost(posts),
    work: latestWork(work),
    composed: now.toISOString().slice(0, 10),
  }

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
      updated,
      signals,
      signalsUpdated,
      clockMonth,
      // Omitted when the home document could not be read: the chrome then
      // loads the public view itself.
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
    },
    revalidate: 60,
  }
}
