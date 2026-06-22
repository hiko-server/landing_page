import React, { useMemo, useState } from 'react'
import type { GetStaticProps } from 'next'
import {
  Box,
  Flex,
  Heading,
  Text,
  Link,
  useColorModeValue,
  HStack,
  Button,
} from '@chakra-ui/react'
import NextLink from 'next/link'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import SectionLabel from '../../components/General-UI/SectionLabel'
import { listPosts, type PostFrontmatter, type MDXIndexEntry } from '../../lib/mdx'

type Props = {
  posts: MDXIndexEntry<PostFrontmatter>[]
  host: string
}

export default function BlogIndex({ posts, host }: Props) {
  const muted = useColorModeValue('gray.600', 'gray.500')
  const border = useColorModeValue('rgba(0,0,0,0.08)', 'rgba(255,255,255,0.10)')
  const fg = useColorModeValue('gray.800', 'gray.100')
  const hover = useColorModeValue('black', 'white')
  const activeBg = useColorModeValue('black', 'white')
  const activeFg = useColorModeValue('white', 'black')
  const monoFont = 'var(--font-geist-mono), monospace'

  const [activeTag, setActiveTag] = useState<string | null>(null)

  // Collect tags with counts; keep deterministic order (alphabetical) so the
  // chip row doesn't reshuffle between renders.
  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of posts) {
      for (const t of p.frontmatter.tags || []) {
        counts.set(t, (counts.get(t) || 0) + 1)
      }
    }
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [posts])

  const visible = useMemo(
    () => (activeTag ? posts.filter((p) => (p.frontmatter.tags || []).includes(activeTag)) : posts),
    [posts, activeTag],
  )

  return (
    <>
      <CustomHead
        title="Writing"
        description="Essays, notes, and technical write-ups by Li Yanpei (Hiko)."
        url={`https://${host}/blog`}
        image={`https://${host}/api/og?title=Writing&kind=blog&subtitle=Essays%2C%20notes%2C%20and%20write-ups`}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: 'LUCIAN-DEV.COM — Writing',
          url: `https://${host}/blog`,
          blogPost: posts.slice(0, 10).map((p) => ({
            '@type': 'BlogPosting',
            headline: p.frontmatter.title,
            url: `https://${host}${p.permalink}`,
            datePublished: p.frontmatter.date,
          })),
        }}
      />
      <HeaderFooter isMobile={false}>
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[16, 24]}>
          <SectionLabel n={1}>Writing</SectionLabel>

          <Heading
            mt={6}
            mb={4}
            fontSize={['32px', '44px', '56px']}
            lineHeight="1.05"
            letterSpacing="-0.025em"
            fontWeight={500}
          >
            Notes, essays, and write-ups.
          </Heading>
          <Text color={muted} maxW="640px" mb={12} fontSize="15px">
            Long-form pieces on engineering, ML, and the craft of shipping software.
            New posts land here when they&rsquo;re ready — no drafts, no fluff.
          </Text>

          {tags.length > 0 && (
            <HStack mb={8} spacing={2} flexWrap="wrap" rowGap={2}>
              <Button
                size="xs"
                variant={activeTag === null ? 'solid' : 'outline'}
                bg={activeTag === null ? activeBg : 'transparent'}
                color={activeTag === null ? activeFg : muted}
                borderColor={border}
                fontFamily={monoFont}
                fontWeight={500}
                onClick={() => setActiveTag(null)}
                _hover={{ borderColor: hover }}
              >
                all ({posts.length})
              </Button>
              {tags.map(([t, n]) => (
                <Button
                  key={t}
                  size="xs"
                  variant={activeTag === t ? 'solid' : 'outline'}
                  bg={activeTag === t ? activeBg : 'transparent'}
                  color={activeTag === t ? activeFg : muted}
                  borderColor={border}
                  fontFamily={monoFont}
                  fontWeight={500}
                  onClick={() => setActiveTag(t)}
                  _hover={{ borderColor: hover }}
                >
                  #{t} ({n})
                </Button>
              ))}
            </HStack>
          )}

          {visible.length === 0 ? (
            <Box
              border="1px dashed"
              borderColor={border}
              borderRadius="lg"
              p={[6, 10]}
              textAlign="center"
            >
              <Text fontFamily={monoFont} fontSize="12px" color={muted} mb={2}>
                [ no posts yet ]
              </Text>
              <Text color={muted} fontSize="14px">
                Posts will appear here as they&rsquo;re published. Drop an{' '}
                <Text as="code" bg={border} px={1.5} py={0.5} borderRadius="sm">
                  .mdx
                </Text>{' '}
                into <Text as="code">content/blog/</Text> or use the admin editor.
              </Text>
            </Box>
          ) : (
            <Box borderTop="1px solid" borderColor={border}>
              {visible.map((p) => (
                <Link
                  key={p.slug}
                  as={NextLink}
                  href={p.permalink}
                  _hover={{ textDecoration: 'none' }}
                  display="block"
                  borderBottom="1px solid"
                  borderColor={border}
                  py={5}
                >
                  <Flex
                    direction={['column', 'row']}
                    align={['flex-start', 'baseline']}
                    gap={[1, 6]}
                  >
                    <Text
                      flexShrink={0}
                      fontFamily={monoFont}
                      fontSize="12px"
                      color={muted}
                      w={['auto', '110px']}
                    >
                      {p.frontmatter.date}
                    </Text>
                    <Box flex={1}>
                      <Text
                        color={fg}
                        fontWeight={500}
                        fontSize="17px"
                        _groupHover={{ color: hover }}
                      >
                        {p.frontmatter.title}
                      </Text>
                      {p.frontmatter.description && (
                        <Text color={muted} fontSize="14px" mt={1} noOfLines={2}>
                          {p.frontmatter.description}
                        </Text>
                      )}
                    </Box>
                    <Text
                      flexShrink={0}
                      fontFamily={monoFont}
                      fontSize="11px"
                      color={muted}
                    >
                      {p.readingMinutes} min
                    </Text>
                  </Flex>
                </Link>
              ))}
            </Box>
          )}
        </Box>
      </HeaderFooter>
    </>
  )
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  return {
    props: {
      posts: listPosts(),
      host: process.env.NEXT_PUBLIC_SITE_HOST || 'lucian-dev.com',
    },
    revalidate: 60,
  }
}
