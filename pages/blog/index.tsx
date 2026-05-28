import React from 'react'
import type { GetStaticProps } from 'next'
import {
  Box,
  Flex,
  Heading,
  Text,
  Link,
  useColorModeValue,
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
  const monoFont = 'var(--font-geist-mono), monospace'

  return (
    <>
      <CustomHead
        title="Writing"
        description="Essays, notes, and technical write-ups by Li Yanpei (Hiko)."
        url={`https://${host}/blog`}
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

          {posts.length === 0 ? (
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
              {posts.map((p) => (
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
      host: process.env.NEXT_PUBLIC_SITE_HOST || 'hiko.dev',
    },
    revalidate: 60,
  }
}
