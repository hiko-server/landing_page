import { useMemo, useRef } from 'react'
import type { GetStaticProps } from 'next'
import { Box, Heading, Text, Flex, SimpleGrid } from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import PageHeader from '../../components/General-UI/PageHeader'
import PageGrid from '../../components/General-UI/PageGrid'
import EmptyState from '../../components/General-UI/EmptyState'
import { useSpotlight } from '../../components/General-UI/useSpotlight'
import CoverFrame, { type CoverView } from '../../components/Work/CoverFrame'
import ProjectArchive, { archiveColumns } from '../../components/Work/ProjectArchive'
import TagFilterBar, { TagPrepaint, useTagFilter } from '../../components/Article/TagFilter'
import { listWorkInDisplayOrder } from '../../lib/mdx'
import { coverWordmark, primaryOutcome } from '../../lib/caseStudy'
import { hasTag, tagCounts, tagSlugList } from '../../lib/tagFilter'
import type { ArchiveRow } from '../../lib/projectArchive'
import { absUrl, PERSON_NAME } from '../../lib/schema'
import { ogPresetUrl } from '../../lib/og/presets'
import { cssTransition, textStyleProps } from '../../theme/tokens'
import { StarIcon } from '../../components/Icons/ui/content'

/**
 * /work — case studies, featured first, then "All projects": every project
 * of the public CV (E8). Every card has the same 16:10 cover slot — the
 * cover around its focal point, a small cover on a tinted panel instead of
 * stretched, or a typographic cover (D2) — and shows the owner's headline
 * metric when there is one (D1). The cards are cursor-lit (`.spotlight`,
 * one pointer listener on the grid via useSpotlight), lift on hover and
 * press in on click (motion only when allowed); the whole card is the hit
 * area (stretched title link). A tag filter over the stacks of both lists
 * is shareable as `?tag=` (D8). The first card's cover shares a
 * view-transition name with the case-study page's cover, so it morphs on
 * navigation. ISR (60 s), regenerated on case-study and CV saves.
 */

type WorkCardData = {
  slug: string
  permalink: string
  lang: string
  title: string
  description: string | null
  period: string | null
  status: 'live' | 'archived' | 'case-study' | null
  featured: boolean
  tech: string[]
  cover: CoverView | null
  /** Short name for the typographic cover ("SWCS"). */
  wordmark: string
  /** "93.59% offline classifier accuracy" — the first of the owner's metrics; null when none. */
  metric: string | null
}

type Props = {
  items: WorkCardData[]
  archive: ArchiveRow[]
}

const titleLang = (w: WorkCardData) => (w.lang === 'en' ? undefined : w.lang)

const FEATURED_SIZES = '(min-width: 768px) 320px, calc(100vw - 2rem)'
const GRID_SIZES = '(min-width: 1100px) 500px, (min-width: 768px) calc(50vw - 3rem), calc(100vw - 2rem)'

// Status tokens (theme/color.ts): AA at label size in both modes and right on the first paint.
const liveColor = 'status.live'
const featuredColor = 'status.featured'

/** Status shown on a card: live and archived say something; every entry here is a case study. */
const STATUS: Record<'live' | 'archived', { label: string; color: string; border: string }> = {
  live: { label: 'Live', color: liveColor, border: 'status.live-border' },
  archived: { label: 'Archived', color: 'page.fg-secondary', border: 'page.border-strong' },
}

function StatusPill({ status }: { status: WorkCardData['status'] }) {
  if (status !== 'live' && status !== 'archived') return null
  const s = STATUS[status]
  return (
    <Flex
      as="span"
      align="center"
      gap={1.5}
      textStyle="label"
      letterSpacing="caps-tight"
      color={s.color}
      border="1px solid"
      borderColor={s.border}
      px={2}
      py={0.5}
      borderRadius="pill"
      flexShrink={0}
    >
      {status === 'live' ? <Box as="span" aria-hidden w="6px" h="6px" borderRadius="pill" bg="currentColor" /> : null}
      {s.label}
    </Flex>
  )
}

function WorkCard({ w, featured, first }: { w: WorkCardData; featured: boolean; first: boolean }) {
  const cover = (
    <CoverFrame
      cover={w.cover}
      title={w.title}
      wordmark={w.wordmark}
      eyebrow={w.period || undefined}
      sizes={featured ? FEATURED_SIZES : GRID_SIZES}
      eager={first}
      vtName={first && w.cover ? `vt-work-cover-${w.slug}` : undefined}
      decorative
    />
  )

  const body = (
    <Flex direction="column" flex="1" minW={0}>
      <Flex justify="space-between" align="center" gap={3} mb={featured ? 3 : 3}>
        {featured ? (
          <Text textStyle="label" color={featuredColor} className="tnum" display="inline-flex" alignItems="center" gap={1.5}>
            <StarIcon size="xs" />
            <span>Featured · {w.period || '—'}</span>
          </Text>
        ) : (
          <Text fontFamily="mono" fontSize="label" color="page.fg-secondary" className="tnum">
            {w.period || '—'}
          </Text>
        )}
        <StatusPill status={w.status} />
      </Flex>
      <Heading
        as="h2"
        {...textStyleProps(featured ? 'title-lg' : 'title-md')}
        fontWeight={500}
        mb={featured ? 3 : 2}
        lang={titleLang(w)}
        style={{ viewTransitionName: `vt-work-${w.slug}` }}
      >
        <NextLink href={w.permalink} className="stretched-link">
          {w.title}
        </NextLink>
      </Heading>
      {w.description && (
        <Text color="page.fg-secondary" fontSize="small" mb={4} noOfLines={featured ? 4 : 3} lang={titleLang(w)}>
          {w.description}
        </Text>
      )}
      {w.metric ? (
        <Text as="p" display="flex" alignItems="baseline" gap={2} fontSize="small" fontWeight={500} color="page.fg" mb={4} className="tnum" lang={titleLang(w)}>
          <Box as="span" aria-hidden w="6px" h="6px" borderRadius="pill" bg="var(--accent)" flexShrink={0} transform="translateY(-1px)" />
          {w.metric}
        </Text>
      ) : null}
      {w.tech.length > 0 && (
        <Flex gap={2} wrap="wrap" fontFamily="mono" fontSize="label" color="page.fg-secondary" mt="auto">
          {w.tech.slice(0, featured ? 8 : 5).map((t) => (
            <Text as="span" key={t}>
              {t}
            </Text>
          ))}
        </Flex>
      )}
    </Flex>
  )

  return (
    <Box
      as="article"
      className="spotlight work-card"
      data-spotlight=""
      data-tag-item=""
      data-tag-slugs={tagSlugList(w.tech)}
      position="relative"
      display="flex"
      flexDirection="column"
      h="100%"
      bg="page.surface"
      border="1px solid"
      borderColor="page.border"
      borderRadius="card"
      p={featured ? [5, 7] : [5, 6]}
      transition={cssTransition(['border-color', 'transform', 'box-shadow'], 'base')}
      _hover={{ borderColor: 'page.border-strong' }}
      _focusWithin={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
      sx={{
        '& a': { color: 'inherit', textDecoration: 'none' },
        '& a:focus-visible': { outline: 'none' },
        '@media (hover: hover) and (prefers-reduced-motion: no-preference)': {
          '& .work-cover img': { transition: cssTransition('transform', 'slow') },
          '&:hover': { transform: 'translateY(-2px)', boxShadow: 'elevation.md' },
          '&:hover .work-cover[data-cover="image"] img': { transform: 'scale(1.02)' },
          '&:active': { transform: 'translateY(0) scale(0.995)', transitionDuration: 'var(--duration-fast)' },
        },
      }}
    >
      {featured ? (
        <Flex direction={['column', 'column', 'row']} gap={[5, 6, 8]} align="stretch">
          <Box w="100%" maxW={{ md: '320px' }} flexShrink={0}>
            {cover}
          </Box>
          {body}
        </Flex>
      ) : (
        <>
          <Box mb={5}>{cover}</Box>
          {body}
        </>
      )}
    </Box>
  )
}

export default function WorkIndex({ items, archive }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  useSpotlight(gridRef)

  const tags = useMemo(() => tagCounts([...items.map((w) => w.tech), ...archive.map((r) => r.stack)]), [items, archive])
  const { active, select } = useTagFilter(tags)

  const shown = useMemo(() => (active ? items.filter((w) => hasTag(w.tech, active)) : items), [items, active])
  const shownArchive = useMemo(() => (active ? archive.filter((r) => hasTag(r.stack, active)) : archive), [archive, active])
  const columns = useMemo(() => archiveColumns(archive), [archive])

  // Featured rows render full-width; everything else stays in the 2-col
  // grid. (`items` already arrives featured-first.)
  const featured = shown.filter((w) => w.featured)
  const rest = shown.filter((w) => !w.featured)
  const firstSlug = items[0]?.slug
  const showFilter = tags.length > 0 && items.length + archive.length > 1

  return (
    <>
      <CustomHead
        title="Work"
        description={
          `Selected project case studies and engineering write-ups by ${PERSON_NAME}` +
          (items.length
            ? ` — including ${items
                .slice(0, 2)
                .map((w) => w.title)
                .join(' and ')}.`
            : '.')
        }
        url={absUrl('/work')}
        image={ogPresetUrl('work')}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Selected Work',
          itemListElement: items.map((w, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: absUrl(w.permalink),
            name: w.title,
          })),
        }}
      />
      <HeaderFooter>
        <PageGrid py={[12, 16]}>
          <PageHeader
            eyebrow="Case studies"
            title="Projects that shipped, with the story."
            lede="Each entry is a written case study: the problem, the constraints, the decisions, and the outcome. No bullet points pretending to be a CV."
          />

          {showFilter ? (
            <TagFilterBar
              tags={tags}
              total={items.length + archive.length}
              active={active}
              onSelect={select}
              label="Filter projects by technology"
              noun={{ one: 'project', many: 'projects' }}
              matching={shown.length + shownArchive.length}
            />
          ) : null}
          {showFilter ? <TagPrepaint tags={tags} /> : null}

          {items.length === 0 ? (
            <EmptyState
              title="No case studies yet"
              actions={[
                { label: 'Writing', href: '/blog' },
                { label: 'CV', href: '/cv' },
              ]}
            >
              Case studies will appear here as they&rsquo;re published.
            </EmptyState>
          ) : (
            <Box ref={gridRef}>
              {active && shown.length === 0 ? (
                <Text textStyle="meta" color="page.fg-secondary" py={4}>
                  No case study uses this yet — see the projects below.
                </Text>
              ) : null}
              {featured.length > 0 && (
                <Flex direction="column" gap={4} mb={[6, 10]}>
                  {featured.map((w) => (
                    <WorkCard key={w.slug} w={w} featured first={w.slug === firstSlug} />
                  ))}
                </Flex>
              )}
              <SimpleGrid columns={[1, 1, 2]} spacing={[4, 6]}>
                {rest.map((w) => (
                  <WorkCard key={w.slug} w={w} featured={false} first={w.slug === firstSlug} />
                ))}
              </SimpleGrid>
            </Box>
          )}

          <ProjectArchive rows={shownArchive} total={archive.length} columns={columns} emptyNote={active ? 'No project in the archive lists this.' : undefined} />
        </PageGrid>
      </HeaderFooter>
    </>
  )
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export const getStaticProps: GetStaticProps<Props> = async () => {
  const [{ resolveCover }, { archiveRows }] = await Promise.all([import('../../lib/coverImage'), import('../../lib/projectArchive')])
  const works = listWorkInDisplayOrder()
  const items: WorkCardData[] = works.map((w) => {
    const fm = w.frontmatter
    return {
      slug: w.slug,
      permalink: w.permalink,
      lang: w.lang,
      title: fm.title,
      description: str(fm.description),
      period: str(fm.period),
      status: fm.status === 'live' || fm.status === 'archived' || fm.status === 'case-study' ? fm.status : null,
      featured: fm.featured === true,
      tech: Array.isArray(fm.tech) ? fm.tech.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [],
      cover: resolveCover(fm.cover, '', fm.coverFocus),
      wordmark: coverWordmark(fm.title),
      metric: primaryOutcome(fm.outcomes) || null,
    }
  })

  let archive: ArchiveRow[] = []
  try {
    const { readPublicCvSections } = await import('../../lib/cvdata')
    const cv = readPublicCvSections('website', ['project'], ['en'])
    archive = archiveRows(
      cv.en,
      works.map((w) => ({
        slug: w.slug,
        title: w.frontmatter.title,
        permalink: w.permalink,
        role: w.frontmatter.role,
        tech: w.frontmatter.tech,
        link: w.frontmatter.link,
        repo: w.frontmatter.repo,
      })),
    )
  } catch {
    /* no CV: the archive is left out */
  }

  return {
    props: { items, archive },
    revalidate: 60,
  }
}
