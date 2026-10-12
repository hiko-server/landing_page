import React from 'react'
import { Box } from '@chakra-ui/react'
import { copyText } from './clipboard'

/**
 * Fenced code block (pre-highlighted by rehype-pretty-code on the server)
 * with a copy button.
 *
 * The button is always visible on touch / coarse-pointer devices (there is
 * no hover there) and on hover / keyboard focus elsewhere. The result is
 * announced through a polite live region; copying falls back to a hidden
 * <textarea> where the async Clipboard API is unavailable (./clipboard).
 */

const MONO = 'var(--font-geist-mono), monospace'

type Status = 'idle' | 'copied' | 'failed'

export default function CodeBlock(props: React.HTMLAttributes<HTMLPreElement> & { 'data-language'?: string }) {
  const ref = React.useRef<HTMLPreElement | null>(null)
  const timer = React.useRef<number | undefined>(undefined)
  const [status, setStatus] = React.useState<Status>('idle')
  const language = props['data-language']

  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    const ok = await copyText(ref.current?.innerText.replace(/\n$/, '') || '')
    setStatus(ok ? 'copied' : 'failed')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setStatus('idle'), 2000)
  }

  const label = status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy'

  return (
    <Box
      position="relative"
      my={6}
      sx={{
        '&:hover .code-copy, &:focus-within .code-copy': { opacity: 1 },
        '@media (hover: none), (pointer: coarse)': { '.code-copy': { opacity: 1, minH: '36px', px: 3 } },
      }}
    >
      <Box
        as="pre"
        ref={ref}
        p={4}
        pt={language ? 9 : 4}
        pr={language ? 4 : 20}
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
      <Box
        as="button"
        type="button"
        className="code-copy"
        onClick={copy}
        aria-label={status === 'idle' ? 'Copy code to clipboard' : label}
        position="absolute"
        top={1.5}
        right={1.5}
        display="inline-flex"
        alignItems="center"
        minH="28px"
        px={2}
        fontSize="11px"
        fontFamily={MONO}
        borderRadius="md"
        border="1px solid"
        borderColor="page.border"
        bg="page.bg"
        color={status === 'copied' ? 'accent.text' : 'page.fg-secondary'}
        opacity={status === 'idle' ? 0 : 1}
        _hover={{ color: 'page.fg', borderColor: 'page.border-strong' }}
        _focusVisible={{ opacity: 1, outline: '2px solid var(--accent)', outlineOffset: '1px' }}
        transition="opacity 150ms var(--ease-out-quart), color 150ms var(--ease-out-quart)"
      >
        {status === 'copied' ? 'Copied ✓' : label}
      </Box>
      <Box as="span" className="sr-only" role="status" aria-live="polite">
        {status === 'copied' ? 'Code copied to clipboard' : status === 'failed' ? 'Could not copy the code' : ''}
      </Box>
    </Box>
  )
}
