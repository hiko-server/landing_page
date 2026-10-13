import React, { useMemo, useRef } from 'react'
import type { GetStaticProps } from 'next'
import { Box, Heading, Text, Flex, SimpleGrid, useColorModeValue } from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import PageHeader from '../../components/General-UI/PageHeader'
import { useSpotlight } from '../../components/General-UI/useSpotlight'
import { listWorkInDisplayOrder, type WorkFrontmatter, type MDXIndexEntry } from '../../lib/mdx'
import { variantSrcSet } from '../../lib/uploadVariants'
import { absUrl, ogImageUrl, PERSON_NAME } from '../../lib/schema'

/**
 * /work — case studies, featured first. Cards with a frontmatter cover show
 * it at 16:10 (responsive srcset from the upload variants, computed at
 * generation time); cards without one keep the text layout. The cards are
 * cursor-lit (`.spotlight`, one pointer listener on the grid via
 * useSpotlight) and the whole card is the hit area (stretched title link).
 * The first card's cover shares a view-transition name with the case-study
 * page's cover, so it morphs on navigation. ISR (60 s).
 */

type CoverImage = { src: string; srcSet?: string }
type WorkItem = MDXIndexEntry<WorkFrontmatter> & { coverImage: CoverImage | null }

type Props = {
  items: WorkItem[]
}

const monoFont = 'var(--font-geist-mono), monospace'
const titleLang = (w: WorkItem) => (w.lang === 'en' ? undefined : w.lang)

const FEATURED_SIZES = '(min-width: 768px) 320px, calc(100vw - 2rem)'
const GRID_SIZES =
  '(min-width: 1100px) 500px, (min-width: 768px) calc(50vw - 3rem), calc(100vw - 2rem)'

function Cover({
  image,
  slug,
  first,
  sizes,
}: {
  image: CoverImage
  slug: string
  first: boolean
  sizes: string
}) {
  return (
    <Box
      className="work-cover"
      position="relative"
      overflow="hidden"
      borderRadius="md"
      border="1px solid"
      borderColor="page.border"
      bg="page.bg-elevated"
      sx={{ aspectRatio: '16 / 10' }}
    >
      {/* Decorative in the card: the title right after it is the link's name. A plain <img> with
          the upload variants' srcset: the site never uses the Next image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.src}
        srcSet={image.srcSet}
        sizes={image.srcSet ? sizes : undefined}
        alt=""
        width={1600}
        height={1000}
        // The first card is usually in the first viewport: don't lazy-load the likely LCP image.
        loading={first ? 'eager' : 'lazy'}
        decoding="async"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          ...(first
            ? ({ viewTransitionName: `vt-work-cover-${slug}` } as React.CSSProperties)
            : null),
        }}
      />
    </Box>
  )
}

function WorkCard({ w, featured, first }: { w: WorkItem; featured: boolean; first: boolean }) {
  // AA contrast on both themes (#22c55e / #a855f7 at 10px failed on light).
  const liveColor = useColorModeValue('green.700', 'green.300')
  const featuredColor = useColorModeValue('purple.700', 'purple.300')
  const fm = w.frontmatter
  const cover = w.coverImage

  const status = fm.status ? (
    <Text
      fontFamily={monoFont}
      fontSize="10px"
      letterSpacing="0.08em"
      textTransform="uppercase"
      color={fm.status === 'live' ? liveColor : 'page.fg-secondary'}
      border="1px solid"
      borderColor={fm.status === 'live' ? '#22c55e44' : 'page.border'}
      px={2}
      py={0.5}
      borderRadius="sm"
      flexShrink={0}
    >
      {fm.status}
    </Text>
  ) : null

  const body = (
    <Box flex="1" minW={0}>
      <Flex justify="space-between" align="flex-start" gap={3} mb={featured ? 3 : 4}>
        {featured ? (
          <Text
            fontFamily={monoFont}
            fontSize="10px"
            letterSpacing="0.12em"
            textTransform="uppercase"
            color={featuredColor}
            className="tnum"
          >
            ★ Featured · {fm.period || '—'}
          </Text>
        ) : (
          <Text fontFamily={monoFont} fontSize="11px" color="page.fg-secondary" className="tnum">
            {fm.period || '—'}
          </Text>
        )}
        {status}
      </Flex>
      <Heading
        as="h2"
        size={featured ? 'lg' : 'md'}
        mb={featured ? 3 : 2}
        fontWeight={500}
        letterSpacing={featured ? '-0.02em' : '-0.015em'}
        lang={titleLang(w)}
        style={{ viewTransitionName: `vt-work-${w.slug}` }}
      >
        <NextLink href={w.permalink} className="stretched-link">
          {fm.title}
        </NextLink>
      </Heading>
      {fm.description && (
        <Text
          color="page.fg-secondary"
          fontSize={featured ? '15px' : '14px'}
          mb={4}
          noOfLines={featured ? 4 : 3}
        >
          {fm.description}
        </Text>
      )}
      {fm.tech && fm.tech.length > 0 && (
        <Flex
          gap={2}
          wrap="wrap"
          fontFamily={monoFont}
          fontSize={featured ? '11px' : '10px'}
          color="page.fg-secondary"
        >
          {fm.tech.slice(0, featured ? 8 : 5).map((t) => (
            <Text as="span" key={t}>
              {t}
            </Text>
          ))}
        </Flex>
      )}
    </Box>
  )

  return (
    <Box
      as="article"
      className="spotlight"
      data-spotlight=""
      position="relative"
      bg="page.surface"
      border="1px solid"
      borderColor="page.border"
      borderRadius="lg"
      p={featured ? [6, 8] : 6}
      transition="border-color 250ms var(--ease-out-quart)"
      _hover={{ borderColor: 'page.border-strong' }}
      _focusWithin={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
      sx={{
        '& a': { color: 'inherit', textDecoration: 'none' },
        '& a:focus-visible': { outline: 'none' },
        '@media (hover: hover) and (prefers-reduced-motion: no-preference)': {
          '& .work-cover img': { transition: 'transform 300ms var(--ease-out-quart)' },
          '&:hover .work-cover img': { transform: 'scale(1.02)' },
        },
      }}
    >
      {featured ? (
        <Flex direction={['column', 'column', 'row']} gap={[6, 8]} align="flex-start">
          {cover ? (
            <Box w="100%" maxW={{ md: '320px' }} flexShrink={0}>
              <Cover image={cover} slug={w.slug} first={first} sizes={FEATURED_SIZES} />
            </Box>
          ) : null}
          {body}
        </Flex>
      ) : (
        <>
          {cover ? (
            <Box mb={5}>
              <Cover image={cover} slug={w.slug} first={first} sizes={GRID_SIZES} />
            </Box>
          ) : null}
          {body}
        </>
      )}
    </Box>
  )
}

export default function WorkIndex({ items }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  useSpotlight(gridRef)

  // Featured rows render full-width; everything else stays in the 2-col
  // grid. (`items` already arrives featured-first.)
  const { featured, rest } = useMemo(() => {
    const f: WorkItem[] = []
    const r: WorkItem[] = []
    for (const w of items) {
      if (w.frontmatter.featured) f.push(w)
      else r.push(w)
    }
    return { featured: f, rest: r }
  }, [items])
  const firstSlug = items[0]?.slug

  return (
    <>
      <CustomHead
        title="Work"
        description={
          `Selected project case studies and engineering write-ups by ${PERSON_NAME}` +
          (items.length
            ? ` — including ${items
                .slice(0, 2)
                .map((w) => w.frontmatter.title)
                .join(' and ')}.`
            : '.')
        }
        url={absUrl('/work')}
        image={ogImageUrl({
          kind: 'work',
          title: 'Selected Work',
          subtitle: 'Project case studies',
        })}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Selected Work',
          itemListElement: items.map((w, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: absUrl(w.permalink),
            name: w.frontmatter.title,
          })),
        }}
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[12, 16]}>
          <PageHeader
            eyebrow="Case studies"
            title="Projects that shipped, with the story."
            lede="Each entry is a written case study: the problem, the constraints, the decisions, and the outcome. No bullet points pretending to be a CV."
          />

          {items.length === 0 ? (
            <Box
              border="1px dashed"
              borderColor="page.border"
              borderRadius="lg"
              p={[6, 10]}
              textAlign="center"
            >
              <Text fontFamily={monoFont} fontSize="12px" color="page.fg-secondary" mb={2}>
                [ no case studies yet ]
              </Text>
              <Text color="page.fg-secondary" fontSize="14px">
                Case studies will appear here as they&rsquo;re published.
              </Text>
            </Box>
          ) : (
            <Box ref={gridRef}>
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
        </Box>
      </HeaderFooter>
    </>
  )
}

/** Cover image of a case study with the srcset of its upload variants (when they exist). */
function coverImageOf(cover: unknown): CoverImage | null {
  const src = typeof cover === 'string' ? cover.trim() : ''
  if (!src) return null
  const srcSet = variantSrcSet(src)
  return srcSet ? { src, srcSet } : { src }
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  return {
    props: {
      items: listWorkInDisplayOrder().map((w) => ({
        ...w,
        coverImage: coverImageOf(w.frontmatter.cover),
      })),
    },
    revalidate: 60,
  }
}
