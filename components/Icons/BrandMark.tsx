import { L_POINTS, MARK_GRID, MARK_TILE_RADIUS, Y_POINTS } from '../../lib/brandMark'

/**
 * The "LY" monogram inline (lib/brandMark.ts — the same geometry as the
 * favicon and the app icons). The tile takes the page's foreground colour
 * and the L the page background, so it is the ink tile on the light theme
 * and the paper tile on the dark one, like the SVG favicon on light / dark
 * browser chrome; the Y is the brand accent, which holds on both tiles.
 * Plain colour variables, no stylesheet. Decorative: the caller labels the
 * link around it.
 */

const points = (list: readonly (readonly [number, number])[]) => list.map(([x, y]) => `${x},${y}`).join(' ')
const L = points(L_POINTS)
const Y = points(Y_POINTS)

export default function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox={`0 0 ${MARK_GRID} ${MARK_GRID}`} width={size} height={size} aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <rect width={MARK_GRID} height={MARK_GRID} rx={MARK_TILE_RADIUS} style={{ fill: 'var(--chakra-colors-page-fg)' }} />
      <polygon points={L} style={{ fill: 'var(--chakra-colors-page-bg)' }} />
      <polygon points={Y} style={{ fill: 'var(--accent)' }} />
    </svg>
  )
}
