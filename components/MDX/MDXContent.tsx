import { MDXRemote, type MDXRemoteSerializeResult } from 'next-mdx-remote'
import { Box, Heading, Text, Link as ChakraLink, Code, Divider, type ChakraProps } from '@chakra-ui/react'
import NextLink from 'next/link'
import React, { type ReactNode } from 'react'
import { safeHref } from '../../lib/cvFormat'
import CodeBlock from './CodeBlock'

/**
 * MDX → React renderer used by /blog/[slug], /work/[slug], /now, /uses.
 * Each HTML tag emitted from the MDX is mapped to a Chakra-styled wrapper
 * so prose inherits v6 typography tokens.
 *
 *   - Headings carry ids + a self-link (lib/rehype/headings.ts); the "#"
 *     marker appears on hover / focus and they clear the sticky header when
 *     jumped to.
 *   - Same-site links route through next/link, in-page "#…" links stay plain
 *     anchors, external links open in a new tab; script-capable URLs
 *     (javascript:, data:, …) are rendered as text.
 *   - Images are lazy, async-decoded and sized when known; an image alone in
 *     a paragraph is a <figure> with an optional caption
 *     (lib/rehype/images.ts).
 *   - Fenced code is pre-highlighted on the server (rehype-pretty-code) and
 *     gets a copy button (CodeBlock).
 */

const MONO = 'var(--font-geist-mono), monospace'

const Prose = ({ children, as = 'article', ...rest }: ChakraProps & { children: ReactNode; as?: 'article' | 'div' }) => (
  <Box
    as={as}
    className="article-prose"
    maxW="var(--container-prose)"
    mx="auto"
    fontSize={['16px', '17px']}
    lineHeight="1.7"
    overflowWrap="break-word"
    {...rest}
  >
    {children}
  </Box>
)

const headingProps = {
  fontFamily: 'var(--font-geist-sans), Inter, sans-serif',
  letterSpacing: '-0.02em',
  fontWeight: 600,
  // Clear the 56px sticky header when the heading is a jump target.
  scrollMarginTop: '88px',
  position: 'relative' as const,
  sx: {
    '& .heading-anchor': { color: 'inherit', textDecoration: 'none' },
    '& .heading-anchor:not(.heading-anchor-icon)::after': {
      content: '"#"',
      ml: '0.35em',
      color: 'accent.text',
      fontFamily: MONO,
      fontWeight: 400,
      opacity: 0,
      transition: 'opacity 150ms var(--ease-out-quart)',
    },
    '& .heading-anchor:hover::after, & .heading-anchor:focus-visible::after': { opacity: 1 },
    '& .heading-anchor-icon': {
      color: 'accent.text',
      fontFamily: MONO,
      fontWeight: 400,
      opacity: 0,
      transition: 'opacity 150ms var(--ease-out-quart)',
    },
    '&:hover .heading-anchor-icon, & .heading-anchor-icon:focus-visible': { opacity: 1 },
    '& .heading-anchor:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: '2px', borderRadius: '2px' },
    // Headings receive programmatic focus after a TOC / palette jump.
    '&:focus': { outline: 'none' },
    '&:focus-visible': { outline: '2px solid var(--accent-ring)', outlineOffset: '4px', borderRadius: '2px' },
    '@media (hover: none)': { '& .heading-anchor-icon': { opacity: 0.6 } },
  },
}

const isExternal = (href: string) => /^(https?:|mailto:|tel:)/i.test(href)

function MdxLink({ href, className, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const raw = typeof href === 'string' ? href.trim() : ''
  // Heading self-links and in-page fragments: plain anchors, styled by the heading.
  if (raw.startsWith('#')) {
    return (
      <a href={raw} className={className} {...rest}>
        {children}
      </a>
    )
  }
  const safe = safeHref(raw)
  if (!safe) return <>{children}</>
  if (isExternal(safe)) {
    return (
      <ChakraLink href={safe} isExternal color="accent.text" className="link-underline" {...rest}>
        {children}
      </ChakraLink>
    )
  }
  return (
    <ChakraLink as={NextLink} href={safe} color="accent.text" className="link-underline" {...rest}>
      {children}
    </ChakraLink>
  )
}

function MdxImage({ alt, width, height, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <Box
      as="img"
      alt={typeof alt === 'string' ? alt : ''}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      display="block"
      maxW="100%"
      h="auto"
      mx="auto"
      my={6}
      borderRadius="lg"
      border="1px solid"
      borderColor="page.border"
      bg="page.bg-elevated"
      {...rest}
    />
  )
}

function MdxFigure({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  // rehype-pretty-code also emits <figure> around code blocks: leave those alone.
  if (!String(className || '').split(/\s+/).includes('article-figure')) {
    return (
      <figure className={className} {...rest}>
        {children}
      </figure>
    )
  }
  return (
    <Box as="figure" my={8} sx={{ '& img': { my: 0 } }} {...rest}>
      {children}
    </Box>
  )
}

const mdxComponents = {
  h1: (props: any) => <Heading as="h1" mt={10} mb={4} fontSize={['28px', '32px']} {...headingProps} {...props} />,
  h2: (props: any) => <Heading as="h2" mt={12} mb={3} fontSize={['22px', '24px']} {...headingProps} {...props} />,
  h3: (props: any) => <Heading as="h3" mt={8} mb={2} fontSize="19px" {...headingProps} {...props} />,
  h4: (props: any) => <Heading as="h4" mt={6} mb={2} fontSize="17px" {...headingProps} {...props} />,
  p: (props: any) => <Text mb={4} {...props} />,
  a: MdxLink,
  ul: (props: any) => <Box as="ul" pl={5} mb={4} sx={{ '& li': { mb: 2 } }} {...props} />,
  ol: (props: any) => <Box as="ol" pl={5} mb={4} sx={{ '& li': { mb: 2 } }} {...props} />,
  li: (props: any) => <Box as="li" {...props} />,
  blockquote: (props: any) => (
    <Box
      as="blockquote"
      borderLeft="2px solid"
      borderColor="var(--accent)"
      pl={4}
      py={1}
      my={6}
      color="page.fg-secondary"
      sx={{ '& p:last-child': { mb: 0 } }}
      {...props}
    />
  ),
  hr: () => <Divider my={8} borderColor="page.border" />,
  code: (props: any) => (
    <Code
      bg="page.bg-overlay"
      color="inherit"
      px={1.5}
      py={0.5}
      fontSize="0.9em"
      borderRadius="md"
      fontFamily={MONO}
      {...props}
    />
  ),
  pre: (props: any) => <CodeBlock {...props} />,
  img: MdxImage,
  figure: MdxFigure,
  figcaption: (props: any) => (
    <Text
      as="figcaption"
      mt={3}
      textAlign="center"
      fontFamily={MONO}
      fontSize="12px"
      lineHeight="1.5"
      color="page.fg-secondary"
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
          th: { fontFamily: MONO, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' },
        }}
        {...props}
      />
    </Box>
  ),
}

export default function MDXContent({
  source,
  as = 'article',
}: {
  source: MDXRemoteSerializeResult
  /** Element for the prose wrapper; use 'div' when the page already wraps it in an <article>. */
  as?: 'article' | 'div'
}) {
  return (
    <Prose as={as}>
      <MDXRemote {...source} components={mdxComponents as any} />
    </Prose>
  )
}
