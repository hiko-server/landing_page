import type React from 'react'
import { Box, Flex } from '@chakra-ui/react'

/**
 * Callout (`> [!NOTE]` … in an article, compiled to `div.callout` by
 * lib/rehype/alerts.ts): a tinted panel with a coloured rule, an icon and
 * the label in the article's language, then the quote's content.
 *
 * role="note" (complementary content, not a landmark); the visible label is
 * read first. Colour is never the only cue: each type has its own icon and
 * word. Every label colour meets 4.5:1 on its tint in both themes (INK_LIGHT
 * on the light tint); prints use the light values.
 */

type CalloutType = 'note' | 'tip' | 'important' | 'warning' | 'caution'

/** CSS colour of each type: semantic tokens (theme/color.ts), violet for "important". */
const COLOR: Record<CalloutType, string> = {
  note: 'var(--chakra-colors-accent-text)',
  tip: 'var(--chakra-colors-status-open)',
  important: 'var(--callout-violet)',
  warning: 'var(--chakra-colors-status-limited)',
  caution: 'var(--chakra-colors-status-error)',
}

/**
 * Label colour on the light tint: the status tokens are tuned for text on the
 * page background, and the tint takes a little contrast away — green and
 * amber get their -800 shade there (≥ 6:1). Dark mode uses COLOR as is.
 */
const INK_LIGHT: Record<CalloutType, string> = {
  note: COLOR.note,
  tip: '#166534',
  important: COLOR.important,
  warning: '#92400e',
  caution: COLOR.caution,
}

const ICON: Record<CalloutType, React.ReactNode> = {
  // info
  note: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-5M12 8h.01" />
    </>
  ),
  // lightbulb
  tip: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" />
    </>
  ),
  // speech bubble with "!"
  important: (
    <>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
      <path d="M12 8v4M12 15.5h.01" />
    </>
  ),
  // triangle
  warning: (
    <>
      <path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 16.5h.01" />
    </>
  ),
  // octagon
  caution: (
    <>
      <path d="M8.1 2.5h7.8l5.6 5.6v7.8l-5.6 5.6H8.1l-5.6-5.6V8.1z" />
      <path d="M12 8v4.5M12 16h.01" />
    </>
  ),
}

const isType = (v: unknown): v is CalloutType => typeof v === 'string' && v in COLOR

export default function Callout({
  className,
  children,
  role,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { 'data-callout'?: string; 'data-callout-label'?: string }) {
  const type: CalloutType = isType(rest['data-callout']) ? rest['data-callout'] : 'note'
  const label = (rest['data-callout-label'] || '').trim() || type
  return (
    <Box
      className={className}
      role={role || 'note'}
      data-callout={type}
      my={7}
      pl={{ base: 4, sm: 5 }}
      pr={{ base: 4, sm: 5 }}
      py={4}
      borderLeft="3px solid"
      borderRadius="0 var(--chakra-radii-lg) var(--chakra-radii-lg) 0"
      sx={{
        '--callout-violet': '#6d28d9',
        '--callout-color': COLOR[type],
        '--callout-ink': INK_LIGHT[type],
        '.chakra-ui-dark &, [data-theme="dark"] &': { '--callout-violet': '#c4b5fd', '--callout-ink': COLOR[type] },
        '@media print': { '--callout-violet': '#6d28d9', '--callout-ink': INK_LIGHT[type] },
        borderLeftColor: 'var(--callout-color)',
        // Opaque: the page's dot grid stays outside the panel.
        background: 'color-mix(in srgb, var(--callout-color) 7%, var(--chakra-colors-page-bg))',
        '& > p:last-child, & > ul:last-child, & > ol:last-child': { mb: 0 },
        '& p, & li': { color: 'page.fg-prose' },
        '@media (forced-colors: active)': { border: '1px solid CanvasText', borderLeftWidth: '3px' },
      }}
    >
      <Flex className="callout-title" align="center" gap={2} m={0} mb={2} fontWeight={600} fontSize="0.875em" letterSpacing="0.01em" color="var(--callout-ink)">
        <Box
          as="svg"
          viewBox="0 0 24 24"
          w="1.15em"
          h="1.15em"
          flexShrink={0}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          focusable="false"
        >
          {ICON[type]}
        </Box>
        <span>{label}</span>
      </Flex>
      {children}
    </Box>
  )
}
