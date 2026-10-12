import React from 'react'
import type { GetStaticProps } from 'next'
import NextLink from 'next/link'
import { Box, Grid, Heading, Link, Text } from '@chakra-ui/react'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import SectionLabel from '../components/General-UI/SectionLabel'
import MDXContent from '../components/MDX/MDXContent'
import NowSignals, { AutoUpdatedLabel } from '../components/Now/NowSignals'
import { getStaticMdxPage, listPosts, listWork } from '../lib/mdx'
import { getPage } from '../lib/contentStore'
import { currentRoles, currentlyCodingSignal, hasSignals, latestPost, latestWork, type NowSignals as Signals } from '../lib/nowSignals'
import type { MDXRemoteSerializeResult } from 'next-mdx-remote'
import type { HomeData } from '../lib/homeShape'
import { referenceMonth } from '../lib/clock'

/**
 * /now — what I'm focused on.
 *
 * When the owner has written the page (admin → pages → now), that text is the
 * primary content and the live signals sit beside it as a compact sidebar.
 * When the body is empty, the page is composed automatically from real data
 * only (lib/nowSignals.ts): current roles / studies from the public CV, the
 * "currently coding" chip, and the latest post and case study — clearly
 * labelled as auto-updated. ISR (60 s), so it follows the content store.
 */

type Props = {
  source: MDXRemoteSerializeResult | null
  updated: string | null
  signals: Signals
  host: string
  /** Reference month ('YYYY-MM', lib/clock.ts) the signals were composed for. */
  clockMonth: string
  /** Public home.socials for the persistent header / footer (null = none set). */
  chromeSocials?: HomeData['socials'] | null
}

const mono = 'var(--font-geist-mono), monospace'

export default function NowPage({ source, updated, signals, host }: Props) {
  const auto = !source
  const live = hasSignals(signals)

  return (
    <>
      <CustomHead
        title="Now"
        description="What Li Yanpei (Lucian) is focused on right now — current projects, learning, and work."
        url={`https://${host}/now`}
        image={`https://${host}/api/og?title=Now&kind=page&subtitle=What%20I%27m%20focused%20on`}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Now',
          url: `https://${host}/now`,
          dateModified: (auto ? signals.composed : updated) || undefined,
          author: { '@type': 'Person', name: 'Li Yanpei' },
        }}
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          <SectionLabel n="01" as="p">
            Now
          </SectionLabel>

          <Heading
            as="h1"
            mt={6}
            mb={3}
            fontSize={['32px', '44px', '52px']}
            lineHeight="1.08"
            letterSpacing="-0.025em"
            fontWeight={500}
          >
            What I&rsquo;m focused on.
          </Heading>

          {auto ? (
            <>
              <Box mb={4}>
                <AutoUpdatedLabel composed={signals.composed} />
              </Box>
              <Text fontSize={['15px', '16px']} lineHeight="1.65" color="page.fg-secondary" maxW="60ch" mb={[10, 14]}>
                This page assembles itself from my public CV, the &ldquo;currently coding&rdquo; note on the home page
                and my latest published writing, so it keeps itself current.
              </Text>
              {live ? (
                <NowSignals signals={signals} variant="full" startAt={2} />
              ) : (
                <Box border="1px dashed" borderColor="page.border-strong" borderRadius="12px" px={[5, 8]} py={[8, 10]} textAlign="center">
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
            </>
          ) : (
            <>
              {updated && (
                <Text fontFamily={mono} fontSize="11px" color="page.fg-secondary" mb={12}>
                  Last updated · <time dateTime={updated}>{updated}</time>
                </Text>
              )}
              <Grid templateColumns={{ base: 'minmax(0,1fr)', lg: live ? 'minmax(0,1fr) 300px' : 'minmax(0,1fr)' }} gap={{ base: 12, lg: 14 }}>
                <Box minW={0}>
                  <MDXContent source={source} />
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
                      <AutoUpdatedLabel composed={signals.composed} />
                    </Box>
                    <NowSignals signals={signals} variant="compact" />
                  </Box>
                ) : null}
              </Grid>
            </>
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

  // Owner-written body (only when it has real content).
  let source: MDXRemoteSerializeResult | null = null
  let updated: string | null = null
  try {
    if ((getPage('now')?.body || '').trim()) {
      const page = await getStaticMdxPage('now')
      source = page?.source ?? null
      updated = dateOnly(page?.frontmatter.updated)
    }
  } catch {
    source = null
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
  const safe = <T,>(fn: () => T, fallback: T): T => {
    try {
      return fn()
    } catch {
      return fallback
    }
  }

  const roles = currentRoles(cvEn, clockMonth)
  const signals: Signals = {
    roles,
    coding: currentlyCodingSignal(cvEn, manualCoding, roles),
    post: safe(() => latestPost(listPosts()), null),
    work: safe(() => latestWork(listWork()), null),
    composed: now.toISOString().slice(0, 10),
  }

  return {
    props: {
      source,
      updated,
      signals,
      host: process.env.NEXT_PUBLIC_SITE_HOST || 'lucian-dev.com',
      clockMonth,
      // Omitted when the home document could not be read: the chrome then
      // loads the public view itself.
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
    },
    revalidate: 60,
  }
}
