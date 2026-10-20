import type React from 'react'
import { Box, Flex } from '@chakra-ui/react'
import { InfoIcon, LightbulbIcon, MessageSquareWarningIcon, OctagonAlertIcon, TriangleAlertIcon } from '../Icons/ui/content'

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

/** CSS colour of each type: semantic tokens (theme/color.ts), violet for "important" (the admin editor's callouts use the same). */
export const COLOR: Record<CalloutType, string> = {
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
export const INK_LIGHT: Record<CalloutType, string> = {
  note: COLOR.note,
  tip: '#166534',
  important: COLOR.important,
  warning: '#92400e',
  caution: COLOR.caution,
}

// One Lucide icon per type (components/Icons/ui/content): info, lightbulb,
// speech bubble with "!", triangle, octagon.
export const ICON: Record<CalloutType, typeof InfoIcon> = {
  note: InfoIcon,
  tip: LightbulbIcon,
  important: MessageSquareWarningIcon,
  warning: TriangleAlertIcon,
  caution: OctagonAlertIcon,
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
  const Icon = ICON[type]
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
        <Icon size="sm" style={{ flexShrink: 0 }} />
        <span>{label}</span>
      </Flex>
      {children}
    </Box>
  )
}
