import React from 'react'
import fs from 'fs'
import path from 'path'
import type { GetStaticProps } from 'next'
import NextLink from 'next/link'
import { Box, Grid, Heading, Link, Text } from '@chakra-ui/react'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import PageHeader from '../components/General-UI/PageHeader'
import MDXContent from '../components/MDX/MDXContent'
import { compileMdx } from '../lib/mdx'
import { groupMarkdown, parseChangelog } from '../lib/changelog'
import { readStack, type StackGroup } from '../lib/stack'
import { log } from '../lib/log'
import { absUrl, breadcrumb, personAuthor } from '../lib/schema'
import { ogPresetUrl } from '../lib/og/presets'
import { clearOfHeader } from '../lib/anchorOffset'

/**
 * /colophon — how the site is made: stack (lib/stack.ts, installed versions),
 * type, hosting, how /now and /uses assemble themselves, exactly what the
 * first-party analytics stores, the build this page came from and every
 * release from CHANGELOG.md.
 *
 * Static (revalidate: false): CHANGELOG.md and package.json are read at build
 * time and the parsed, compiled result ships in the page JSON, so nothing
 * here touches the filesystem at runtime. A changelog group that does not
 * compile is shown as plain text rather than dropped.
 */

type MdxTree = Awaited<ReturnType<typeof compileMdx>>['tree']
/** `items` (plain-text bullets) ship only for a group whose markdown did not compile. */
type Group = { title: string; tree: MdxTree | null; items: string[] }
type Release = { version: string; date: string; intro: string; groups: Group[] }

type Props = {
  releases: Release[]
  stack: StackGroup[]
  /** Commit the image was built from (NEXT_PUBLIC_BUILD_SHA), or null. */
  buildSha: string | null
  /** ISO timestamp of the build that generated this page. */
  builtAt: string
}

const REPO_URL = 'https://github.com/hiko-server/landing_page'
const mono = 'var(--font-geist-mono), monospace'
const releaseId = (version: string) => `v${version.replace(/\./g, '-')}`
/** Sections and releases land clear of the sticky header, with 24px of air (lib/anchorOffset.ts). */
const ANCHOR_MARGIN = clearOfHeader('24px')

const SECTIONS = [
  { id: 'stack', label: 'Stack' },
  { id: 'type', label: 'Type' },
  { id: 'hosting', label: 'Hosting' },
  { id: 'self-assembling', label: 'Self-assembling pages' },
  { id: 'privacy', label: 'Privacy & analytics' },
  { id: 'build', label: 'Build' },
  { id: 'changelog', label: 'Changelog' },
] as const

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <Box
      as="section"
      aria-labelledby={`${id}-title`}
      mb={[12, 16]}
      sx={{ scrollMarginTop: ANCHOR_MARGIN }}
      id={id}
    >
      <Heading
        as="h2"
        id={`${id}-title`}
        fontSize={['22px', '26px']}
        fontWeight={500}
        letterSpacing="-0.02em"
        lineHeight="1.2"
        mb={4}
      >
        {title}
      </Heading>
      {children}
    </Box>
  )
}

function Para({ children }: { children: React.ReactNode }) {
  return (
    <Text
      fontSize={['16px', '17px']}
      lineHeight="1.7"
      color="page.fg-prose"
      mb={4}
      sx={{ textWrap: 'pretty' }}
    >
      {children}
    </Text>
  )
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <Box
      as="ul"
      pl="1.2em"
      mb={4}
      fontSize={['16px', '17px']}
      lineHeight="1.7"
      color="page.fg-prose"
    >
      {items.map((it, i) => (
        <Box as="li" key={i} mt={i ? 2 : 0} sx={{ '&::marker': { color: 'page.fg-subtle' } }}>
          {it}
        </Box>
      ))}
    </Box>
  )
}

function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  const external = /^https?:/i.test(href)
  return (
    <Link
      as={external ? undefined : NextLink}
      href={href}
      isExternal={external}
      color="accent.text"
      textDecoration="underline"
      textUnderlineOffset="3px"
      textDecorationColor="var(--accent-ring)"
      _hover={{ textDecorationColor: 'currentColor' }}
    >
      {children}
    </Link>
  )
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <Box
    as="code"
    fontFamily={mono}
    fontSize="0.88em"
    px="0.3em"
    py="0.1em"
    borderRadius="4px"
    bg="page.bg-elevated"
  >
    {children}
  </Box>
)

export default function ColophonPage({ releases, stack, buildSha, builtAt }: Props) {
  const nav = SECTIONS.filter((s) => s.id !== 'changelog' || releases.length > 0)

  return (
    <>
      <CustomHead
        title="Colophon"
        description="How lucian-dev.com is built and run: stack, type, hosting, what the cookieless analytics stores, and every release."
        url={absUrl('/colophon')}
        image={ogPresetUrl('colophon')}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'Colophon',
            url: absUrl('/colophon'),
            author: personAuthor,
            ...(releases[0] ? { dateModified: releases[0].date } : {}),
          },
          breadcrumb([
            { name: 'Home', path: '/' },
            { name: 'Colophon', path: '/colophon' },
          ]),
        ]}
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          <PageHeader
            eyebrow="Colophon"
            title="How this site is made"
            lede="The stack, type, hosting and privacy model behind lucian-dev.com, and every release — generated from the repository when the site is built."
          />

          <Grid
            templateColumns={{ base: 'minmax(0, 1fr)', lg: '180px minmax(0, 720px)' }}
            columnGap={16}
            alignItems="start"
          >
            <Box
              as="nav"
              aria-label="On this page"
              display={{ base: 'none', lg: 'block' }}
              position="sticky"
              top="96px"
              maxH="calc(100vh - 120px)"
              overflowY="auto"
            >
              <Text
                fontFamily={mono}
                fontSize="11px"
                letterSpacing="0.12em"
                textTransform="uppercase"
                color="page.fg-subtle"
                mb={3}
              >
                On this page
              </Text>
              <Box as="ul" listStyleType="none" m={0} p={0} fontSize="14px" lineHeight="1.5">
                {nav.map((s) => (
                  <Box as="li" key={s.id} mt={2}>
                    <Link
                      href={`#${s.id}`}
                      color="page.fg-secondary"
                      _hover={{ color: 'page.fg' }}
                      display="inline-block"
                      py={0.5}
                    >
                      {s.label}
                    </Link>
                    {s.id === 'changelog' ? (
                      <Box
                        as="ul"
                        listStyleType="none"
                        m={0}
                        mt={1}
                        pl={3}
                        borderLeft="1px solid"
                        borderColor="page.border"
                      >
                        {releases.map((r) => (
                          <Box as="li" key={r.version}>
                            <Link
                              href={`#${releaseId(r.version)}`}
                              fontFamily={mono}
                              fontSize="12px"
                              color="page.fg-secondary"
                              className="tnum"
                              _hover={{ color: 'page.fg' }}
                              display="inline-block"
                              py={1}
                            >
                              {r.version}
                            </Link>
                          </Box>
                        ))}
                      </Box>
                    ) : null}
                  </Box>
                ))}
              </Box>
            </Box>

            <Box minW={0}>
              <Section id="stack" title="Stack">
                <Para>
                  Read from the packages installed when the page is built, so the versions are
                  the ones serving it. The same list, with more detail, is on{' '}
                  <InlineLink href="/uses">/uses</InlineLink>.
                </Para>
                {stack.length ? (
                  <Box
                    as="dl"
                    display="grid"
                    gridTemplateColumns={{ base: 'minmax(0,1fr)', sm: '140px minmax(0,1fr)' }}
                    columnGap={6}
                    rowGap={{ base: 1, sm: 3 }}
                    mb={4}
                  >
                    {stack.map((g) => (
                      <React.Fragment key={g.label}>
                        <Text
                          as="dt"
                          fontFamily={mono}
                          fontSize="11px"
                          letterSpacing="0.12em"
                          textTransform="uppercase"
                          color="page.fg-subtle"
                          pt="5px"
                          mt={{ base: 3, sm: 0 }}
                        >
                          {g.label}
                        </Text>
                        <Text as="dd" m={0} fontSize="16px" lineHeight="1.6" color="page.fg">
                          {g.items.map((it, i) => (
                            <React.Fragment key={it.name}>
                              {i ? (
                                <Box as="span" color="page.fg-subtle" aria-hidden>
                                  {' · '}
                                </Box>
                              ) : null}
                              {i ? <span className="sr-only">, </span> : null}
                              {it.name}
                              {it.version ? (
                                <Box
                                  as="span"
                                  fontFamily={mono}
                                  fontSize="12px"
                                  color="page.fg-secondary"
                                  ml={1}
                                  className="tnum"
                                >
                                  {it.version}
                                </Box>
                              ) : null}
                            </React.Fragment>
                          ))}
                        </Text>
                      </React.Fragment>
                    ))}
                  </Box>
                ) : null}
              </Section>

              <Section id="type" title="Type">
                <Para>
                  Set in <strong>Geist</strong> and <strong>Geist Mono</strong> by Vercel, released
                  under the SIL Open Font License 1.1 (
                  <InlineLink href="/fonts/OFL-Geist.txt">licence text</InlineLink>). Both are
                  self-hosted variable fonts — no font CDN, no third-party request — and the same
                  faces render the social cards. Chinese text falls back to the system&rsquo;s CJK
                  fonts.
                </Para>
              </Section>

              <Section id="hosting" title="Hosting">
                <Bullets
                  items={[
                    <>
                      Next.js (Pages Router) and React, built into one Docker image and run on a VPS
                      in Tokyo.
                    </>,
                    <>
                      The container publishes no public port: it is reached only through a
                      Cloudflare Tunnel, and Cloudflare terminates TLS.
                    </>,
                    <>
                      Content lives in SQLite on the server and is mirrored to Cloudflare R2
                      off-site; whole-site snapshots (database, uploads, history) are taken on top
                      of that.
                    </>,
                    <>
                      Pages are server-rendered or regenerated in the background when content
                      changes, and every deploy is health-checked with an automatic rollback.
                    </>,
                  ]}
                />
              </Section>

              <Section id="self-assembling" title="Self-assembling pages">
                <Para>
                  <InlineLink href="/now">/now</InlineLink> shows what I write there when I have
                  written something. Otherwise it assembles itself from data already on the site:
                  current roles and studies from the public CV (entries hidden from the website
                  never appear), the &ldquo;currently coding&rdquo; note from the home page, and the
                  latest post and case study. Its status line gives the date the newest of those
                  sources last changed, and the page regenerates within a minute of a change.
                </Para>
                <Para>
                  <InlineLink href="/uses">/uses</InlineLink> works the same way: my own write-up
                  first when there is one, then the stack above, with the versions this build
                  installed, each time the page is generated.
                </Para>
              </Section>

              <Section id="privacy" title="Privacy & analytics">
                <Para>
                  The site counts visits with its own first-party analytics. There are no cookies,
                  no identifiers stored in your browser and no third-party analytics scripts.
                </Para>
                <Bullets
                  items={[
                    <>
                      Each page view records the path, the referring site (host name only), the
                      country from Cloudflare&rsquo;s country header, a coarse device and browser
                      class, the page language and a visitor ID.
                    </>,
                    <>
                      The visitor ID is a truncated hash of your IP address and browser user agent
                      combined with a secret salt that is kept only in memory and replaced every
                      day. It cannot be reversed, and the same visitor gets a different ID the next
                      day. <strong>Your IP address and user agent are never stored.</strong>
                    </>,
                    <>
                      If your browser sends Do Not Track (<Code>DNT: 1</Code>) or Global Privacy
                      Control (<Code>Sec-GPC: 1</Code>), nothing is recorded. Bots and my own visits
                      are not counted either.
                    </>,
                    <>
                      Real-user performance timings (Core Web Vitals: LCP, INP, CLS, FCP, TTFB) are
                      recorded per page with the device class only — no visitor ID.
                    </>,
                    <>
                      When a page fails with a script error, or your browser blocks something under
                      the content security policy, the site sends itself a report: the error and
                      where in the code it happened (with query strings, e-mail and IP addresses
                      and anything ID-like removed), the page path and the browser family — no
                      visitor ID. Reports are deleted after at most 90 days.
                    </>,
                    <>
                      The data stays in a separate database file on the server, is never part of the
                      content backups or the R2 mirror, and is deleted after at most 400 days.
                    </>,
                  ]}
                />
              </Section>

              <Section id="build" title="Build">
                <Para>
                  This page was generated on{' '}
                  <Box
                    as="time"
                    dateTime={builtAt}
                    fontFamily={mono}
                    fontSize="0.9em"
                    className="tnum"
                  >
                    {builtAt.slice(0, 10)}
                  </Box>
                  {buildSha ? (
                    <>
                      {' '}
                      from commit{' '}
                      <InlineLink href={`${REPO_URL}/commit/${buildSha}`}>
                        <Box as="span" fontFamily={mono} fontSize="0.9em">
                          {buildSha.slice(0, 7)}
                        </Box>
                      </InlineLink>
                    </>
                  ) : null}
                  . The source is on <InlineLink href={REPO_URL}>GitHub</InlineLink>.
                </Para>
              </Section>

              {releases.length ? (
                <Section id="changelog" title="Changelog">
                  {releases.map((r) => (
                    <Box
                      as="article"
                      key={r.version}
                      id={releaseId(r.version)}
                      aria-labelledby={`${releaseId(r.version)}-title`}
                      pt={6}
                      mt={6}
                      borderTop="1px solid"
                      borderColor="page.border"
                      sx={{ scrollMarginTop: ANCHOR_MARGIN }}
                    >
                      <Heading
                        as="h3"
                        id={`${releaseId(r.version)}-title`}
                        fontSize="20px"
                        fontWeight={500}
                        letterSpacing="-0.01em"
                        display="flex"
                        alignItems="baseline"
                        flexWrap="wrap"
                        columnGap={3}
                        mb={3}
                      >
                        <span className="tnum">{r.version}</span>
                        <Box
                          as="time"
                          dateTime={r.date}
                          fontFamily={mono}
                          fontSize="12px"
                          fontWeight={400}
                          color="page.fg-secondary"
                          className="tnum"
                        >
                          {r.date}
                        </Box>
                      </Heading>
                      {r.intro ? <Para>{r.intro}</Para> : null}
                      {r.groups.map((g) => (
                        <Box key={g.title} mt={5}>
                          <Heading
                            as="h4"
                            fontFamily={mono}
                            fontSize="11px"
                            fontWeight={500}
                            letterSpacing="0.12em"
                            textTransform="uppercase"
                            color="page.fg-subtle"
                            mb={2}
                          >
                            {g.title}
                          </Heading>
                          {g.tree ? (
                            <MDXContent tree={g.tree} as="div" />
                          ) : (
                            <Bullets items={g.items} />
                          )}
                        </Box>
                      ))}
                    </Box>
                  ))}
                </Section>
              ) : null}
            </Box>
          </Grid>
        </Box>
      </HeaderFooter>
    </>
  )
}

const SHA_RE = /^[0-9a-f]{7,40}$/i

/** Markdown bullet → readable plain text (emphasis and code markers removed, line breaks unwrapped). */
const plainText = (md: string) =>
  md
    .replace(/\*\*|__|`/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim()

export const getStaticProps: GetStaticProps<Props> = async () => {
  // Read at build time; a missing CHANGELOG.md is a build error, not an empty page.
  const markdown = fs.readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8')
  const releases: Release[] = []
  for (const r of parseChangelog(markdown)) {
    const groups: Group[] = []
    for (const g of r.groups) {
      let tree: MdxTree | null = null
      try {
        tree = (await compileMdx(groupMarkdown(g.items))).tree
      } catch (err) {
        log.warn('colophon: changelog group did not compile; rendering it as plain text', {
          version: r.version,
          group: g.title,
          err,
        })
      }
      groups.push({ title: g.title, tree, items: tree ? [] : g.items.map(plainText) })
    }
    releases.push({ version: r.version, date: r.date, intro: r.intro, groups })
  }
  const sha = (process.env.NEXT_PUBLIC_BUILD_SHA || '').trim()

  return {
    props: {
      releases,
      stack: readStack().groups,
      buildSha: SHA_RE.test(sha) ? sha.toLowerCase() : null,
      builtAt: new Date().toISOString(),
    },
    revalidate: false,
  }
}
