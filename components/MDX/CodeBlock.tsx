import React from 'react'
import { Box, Flex } from '@chakra-ui/react'
import CopyButton from '../General-UI/CopyButton'
import { codeText, splitCodeFigure } from './codeFigure'

export { codeText }

/**
 * Fenced code block (pre-highlighted by rehype-pretty-code on the server)
 * with the shared copy button (components/General-UI/CopyButton, which
 * announces the result and falls back to a hidden <textarea> where the
 * Clipboard API is unavailable — ./clipboard).
 *
 * The copied text is derived from the rendered tree (no DOM read), so it is
 * exactly the code, without the language label or line numbers. The button
 * is always visible on touch / coarse-pointer devices (there is no hover
 * there) and on hover / keyboard focus elsewhere.
 *
 *   - ```ts title="lib/a.ts" — the title is a filename tab on top of the
 *     block (with the language and the copy button), not an image caption:
 *     CodeFigure hands it to the block, which then renders the whole
 *     <figure> with the tab as its <figcaption>.
 *   - ```ts {2} / /word/ — highlighted lines and characters get a band that
 *     never lowers the tokens' contrast (--code-line-highlight, lighter than
 *     the block in light mode and darker in dark mode) and the accent rule.
 *   - ```ts showLineNumbers — line numbers in the gutter (CSS counters, so
 *     they are never selected or copied with the code).
 */

const MONO = 'var(--font-geist-mono), monospace'

type CodeFigureProps = {
  /** Attributes of the rehype-pretty-code <figure> the block replaces. */
  props: React.HTMLAttributes<HTMLElement>
  /** What follows the code inside that figure (a caption). */
  after: React.ReactNode[]
}

export type CodeBlockProps = React.HTMLAttributes<HTMLPreElement> & {
  'data-language'?: string
  /** Filename tab (```ts title="…"), set by CodeFigure. */
  codeTitle?: string
  /** Set by CodeFigure: the block renders the whole figure. */
  codeFigure?: CodeFigureProps
}

const preSx = {
  '& code': { bg: 'transparent', p: 0, fontSize: 'inherit' },
  // Lines span the block and bleed into its side padding, so a highlighted
  // line is a full-width band; the transparent rule keeps every line aligned.
  '& [data-line]': {
    display: 'block',
    mx: '-1rem',
    pl: 'calc(1rem - 3px)',
    pr: '1rem',
    borderLeft: '3px solid transparent',
  },
  '& [data-highlighted-line]': { bg: 'var(--code-line-highlight)', borderLeftColor: 'var(--accent)' },
  '& [data-highlighted-chars]': { bg: 'var(--code-line-highlight)', outline: '1px solid var(--accent)', borderRadius: '2px' },
  // Line numbers sit in a hanging gutter (--ln-w wide), so a line the theme
  // wraps (pre-wrap) continues beside its number, not under it.
  '& code[data-line-numbers]': { counterReset: 'line', '--ln-w': '1ch' },
  '& code[data-line-numbers-max-digits="2"]': { '--ln-w': '2ch' },
  '& code[data-line-numbers-max-digits="3"]': { '--ln-w': '3ch' },
  '& code[data-line-numbers-max-digits="4"]': { '--ln-w': '4ch' },
  '& code[data-line-numbers] > [data-line]': { position: 'relative', pl: 'calc(1rem - 3px + var(--ln-w) + 1.25rem)' },
  '& code[data-line-numbers] > [data-line]::before': {
    counterIncrement: 'line',
    content: 'counter(line)',
    position: 'absolute',
    left: 'calc(1rem - 3px)',
    width: 'var(--ln-w)',
    textAlign: 'right',
    color: 'page.fg-secondary',
  },
  '&:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: '2px' },
} as const

export default function CodeBlock({ codeTitle, codeFigure, ...props }: CodeBlockProps) {
  const language = props['data-language']
  const value = codeText(props.children).replace(/\n+$/, '')
  const title = (codeTitle || '').trim()
  const after = codeFigure?.after ?? []
  // A figure has one figcaption: the tab is it unless the block also has a caption.
  const tabIsCaption = !!codeFigure && after.length === 0

  return (
    <Box
      as={codeFigure ? 'figure' : 'div'}
      {...codeFigure?.props}
      position="relative"
      my={6}
      sx={{
        '& .code-copy': { opacity: 0, transition: 'opacity 150ms var(--ease-out-quart)' },
        '&:hover .code-copy, &:focus-within .code-copy': { opacity: 1 },
        '@media (hover: none), (pointer: coarse)': { '& .code-copy': { opacity: 1 } },
      }}
    >
      {title && (
        <Flex
          as={tabIsCaption ? 'figcaption' : 'div'}
          className="code-title"
          align="center"
          gap={3}
          minH={10}
          py={2}
          pl={4}
          pr={value ? 12 : 4}
          bg="page.bg-overlay"
          border="1px solid"
          borderColor="page.border"
          borderTopRadius="md"
          fontFamily={MONO}
          fontSize="12px"
          lineHeight="1.5"
          color="page.fg"
        >
          <Box as="span" minW={0} overflowWrap="anywhere">
            {title}
          </Box>
          {language && (
            <Box
              as="span"
              aria-hidden
              ml="auto"
              flexShrink={0}
              fontSize="10px"
              letterSpacing="0.12em"
              textTransform="uppercase"
              color="page.fg-secondary"
            >
              {language}
            </Box>
          )}
        </Flex>
      )}
      <Box
        as="pre"
        p={4}
        pt={!title && language ? 9 : 4}
        pr={title || language ? 4 : 14}
        bg="page.bg-elevated"
        border="1px solid"
        borderColor="page.border"
        borderRadius="md"
        {...(title ? { borderTopWidth: 0, borderTopRadius: 0 } : null)}
        overflowX="auto"
        fontSize="14px"
        lineHeight="1.6"
        fontFamily={MONO}
        sx={preSx}
        {...props}
      />
      {!title && language && (
        <Box
          as="span"
          aria-hidden
          position="absolute"
          top={2.5}
          left={4}
          fontFamily={MONO}
          fontSize="10px"
          letterSpacing="0.12em"
          textTransform="uppercase"
          color="page.fg-secondary"
          pointerEvents="none"
        >
          {language}
        </Box>
      )}
      {after}
      {value && (
        <Box className="code-copy no-print" position="absolute" top={title ? 1 : 1.5} right={1.5}>
          <CopyButton value={value} label="Copy code" srLabel="Code copied to clipboard" />
        </Box>
      )}
    </Box>
  )
}

/**
 * `<figure data-rehype-pretty-code-figure>`: a block with a title becomes
 * CodeBlock with that title as its tab (the block renders the figure);
 * anything else stays the figure it was compiled to.
 */
export function CodeFigure({ children, ...figureProps }: React.HTMLAttributes<HTMLElement>) {
  const { title, pre, rest } = splitCodeFigure(children)
  if (!title || !pre) {
    return <figure {...figureProps}>{children}</figure>
  }
  return React.cloneElement(pre as React.ReactElement<CodeBlockProps>, { codeTitle: title, codeFigure: { props: figureProps, after: rest } })
}
