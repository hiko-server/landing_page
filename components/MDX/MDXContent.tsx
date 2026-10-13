import { Box, Heading, Text, Link as ChakraLink, Code, Divider, type ChakraProps } from '@chakra-ui/react'
import NextLink from 'next/link'
import React, { createContext, useContext, useMemo, type ReactNode } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { toJsxRuntime, type Components, type Jsx } from 'hast-util-to-jsx-runtime'
import type { Root as HastRoot } from 'hast'
import { safeHref } from '../../lib/cvFormat'
import CodeBlock, { CodeFigure } from './CodeBlock'
import ArticleFigure, { FigCaption, InsideLinkContext, MdxImage } from './Figure'
import YouTube from './YouTube'

/**
 * Article renderer used by /blog/[slug], /work/[slug], /now, /uses and the
 * admin live preview. The body arrives as a plain hast tree compiled on the
 * server (lib/mdx.ts compileMdx) and becomes React elements through
 * hast-util-to-jsx-runtime — nothing is evaluated, so the page works under a
 * CSP without 'unsafe-eval'. Each HTML tag is mapped to a Chakra-styled
 * wrapper so prose inherits the typography tokens.
 *
 *   - Headings carry ids + a self-link (lib/rehype/headings.ts); the "#"
 *     marker appears on hover / focus and they clear the sticky header when
 *     jumped to.
 *   - Same-site links route through next/link, in-page "#…" links stay plain
 *     anchors, external links open in a new tab; script-capable URLs
 *     (javascript:, data:, …) are rendered as text.
 *   - Images are lazy, async-decoded, sized and responsive; an image alone
 *     in a paragraph (or `<Figure>`) is a <figure> with an optional caption,
 *     and inside an article each image opens the lightbox (./Figure).
 *   - `<YouTube>` is a click-to-load facade (./YouTube); allowed iframes
 *     (YouTube / Vimeo players) sit in a 16:9 frame.
 *   - Fenced code is pre-highlighted on the server (rehype-pretty-code) and
 *     gets a copy button, a filename tab for `title="…"`, highlighted lines
 *     and line numbers (CodeBlock).
 *   - GFM footnotes: the endnotes are set apart from the body, references and
 *     back links read as links, and both jump targets clear the sticky
 *     header (labels in the article's language: lib/rehype/footnotes.ts).
 *   - Paragraphs and lists use the prose colour token; the column is 68ch
 *     and shares the page's left edge with the title.
 */

const MONO = 'var(--font-geist-mono), monospace'

const Prose = ({ children, as = 'article', ...rest }: ChakraProps & { children: ReactNode; as?: 'article' | 'div' }) => (
  <Box
    as={as}
    className="article-prose"
    maxW="68ch"
    fontSize={['16px', '17px']}
    lineHeight="1.7"
    overflowWrap="break-word"
    sx={{
      '& p, & li': { color: 'page.fg-prose' },
      '& blockquote p, & blockquote li': { color: 'page.fg-secondary' },
      '& h1, & h2, & h3, & h4, & h5, & h6': { color: 'page.fg' },
      '& section[data-footnotes]': { mt: 12, pt: 6, borderTop: '1px solid', borderColor: 'page.border', fontSize: '0.875em' },
      '& section[data-footnotes] p': { mb: 2 },
      // Footnotes (user-content-fn-*) and references (user-content-fnref-*): clear the 56px sticky header.
      '& [id^="user-content-fn"]': { scrollMarginTop: '88px' },
      // Underlined, not colour alone: they sit inside running text (WCAG 1.4.1).
      '& a[data-footnote-ref], & a[data-footnote-backref]': {
        color: 'accent.text',
        textDecoration: 'underline',
        textUnderlineOffset: '0.15em',
        px: '0.15em',
      },
      '& a[data-footnote-ref]:hover, & a[data-footnote-backref]:hover': { textDecorationThickness: '2px' },
      '& a[data-footnote-ref]:focus-visible, & a[data-footnote-backref]:focus-visible': {
        outline: '2px solid var(--accent)',
        outlineOffset: '2px',
        borderRadius: '2px',
      },
    }}
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
  const inner = <InsideLinkContext.Provider value>{children}</InsideLinkContext.Provider>
  if (isExternal(safe)) {
    return (
      <ChakraLink href={safe} isExternal color="accent.text" className="link-underline" {...rest}>
        {inner}
      </ChakraLink>
    )
  }
  return (
    <ChakraLink as={NextLink} href={safe} color="accent.text" className="link-underline" {...rest}>
      {inner}
    </ChakraLink>
  )
}

/** True inside a fenced code block (<pre>): its <code> keeps the block layout. */
const InsidePreContext = createContext(false)

/**
 * Inline code wraps like text: Chakra's <Code> is inline-block, so a long
 * unbroken token (a file path) could not shrink below its own width and
 * overflowed narrow screens. Inline with `overflow-wrap: anywhere` it breaks
 * where needed, and `box-decoration-break: clone` gives every line fragment
 * its own padding and rounded background. Code inside <pre> is unchanged.
 */
const inlineCodeSx = {
  display: 'inline',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  boxDecorationBreak: 'clone',
  WebkitBoxDecorationBreak: 'clone',
} as const

function MdxCode(props: React.HTMLAttributes<HTMLElement>) {
  const inPre = useContext(InsidePreContext)
  return (
    <Code
      bg="page.bg-overlay"
      color="inherit"
      px={1.5}
      py={0.5}
      fontSize="0.9em"
      borderRadius="md"
      fontFamily={MONO}
      {...(inPre ? null : { sx: inlineCodeSx })}
      {...props}
    />
  )
}

/** Allowed player iframes (validated at compile time) in a responsive 16:9 frame. */
function MdxIframe({ width, height, ...rest }: React.IframeHTMLAttributes<HTMLIFrameElement>) {
  const w = Number(width)
  const h = Number(height)
  const ratio = w > 0 && h > 0 ? `${w} / ${h}` : '16 / 9'
  return (
    <Box my={8} w="100%" sx={{ aspectRatio: ratio }} borderRadius="lg" overflow="hidden" border="1px solid" borderColor="page.border">
      <Box as="iframe" w="100%" h="100%" border={0} display="block" {...rest} />
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
  code: MdxCode,
  pre: (props: any) => (
    <InsidePreContext.Provider value>
      <CodeBlock {...props} />
    </InsidePreContext.Provider>
  ),
  img: MdxImage,
  figure: (props: any) => (props['data-rehype-pretty-code-figure'] !== undefined ? <CodeFigure {...props} /> : <ArticleFigure {...props} />),
  figcaption: FigCaption,
  iframe: MdxIframe,
  'youtube-embed': YouTube,
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

/** hast → React elements with the components above (pure: same output on server and client). */
export function renderTree(tree: HastRoot): React.ReactNode {
  return toJsxRuntime(tree, {
    Fragment,
    jsx: jsx as Jsx,
    jsxs: jsxs as Jsx,
    components: mdxComponents as unknown as Partial<Components>,
    passKeys: true,
    stylePropertyNameCase: 'dom',
    elementAttributeNameCase: 'react',
  })
}

export default function MDXContent({
  tree,
  as = 'article',
}: {
  tree: HastRoot
  /** Element for the prose wrapper; use 'div' when the page already wraps it in an <article>. */
  as?: 'article' | 'div'
}) {
  const content = useMemo(() => renderTree(tree), [tree])
  return <Prose as={as}>{content}</Prose>
}
