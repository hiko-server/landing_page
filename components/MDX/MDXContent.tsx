'use client'
import { MDXRemote, type MDXRemoteSerializeResult } from 'next-mdx-remote'
import {
  Box,
  Heading,
  Text,
  Link as ChakraLink,
  Code,
  Divider,
  useColorModeValue,
  type ChakraProps,
} from '@chakra-ui/react'
import NextLink from 'next/link'
import type { ReactNode } from 'react'

/**
 * MDX → React renderer used by /blog/[slug], /work/[slug], /now, /uses.
 * Each HTML tag emitted from the MDX is mapped to a Chakra-styled wrapper
 * so prose inherits v6 typography tokens.
 *
 * Links beginning with `/` route through next/link for client transitions;
 * external links open in a new tab.
 *
 * Inline code uses Chakra Code; fenced blocks come pre-highlighted by
 * rehype-pretty-code on the server (see lib/mdx.ts).
 */

const Prose = ({ children, ...rest }: ChakraProps & { children: ReactNode }) => (
  <Box
    as="article"
    maxW="var(--container-prose)"
    mx="auto"
    fontSize={['16px', '17px']}
    lineHeight="1.7"
    {...rest}
  >
    {children}
  </Box>
)

const headingProps = {
  fontFamily: 'var(--font-geist-sans), Inter, sans-serif',
  letterSpacing: '-0.02em',
  fontWeight: 600,
}

const mdxComponents = {
  h1: (props: any) => (
    <Heading as="h1" mt={10} mb={4} fontSize={['28px', '32px']} {...headingProps} {...props} />
  ),
  h2: (props: any) => (
    <Heading as="h2" mt={12} mb={3} fontSize={['22px', '24px']} {...headingProps} {...props} />
  ),
  h3: (props: any) => (
    <Heading as="h3" mt={8} mb={2} fontSize="19px" {...headingProps} {...props} />
  ),
  h4: (props: any) => (
    <Heading as="h4" mt={6} mb={2} fontSize="17px" {...headingProps} {...props} />
  ),
  p: (props: any) => <Text mb={4} {...props} />,
  a: (props: any) => {
    const href = props.href as string
    const external = !href || /^(https?:|mailto:|tel:)/.test(href)
    if (external) {
      return (
        <ChakraLink href={href} isExternal color="var(--accent)" className="link-underline" {...props} />
      )
    }
    return (
      <ChakraLink as={NextLink} href={href} color="var(--accent)" className="link-underline" {...props} />
    )
  },
  ul: (props: any) => <Box as="ul" pl={5} mb={4} sx={{ '& li': { mb: 2 } }} {...props} />,
  ol: (props: any) => <Box as="ol" pl={5} mb={4} sx={{ '& li': { mb: 2 } }} {...props} />,
  li: (props: any) => <Box as="li" {...props} />,
  blockquote: (props: any) => (
    <Box
      as="blockquote"
      borderLeft="3px solid"
      borderColor="var(--accent)"
      pl={4}
      py={1}
      my={6}
      fontStyle="italic"
      color="page.fg-secondary"
      {...props}
    />
  ),
  hr: () => <Divider my={8} borderColor="page.border" />,
  code: (props: any) => (
    <Code
      bg={useColorModeValue('gray.100', 'gray.800')}
      px={1.5}
      py={0.5}
      fontSize="0.92em"
      borderRadius="md"
      fontFamily="var(--font-geist-mono), monospace"
      {...props}
    />
  ),
  pre: (props: any) => (
    <Box
      as="pre"
      my={6}
      p={4}
      bg={useColorModeValue('gray.50', 'gray.900')}
      border="1px solid"
      borderColor="page.border"
      borderRadius="md"
      overflowX="auto"
      fontSize="14px"
      fontFamily="var(--font-geist-mono), monospace"
      sx={{
        '& code': { bg: 'transparent', p: 0, fontSize: 'inherit' },
        '& [data-line]': { display: 'block' },
      }}
      {...props}
    />
  ),
  img: (props: any) => (
    <Box
      as="img"
      my={6}
      maxW="100%"
      borderRadius="md"
      border="1px solid"
      borderColor="page.border"
      {...props}
    />
  ),
  table: (props: any) => (
    <Box my={6} overflowX="auto">
      <Box
        as="table"
        w="100%"
        sx={{
          'th, td': {
            borderBottom: '1px solid',
            borderColor: 'page.border',
            px: 3,
            py: 2,
            textAlign: 'left',
          },
          th: { fontFamily: 'var(--font-geist-mono), monospace', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' },
        }}
        {...props}
      />
    </Box>
  ),
}

export default function MDXContent({ source }: { source: MDXRemoteSerializeResult }) {
  return (
    <Prose>
      <MDXRemote {...source} components={mdxComponents as any} />
    </Prose>
  )
}
