import React from 'react'
import { Box } from '@chakra-ui/react'
import CopyButton from '../General-UI/CopyButton'

/**
 * Fenced code block (pre-highlighted by rehype-pretty-code on the server)
 * with the shared copy button (components/General-UI/CopyButton, which
 * announces the result and falls back to a hidden <textarea> where the
 * Clipboard API is unavailable — ./clipboard).
 *
 * The copied text is derived from the rendered tree (no DOM read), so it is
 * exactly the code, without the language label. The button is always
 * visible on touch / coarse-pointer devices (there is no hover there) and on
 * hover / keyboard focus elsewhere.
 */

const MONO = 'var(--font-geist-mono), monospace'

/** Plain text of rendered code (the highlighted spans keep their newlines as text nodes). */
export function codeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(codeText).join('')
  if (React.isValidElement(node)) return codeText((node.props as { children?: React.ReactNode }).children)
  return ''
}

export default function CodeBlock(props: React.HTMLAttributes<HTMLPreElement> & { 'data-language'?: string }) {
  const language = props['data-language']
  const value = codeText(props.children).replace(/\n+$/, '')

  return (
    <Box
      position="relative"
      my={6}
      sx={{
        '& .code-copy': { opacity: 0, transition: 'opacity 150ms var(--ease-out-quart)' },
        '&:hover .code-copy, &:focus-within .code-copy': { opacity: 1 },
        '@media (hover: none), (pointer: coarse)': { '& .code-copy': { opacity: 1 } },
      }}
    >
      <Box
        as="pre"
        p={4}
        pt={language ? 9 : 4}
        pr={language ? 4 : 14}
        bg="page.bg-elevated"
        border="1px solid"
        borderColor="page.border"
        borderRadius="md"
        overflowX="auto"
        fontSize="14px"
        lineHeight="1.6"
        fontFamily={MONO}
        sx={{
          '& code': { bg: 'transparent', p: 0, fontSize: 'inherit' },
          '& [data-line]': { display: 'block' },
          '&:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: '2px' },
        }}
        {...props}
      />
      {language && (
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
      {value && (
        <Box className="code-copy no-print" position="absolute" top={1.5} right={1.5}>
          <CopyButton value={value} label="Copy code" srLabel="Code copied to clipboard" />
        </Box>
      )}
    </Box>
  )
}
