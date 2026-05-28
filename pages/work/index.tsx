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
import { listWork, type WorkFrontmatter, type MDXIndexEntry } from '../../lib/mdx'

type Props = {
  items: MDXIndexEntry<WorkFrontmatter>[]
  host: string
}

export default function WorkIndex({ items, host }: Props) {
  const muted = useColorModeValue('gray.600', 'gray.500')
  const border = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')
  const hover = useColorModeValue('rgba(0,0,0,0.20)', 'rgba(255,255,255,0.20)')
  const cardBg = useColorModeValue('rgba(255,255,255,0.6)', 'rgba(20,20,20,0.4)')
  const monoFont = 'var(--font-geist-mono), monospace'

  // Partition featured vs the rest so the featured row can render full-width
  // with cover art while everything else stays in the 2-col grid.
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
        description="Selected project case studies and engineering write-ups by Li Yanpei (Hiko)."
        url={`https://${host}/work`}
        image={`https://${host}/api/og?title=Selected%20Work&kind=work&subtitle=Project%20case%20studies`}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Selected Work',
          itemListElement: items.map((w, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `https://${host}${w.permalink}`,
            name: w.frontmatter.title,
          })),
        }}
      />
      <HeaderFooter isMobile={false}>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[16, 24]}>
          <SectionLabel n={2}>Selected Work</SectionLabel>

          <Heading
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
                Drop an{' '}
                <Text as="code" bg={border} px={1.5} py={0.5} borderRadius="sm">
                  .mdx
                </Text>{' '}
                into <Text as="code">content/work/</Text> or use the admin editor.
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
                            />
                          ) : null}
                          <Box flex="1">
                            <Flex justify="space-between" align="flex-start" gap={3} mb={3}>
                              <Text
                                fontFamily={monoFont}
                                fontSize="10px"
                                letterSpacing="0.12em"
                                textTransform="uppercase"
                                color="#a855f7"
                              >
                                ★ Featured · {fm.period || '—'}
                              </Text>
                              {fm.status && (
                                <Text
                                  fontFamily={monoFont}
                                  fontSize="10px"
                                  letterSpacing="0.08em"
                                  textTransform="uppercase"
                                  color={fm.status === 'live' ? '#22c55e' : muted}
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
                              size="lg"
                              mb={3}
                              fontWeight={500}
                              letterSpacing="-0.02em"
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
                      _focus={{ outline: 'none', boxShadow: '0 0 0 2px var(--accent-ring)' }}
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
                            color={fm.status === 'live' ? '#22c55e' : muted}
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
                      <Heading size="md" mb={2} fontWeight={500} letterSpacing="-0.015em">
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
      items: listWork(),
      host: process.env.NEXT_PUBLIC_SITE_HOST || 'hiko.dev',
    },
    revalidate: 60,
  }
}
