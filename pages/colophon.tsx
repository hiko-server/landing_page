import React, { useCallback, useEffect, useState } from 'react'
import fs from 'fs'
import path from 'path'
import type { GetStaticProps } from 'next'
import NextLink from 'next/link'
import { Box, Grid, Heading, Link, Text, chakra } from '@chakra-ui/react'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import PageHeader from '../components/General-UI/PageHeader'
import { Collapse } from '../components/General-UI/Collapse'
import MDXContent from '../components/MDX/MDXContent'
import { compileMdx } from '../lib/mdx'
import { groupMarkdown, parseChangelog } from '../lib/changelog'
import { readStack, type StackGroup } from '../lib/stack'
import { log } from '../lib/log'
import { absUrl, breadcrumb, personAuthor } from '../lib/schema'
import { ogPresetUrl } from '../lib/og/presets'
import { clearOfHeader } from '../lib/anchorOffset'
import { REPO_URL, normalizeBuildSha } from '../lib/build'
import { releaseAnchor, releaseChangeCount, releaseIdFromHash } from '../lib/releaseTimeline'
import { ChevronDownIcon } from '../components/Icons/ui/chrome'

/**
 * /colophon — how the site is made: stack (lib/stack.ts, installed versions),
 * type, hosting, how /now and /uses assemble themselves, exactly what the
 * first-party analytics stores, the build this page came from and every
 * release from CHANGELOG.md — as a timeline where each release shows its
 * summary (the paragraph under its heading) and only the latest one opens
 * its full notes; the others open on demand or when their anchor
 * (#v2-2-0, the "On this page" links) is followed.
 *
 * Static (revalidate: false): CHANGELOG.md and package.json are read at build
 * time and the parsed, compiled result ships in the page JSON, so nothing
 * here touches the filesystem at runtime. A changelog group that does not
 * compile is shown as plain text rather than dropped.
 */

type MdxTree = Awaited<ReturnType<typeof compileMdx>>['tree']
/** `items` (plain-text bullets) ship only for a group whose markdown did not compile; `count` is the number of bullets. */
type Group = { title: string; tree: MdxTree | null; items: string[]; count: number }
type Release = { version: string; date: string; intro: string; groups: Group[] }

type Props = {
  releases: Release[]
  stack: StackGroup[]
  /** Commit the image was built from (NEXT_PUBLIC_BUILD_SHA), or null. */
  buildSha: string | null
  /** ISO timestamp of the build that generated this page. */
  builtAt: string
}

const mono = 'var(--font-geist-mono), monospace'
const releaseId = releaseAnchor
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

/**
 * Release history: a rail of releases, newest first. Each shows its version,
 * date and summary; its full notes sit in a disclosure that only the latest
 * release opens by default. Following a release's anchor opens it.
 */
function ReleaseTimeline({ releases }: { releases: Release[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(releases[0] ? [releases[0].version] : []))
  const toggle = useCallback((version: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(version)) next.delete(version)
      else next.add(version)
      return next
    })
  }, [])

  // #v2-2-0 (the "On this page" links, a shared link): open that release.
  useEffect(() => {
    const versions = releases.map((r) => r.version)
    const openFromHash = () => {
      const version = releaseIdFromHash(window.location.hash, versions)
      if (version) setOpen((prev) => (prev.has(version) ? prev : new Set(prev).add(version)))
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [releases])

  return (
    <Box
      as="ol"
      listStyleType="none"
      m={0}
      p={0}
      position="relative"
      sx={{
        // The rail: a hairline through every release dot.
        '&::before': {
          content: '""',
          position: 'absolute',
          left: '5px',
          top: '10px',
          bottom: '10px',
          width: '1px',
          bg: 'page.border',
        },
      }}
    >
      {releases.map((r, i) => {
        const id = releaseId(r.version)
        const isOpen = open.has(r.version)
        const latest = i === 0
        const changes = releaseChangeCount(r.groups)
        return (
          <Box
            as="li"
            key={r.version}
            id={id}
            aria-labelledby={`${id}-title`}
            position="relative"
            pl={8}
            pb={i === releases.length - 1 ? 0 : 10}
            sx={{ scrollMarginTop: ANCHOR_MARGIN }}
          >
            <Box
              aria-hidden
              position="absolute"
              left={0}
              top="7px"
              w="11px"
              h="11px"
              borderRadius="full"
              border="1px solid"
              borderColor={latest ? 'var(--accent)' : 'page.border-strong'}
              bg={latest ? 'var(--accent)' : 'page.bg'}
              boxShadow={latest ? '0 0 0 4px var(--accent-soft)' : 'none'}
              sx={{ '@media (forced-colors: active)': { bg: latest ? 'CanvasText' : 'Canvas', borderColor: 'CanvasText' } }}
            />
            <Heading
              as="h3"
              id={`${id}-title`}
              fontSize="20px"
              fontWeight={500}
              letterSpacing="-0.01em"
              display="flex"
              alignItems="baseline"
              flexWrap="wrap"
              columnGap={3}
              rowGap={1}
              mb={2}
            >
              <span className="tnum">{r.version}</span>
              <Box as="time" dateTime={r.date} fontFamily={mono} fontSize="12px" fontWeight={400} color="page.fg-secondary" className="tnum">
                {r.date}
              </Box>
              {latest ? (
                <Box
                  as="span"
                  fontFamily={mono}
                  fontSize="10px"
                  fontWeight={500}
                  letterSpacing="0.12em"
                  textTransform="uppercase"
                  color="accent.text"
                  border="1px solid"
                  borderColor="var(--accent-ring)"
                  borderRadius="full"
                  px={2}
                  py="1px"
                  alignSelf="center"
                >
                  Latest
                </Box>
              ) : null}
            </Heading>
            {r.intro ? <Para>{r.intro}</Para> : null}
            {r.groups.length > 0 && (
              <>
                <chakra.button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`${id}-notes`}
                  onClick={() => toggle(r.version)}
                  display="inline-flex"
                  alignItems="center"
                  gap={2}
                  minH="44px"
                  fontFamily={mono}
                  fontSize="12px"
                  letterSpacing="0.02em"
                  color="accent.text"
                  _hover={{ textDecoration: 'underline', textUnderlineOffset: '3px' }}
                  _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px', borderRadius: '4px' }}
                >
                  {isOpen ? 'Hide full notes' : 'Full notes'}
                  <Box as="span" color="page.fg-secondary" className="tnum">
                    · {changes} {changes === 1 ? 'change' : 'changes'}
                  </Box>
                  <Box
                    as="span"
                    aria-hidden
                    display="inline-flex"
                    transition="transform var(--duration-base) var(--ease-standard)"
                    transform={isOpen ? 'rotate(180deg)' : 'none'}
                  >
                    <ChevronDownIcon size="xs" />
                  </Box>
                </chakra.button>
                <Collapse open={isOpen} id={`${id}-notes`}>
                  <Box pt={2}>
                    {r.groups.map((g) => (
                      <Box key={g.title} mt={4}>
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
                        {g.tree ? <MDXContent tree={g.tree} as="div" /> : <Bullets items={g.items} />}
                      </Box>
                    ))}
                  </Box>
                </Collapse>
              </>
            )}
          </Box>
        )
      })}
    </Box>
  )
}

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
                <Para>
                  Interface icons are <strong>Lucide</strong> outline icons, released under the ISC
                  licence (the ones derived from Feather under MIT;{' '}
                  <InlineLink href="/licenses/lucide.txt">licence text</InlineLink>). They are
                  inlined as SVG, sized on a 4&nbsp;px grid; the brand marks are Font Awesome Free
                  brands (CC BY 4.0).
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
                  The site counts visits, and a few actions such as CV downloads, with its own
                  first-party analytics. There are no cookies, no identifiers stored in your browser
                  and no third-party analytics scripts.
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
                      A few actions are counted as events, each with at most one detail from a fixed
                      list: downloading the CV (its language and format) or printing it (its
                      language), saving the vCard, clicking an e-mail link (the page it was on, never
                      the address), clicking a link to another site (that site&rsquo;s host name
                      only, never the full address), sending the contact form (only the topic you
                      picked &mdash; role, freelance project, collaboration or other &mdash; never what
                      you wrote) and reaching the end of a post or case study after scrolling through
                      it (its path). An event also records the day and the visitor ID above, which
                      links a visit to a download on the same day and on no other. CV downloads,
                      vCard saves and sent messages are counted by the server as it answers; the
                      others are sent by a few lines of script on the page.
                    </>,
                    <>
                      When a search in the <Code>⌘K</Code> palette finds nothing, the search text is
                      recorded so I can see what people look for and do not find: lowercased, cut to
                      40 characters, and only when it contains no <Code>@</Code> and fewer than six
                      digits, so e-mail addresses and phone, ID or order numbers are never kept.
                      These searches and their daily totals are deleted after 35 days.
                    </>,
                    <>
                      If your browser sends Do Not Track (<Code>DNT: 1</Code>) or Global Privacy
                      Control (<Code>Sec-GPC: 1</Code>), nothing is recorded &mdash; no page views and
                      no events. Bots, automated browsers and my own visits are not counted either.
                    </>,
                    <>
                      Real-user performance timings (Core Web Vitals: LCP, INP, CLS, FCP, TTFB) are
                      recorded per page with the device class only — no visitor ID.
                    </>,
                    <>
                      When a page fails with a script error, or your browser blocks or flags something
                      under the content security policy, the site sends itself a report: the error and
                      where in the code it happened (with query strings, e-mail and IP addresses
                      and anything ID-like removed), the page path and the browser family — no
                      visitor ID. Reports are deleted after at most 90 days.
                    </>,
                    <>
                      The data stays in a separate database file on the server and is never part of
                      the content backups or the R2 mirror. Page views and events &mdash; the only
                      records with a visitor ID &mdash; are deleted after 35 days; the daily totals
                      counted from them, after at most 400 days.
                    </>,
                  ]}
                />
                <Para>
                  Videos in articles are click-to-load. Until you press play, the page shows a still
                  image stored on this site and makes no request to YouTube or Vimeo. Pressing play
                  loads the player from <Code>youtube-nocookie.com</Code> (YouTube&rsquo;s
                  privacy-enhanced mode) or <Code>player.vimeo.com</Code> (with Do Not Track), and
                  their own privacy policies apply from then on.
                </Para>
                <Para>
                  Messages sent through the <InlineLink href="/contact">contact form</InlineLink> are
                  handled separately:
                </Para>
                <Bullets
                  items={[
                    <>
                      What you type — your name, e-mail address, message and any details you add
                      about a role or project — is stored in a private inbox on this server, and may
                      be forwarded to my own mailbox, only so I can reply. It is never shared,
                      published or used for anything else. The form sets no cookie; an unsent draft
                      is kept only in your own browser and cleared when you send it.
                    </>,
                    <>
                      Messages are deleted automatically after the period stated under the form (12
                      months unless configured otherwise); a nightly job removes older ones. Full-site
                      backups, which include the inbox, are rotated, and backups older than that
                      period are deleted as well (the newest one is always kept).
                    </>,
                    <>
                      To have a message deleted sooner, write to the address on the contact page.
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
                  <ReleaseTimeline releases={releases} />
                </Section>
              ) : null}
            </Box>
          </Grid>
        </Box>
      </HeaderFooter>
    </>
  )
}

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
      groups.push({ title: g.title, tree, items: tree ? [] : g.items.map(plainText), count: g.items.length })
    }
    releases.push({ version: r.version, date: r.date, intro: r.intro, groups })
  }

  return {
    props: {
      releases,
      stack: readStack().groups,
      buildSha: normalizeBuildSha(process.env.NEXT_PUBLIC_BUILD_SHA),
      builtAt: new Date().toISOString(),
    },
    revalidate: false,
  }
}
