import React, { useMemo } from 'react'
import type { GetStaticProps } from 'next'
import {
  Box,
  Heading,
  Text,
  Flex,
  Link,
  SimpleGrid,
  useColorModeValue,
  Image as ChakraImage,
} from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import SectionLabel from '../../components/General-UI/SectionLabel'
import { listWorkInDisplayOrder, type WorkFrontmatter, type MDXIndexEntry } from '../../lib/mdx'
import { absUrl, ogImageUrl, PERSON_NAME } from '../../lib/schema'

type Props = {
  items: MDXIndexEntry<WorkFrontmatter>[]
}

const titleLang = (w: MDXIndexEntry<WorkFrontmatter>) => (w.lang === 'en' ? undefined : w.lang)

export default function WorkIndex({ items }: Props) {
  // AA contrast on both themes (#22c55e / #a855f7 at 10px failed on light).
  const liveColor = useColorModeValue('green.700', 'green.300')
  const featuredColor = useColorModeValue('purple.700', 'purple.300')
  const muted = 'page.fg-secondary'
  const border = 'page.border'
  const hover = 'page.border-strong'
  const cardBg = 'page.surface'
  const monoFont = 'var(--font-geist-mono), monospace'

  // Partition featured vs the rest so the featured row can render full-width
  // with cover art while everything else stays in the 2-col grid. (`items`
  // already arrives featured-first; the split keeps the two layouts apart.)
  const { featured, rest } = useMemo(() => {
    const f: MDXIndexEntry<WorkFrontmatter>[] = []
    const r: MDXIndexEntry<WorkFrontmatter>[] = []
    for (const w of items) {
      if (w.frontmatter.featured) f.push(w)
      else r.push(w)
    }
    return { featured: f, rest: r }
  }, [items])

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
        image={ogImageUrl({ kind: 'work', title: 'Selected Work', subtitle: 'Project case studies' })}
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
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[16, 24]}>
          <SectionLabel n={2} as="p">Selected Work</SectionLabel>

          <Heading as="h1"
            mt={6}
            mb={4}
            fontSize={['32px', '44px', '56px']}
            lineHeight="1.05"
            letterSpacing="-0.025em"
            fontWeight={500}
          >
            Projects that shipped, with the story.
          </Heading>
          <Text color={muted} maxW="640px" mb={12} fontSize="15px">
            Each entry is a written case study: the problem, the constraints, the
            decisions, and the outcome. No bullet points pretending to be a CV.
          </Text>

          {items.length === 0 ? (
            <Box
              border="1px dashed"
              borderColor={border}
              borderRadius="lg"
              p={[6, 10]}
              textAlign="center"
            >
              <Text fontFamily={monoFont} fontSize="12px" color={muted} mb={2}>
                [ no case studies yet ]
              </Text>
              <Text color={muted} fontSize="14px">
                Case studies will appear here as they&rsquo;re published.
              </Text>
            </Box>
          ) : (
            <>
              {featured.length > 0 && (
                <Box mb={[6, 10]}>
                  {featured.map((w) => {
                    const fm = w.frontmatter
                    return (
                      <Link
                        key={w.slug}
                        as={NextLink}
                        href={w.permalink}
                        _hover={{ textDecoration: 'none', borderColor: hover }}
                        bg={cardBg}
                        border="1px solid"
                        borderColor={border}
                        borderRadius="lg"
                        p={[6, 8]}
                        mb={4}
                        display="block"
                        transition="border-color 250ms var(--ease-out-quart)"
                        _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
                      >
                        <Flex direction={['column', 'column', 'row']} gap={[6, 8]} align="flex-start">
                          {fm.cover ? (
                            <ChakraImage
                              src={fm.cover}
                              alt={fm.title}
                              maxW={['100%', '100%', '320px']}
                              w="full"
                              borderRadius="md"
                              border="1px solid"
                              borderColor={border}
                              objectFit="cover"
                              flexShrink={0}
                              decoding="async"
                            />
                          ) : null}
                          <Box flex="1">
                            <Flex justify="space-between" align="flex-start" gap={3} mb={3}>
                              <Text
                                fontFamily={monoFont}
                                fontSize="10px"
                                letterSpacing="0.12em"
                                textTransform="uppercase"
                                color={featuredColor}
                              >
                                ★ Featured · {fm.period || '—'}
                              </Text>
                              {fm.status && (
                                <Text
                                  fontFamily={monoFont}
                                  fontSize="10px"
                                  letterSpacing="0.08em"
                                  textTransform="uppercase"
                                  color={fm.status === 'live' ? liveColor : muted}
                                  border="1px solid"
                                  borderColor={fm.status === 'live' ? '#22c55e44' : border}
                                  px={2}
                                  py={0.5}
                                  borderRadius="sm"
                                >
                                  {fm.status}
                                </Text>
                              )}
                            </Flex>
                            <Heading
                              as="h2"
                              size="lg"
                              mb={3}
                              fontWeight={500}
                              letterSpacing="-0.02em"
                              lang={titleLang(w)}
                              style={{ viewTransitionName: `vt-work-${w.slug}` }}
                            >
                              {fm.title}
                            </Heading>
                            {fm.description && (
                              <Text color={muted} fontSize="15px" mb={4} noOfLines={4}>
                                {fm.description}
                              </Text>
                            )}
                            {fm.tech && fm.tech.length > 0 && (
                              <Flex gap={2} wrap="wrap" fontFamily={monoFont} fontSize="11px" color={muted}>
                                {fm.tech.slice(0, 8).map((t) => (
                                  <Text as="span" key={t}>
                                    {t}
                                  </Text>
                                ))}
                              </Flex>
                            )}
                          </Box>
                        </Flex>
                      </Link>
                    )
                  })}
                </Box>
              )}

              <SimpleGrid columns={[1, 1, 2]} spacing={[4, 6]}>
                {rest.map((w) => {
                  const fm = w.frontmatter
                  return (
                    <Link
                      key={w.slug}
                      as={NextLink}
                      href={w.permalink}
                      _hover={{ textDecoration: 'none', borderColor: hover }}
                      bg={cardBg}
                      border="1px solid"
                      borderColor={border}
                      borderRadius="lg"
                      p={6}
                      display="block"
                      transition="border-color 250ms var(--ease-out-quart), transform 250ms var(--ease-out-quart)"
                      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
                    >
                      <Flex justify="space-between" align="flex-start" gap={3} mb={4}>
                        <Text fontFamily={monoFont} fontSize="11px" color={muted}>
                          {fm.period || '—'}
                        </Text>
                        {fm.status && (
                          <Text
                            fontFamily={monoFont}
                            fontSize="10px"
                            letterSpacing="0.08em"
                            textTransform="uppercase"
                            color={fm.status === 'live' ? liveColor : muted}
                            border="1px solid"
                            borderColor={fm.status === 'live' ? '#22c55e44' : border}
                            px={2}
                            py={0.5}
                            borderRadius="sm"
                          >
                            {fm.status}
                          </Text>
                        )}
                      </Flex>
                      <Heading
                        as="h2"
                        size="md"
                        mb={2}
                        fontWeight={500}
                        letterSpacing="-0.015em"
                        lang={titleLang(w)}
                        style={{ viewTransitionName: `vt-work-${w.slug}` }}
                      >
                        {fm.title}
                      </Heading>
                      {fm.description && (
                        <Text color={muted} fontSize="14px" mb={4} noOfLines={3}>
                          {fm.description}
                        </Text>
                      )}
                      {fm.tech && fm.tech.length > 0 && (
                        <Flex gap={2} wrap="wrap" fontFamily={monoFont} fontSize="10px" color={muted}>
                          {fm.tech.slice(0, 5).map((t) => (
                            <Text as="span" key={t}>
                              {t}
                            </Text>
                          ))}
                        </Flex>
                      )}
                    </Link>
                  )
                })}
              </SimpleGrid>
            </>
          )}
        </Box>
      </HeaderFooter>
    </>
  )
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  return {
    props: {
      items: listWorkInDisplayOrder(),
    },
    revalidate: 60,
  }
}
