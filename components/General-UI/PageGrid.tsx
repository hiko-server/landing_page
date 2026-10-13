import { Box, type BoxProps } from '@chakra-ui/react'

/**
 * The page layout grid: one column with named breakout lines (the CSS lives
 * in styles/globals.css `.page-grid`, the line math in theme/tokens.ts
 * pageGridColumns()).
 *
 *   full-start | gutter | wide-start | breakout | content | breakout | wide-end | gutter | full-end
 *
 *   <PageGrid as="main" py={[12, 16]}>
 *     <PageHeader … />                       ← `content`: lines up with the header
 *     <Breakout span="wide"><Figure … /></Breakout>   ← up to --container-wide
 *     <Breakout span="full"><Strip … /></Breakout>    ← edge to edge
 *   </PageGrid>
 *
 * It replaces the hand-rolled `maxW="var(--container-content)" mx="auto"
 * px={[4, 6, 8]}` wrapper: same column, same gutters (16 / 24 / 32 px), plus
 * the breakout lines. Pure CSS, so the server HTML is final (no layout
 * shift, no script).
 */
export default function PageGrid({ className, ...rest }: BoxProps) {
  return <Box className={className ? `page-grid ${className}` : 'page-grid'} {...rest} />
}

export type BreakoutSpan = 'content' | 'wide' | 'full'

/** A PageGrid child that spans the `wide` or `full` lines (`content` is the default for every child). */
export function Breakout({ span = 'wide', ...rest }: BoxProps & { span?: BreakoutSpan }) {
  return <Box data-span={span === 'content' ? undefined : span} {...rest} />
}
