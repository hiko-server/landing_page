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
import CoverFrame from '../../components/Work/CoverFrame'
import ProjectArchive, { archiveColumns } from '../../components/Work/ProjectArchive'
import TagFilterBar, { TagPrepaint, useTagFilter } from '../../components/Article/TagFilter'
import { hasTag, tagCounts, tagSlugList } from '../../lib/tagFilter'
import { absUrl, PERSON_NAME } from '../../lib/schema'
import { ogPresetUrl } from '../../lib/og/presets'
import { cssTransition, textStyleProps } from '../../theme/tokens'
import { StarIcon } from '../../components/Icons/ui/content'
import { fillUi } from '../../lib/uiStrings'
import type { ListStrings } from '../../lib/uiStrings/lists'
import type { WorkCardData, WorkIndexProps } from '../../lib/indexPages'

/**
 * /work — case studies, featured first, then "All projects": every project
 * of the public CV (E8). Every card has the same 16:10 cover slot — the
 * cover around its focal point, a small cover on a tinted panel instead of
 * stretched, or a typographic cover (D2) — and shows the owner's headline
 * metric when there is one (D1). The cards are cursor-lit (`.spotlight`,
 * one pointer listener on the grid via useSpotlight), lift on hover and
 * press in on click (motion only when allowed); the whole card is the hit
 * area (stretched title link). A tag filter over the stacks of both lists
 * is shareable as `?tag=` (D8). Opening a card morphs its title and cover
 * into the case-study page's, and Back flies them home (data-vt-morph,
 * lib/viewTransition.ts). ISR (60 s), regenerated on case-study and CV saves.
 *
 * /zh/work (pages/zh/work.tsx, F3) renders this page with the case studies
 * in Chinese, the Chinese CV's projects and Chinese words; it exists only
 * while a Chinese case study is published (lib/indexPages). The words arrive
 * with the props in the page's language (lib/uiStrings/lists).
 */

export type Props = WorkIndexProps

/** `lang` of a card's own text where it is not the page's language. */
const ownLang = (w: WorkCardData, pageLang: string) => (w.lang === pageLang ? undefined : w.lang)

const FEATURED_SIZES = '(min-width: 768px) 320px, calc(100vw - 2rem)'
const GRID_SIZES = '(min-width: 1100px) 500px, (min-width: 768px) calc(50vw - 3rem), calc(100vw - 2rem)'

// Status tokens (theme/color.ts): AA at label size in both modes and right on the first paint.
const liveColor = 'status.live'
const featuredColor = 'status.featured'

/** Status shown on a card: live and archived say something; every entry here is a case study. */
const STATUS: Record<'live' | 'archived', { color: string; border: string }> = {
  live: { color: liveColor, border: 'status.live-border' },
  archived: { color: 'page.fg-secondary', border: 'page.border-strong' },
}

function StatusPill({ status, t }: { status: WorkCardData['status']; t: ListStrings }) {
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
      {t.work[status]}
    </Flex>
  )
}

function WorkCard({ w, featured, first, t, pageLang }: { w: WorkCardData; featured: boolean; first: boolean; t: ListStrings; pageLang: string }) {
  const titleLang = ownLang(w, pageLang)
  const cover = (
    <CoverFrame
      cover={w.cover}
      title={w.title}
      wordmark={w.wordmark}
      eyebrow={w.period || undefined}
      sizes={featured ? FEATURED_SIZES : GRID_SIZES}
      eager={first}
      morph={!!w.cover}
      decorative
    />
  )

  const body = (
    <Flex direction="column" flex="1" minW={0}>
      <Flex justify="space-between" align="center" gap={3} mb={featured ? 3 : 3}>
        {featured ? (
          <Text textStyle="label" color={featuredColor} className="tnum" display="inline-flex" alignItems="center" gap={1.5}>
            <StarIcon size="xs" />
            <span>
              {t.work.featured} · {w.period || '—'}
            </span>
          </Text>
        ) : (
          <Text fontFamily="mono" fontSize="label" color="page.fg-secondary" className="tnum">
            {w.period || '—'}
          </Text>
        )}
        <StatusPill status={w.status} t={t} />
      </Flex>
      <Heading
        as="h2"
        {...textStyleProps(featured ? 'title-lg' : 'title-md')}
        fontWeight={500}
        mb={featured ? 3 : 2}
        lang={titleLang}
        data-vt-part="title"
      >
        <NextLink href={w.permalink} className="stretched-link">
          {w.title}
        </NextLink>
      </Heading>
      {w.description && (
        <Text color="page.fg-secondary" fontSize="small" mb={4} noOfLines={featured ? 4 : 3} lang={titleLang}>
          {w.description}
        </Text>
      )}
      {w.alsoIn.length > 0 && (
        <Text fontFamily="mono" fontSize="label" color="page.fg-secondary" mt={-2} mb={4} data-also-in="">
          {t.alsoIn}{' '}
          {w.alsoIn.map((l, i) => (
            <span key={l.lang}>
              {i > 0 ? ', ' : ''}
              <span lang={l.lang}>{l.name}</span>
            </span>
          ))}
        </Text>
      )}
      {w.metric ? (
        <Text as="p" display="flex" alignItems="baseline" gap={2} fontSize="small" fontWeight={500} color="page.fg" mb={4} className="tnum" lang={titleLang}>
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
      className="spotlight work-card pressable"
      data-spotlight=""
      data-vt-morph={w.permalink}
      data-kbd-item=""
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

export default function WorkIndex({ items, archive, ui, lang, alternates, nameZh }: Props) {
  const t = ui.t
  const zh = lang !== 'en'
  const path = zh ? '/zh/work' : '/work'
  const owner = zh && nameZh ? `${nameZh}（Lucian）` : PERSON_NAME
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
        title={t.work.title}
        description={
          items.length
            ? fillUi(t.work.descriptionWith, {
                name: owner,
                titles: items
                  .slice(0, 2)
                  .map((w) => w.title)
                  .join(t.work.and),
              })
            : fillUi(t.work.description, { name: owner })
        }
        url={absUrl(path)}
        image={ogPresetUrl('work')}
        lang={lang}
        nameZh={nameZh}
        alternates={alternates}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: t.work.listName,
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
          <PageHeader eyebrow={t.work.eyebrow} title={t.work.heading} lede={t.work.lede} />

          {showFilter ? (
            <TagFilterBar
              tags={tags}
              total={items.length + archive.length}
              active={active}
              onSelect={select}
              label={t.work.filterLabel}
              noun={{ one: t.work.nounOne, many: t.work.nounMany }}
              allLabel={t.allTags}
              announcement={t.taggedAnnouncement}
              matching={shown.length + shownArchive.length}
            />
          ) : null}
          {showFilter ? <TagPrepaint tags={tags} /> : null}

          {items.length === 0 ? (
            <EmptyState
              title={t.work.emptyTitle}
              actions={[
                { label: t.nav.writing, href: zh ? '/zh/blog' : '/blog' },
                { label: t.nav.cv, href: zh ? '/cv/zh' : '/cv' },
              ]}
              actionsLabel={t.whereNext}
            >
              {t.work.emptyBody}
            </EmptyState>
          ) : (
            <Box ref={gridRef}>
              {active && shown.length === 0 ? (
                <Text textStyle="meta" color="page.fg-secondary" py={4}>
                  {t.work.noCaseStudyUses}
                </Text>
              ) : null}
              {featured.length > 0 && (
                <Flex direction="column" gap={4} mb={[6, 10]}>
                  {featured.map((w) => (
                    <WorkCard key={w.slug} w={w} featured first={w.slug === firstSlug} t={t} pageLang={lang} />
                  ))}
                </Flex>
              )}
              <SimpleGrid columns={[1, 1, 2]} spacing={[4, 6]}>
                {rest.map((w) => (
                  <WorkCard key={w.slug} w={w} featured={false} first={w.slug === firstSlug} t={t} pageLang={lang} />
                ))}
              </SimpleGrid>
            </Box>
          )}

          <ProjectArchive rows={shownArchive} total={archive.length} columns={columns} emptyNote={active ? t.archive.noneUsesThis : undefined} t={t.archive} />
        </PageGrid>
      </HeaderFooter>
    </>
  )
}

export const getStaticProps: GetStaticProps<Props> = async () => (await import('../../lib/indexPages')).loadWorkIndex('en')
