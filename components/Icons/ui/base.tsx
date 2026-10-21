import { createElement, forwardRef, type SVGProps } from 'react'

/**
 * The public site's one icon set: Lucide outline icons, inlined as SVG.
 *
 * Lucide — ISC License, Copyright (c) Lucide Icons and Contributors; the
 * icons derived from Feather (check, chevrons, arrows, monitor, moon, plus,
 * search, …) — MIT License, Copyright (c) 2013-present Cole Bemis. Full
 * texts: public/licenses/lucide.txt (linked from /colophon). The path data
 * is Lucide's as distributed in react-icons 5 (`react-icons/lu`), copied
 * here so every bundle carries only the icons it uses (no icon package, no
 * runtime lookup). The icons are grouped by where they render: ./chrome
 * (shared bundle), ./theme (on-demand menu and palette), ./content (page
 * chunks), ./ask ("Ask Lucian": the palette's Ask view and its entry on
 * /about and /contact), ./account (the signed-in owner's header menu). Import from the group file, never through a barrel, so the
 * shared bundle never pulls a page's icons.
 *
 * Sized on the 4 px grid — `size="xs" | "sm" | "md" | "lg"` = 12 / 16 / 20 /
 * 24 px — with the stroke tuned per size so lines stay about 1.1–1.5 px on
 * screen, close to Geist's stem weight (Lucide's default 2-unit stroke
 * would be 1 px at 12 px and 2 px at 24 px). Every icon is decorative
 * (aria-hidden, not focusable) and inherits the text colour; the control
 * around it carries the accessible name. Brand marks (GitHub, LinkedIn …)
 * are not part of Lucide: they stay in ./brand.tsx.
 */

export const ICON_SIZES = { xs: 12, sm: 16, md: 20, lg: 24 } as const
export type IconSize = keyof typeof ICON_SIZES

/** Stroke width in viewBox units (24) per size: ≈ 1.13 / 1.33 / 1.46 / 1.5 px on screen. */
export const ICON_STROKES: Record<IconSize, number> = { xs: 2.25, sm: 2, md: 1.75, lg: 1.5 }

export type UiIconProps = Omit<SVGProps<SVGSVGElement>, 'ref' | 'width' | 'height'> & {
  /** Grid size (default `sm`, 16 px). */
  size?: IconSize
}

type IconNode = readonly [
  tag: 'path' | 'circle' | 'line' | 'polyline' | 'polygon' | 'rect',
  attrs: Record<string, string>,
]

export function makeUiIcon(displayName: string, nodes: readonly IconNode[]) {
  const Icon = forwardRef<SVGSVGElement, UiIconProps>(function Icon(
    { size = 'sm', className, ...rest },
    ref
  ) {
    const px = ICON_SIZES[size] ?? ICON_SIZES.sm
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={px}
        height={px}
        fill="none"
        stroke="currentColor"
        strokeWidth={ICON_STROKES[size] ?? ICON_STROKES.sm}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={className ? `ui-icon ${className}` : 'ui-icon'}
        {...rest}
      >
        {nodes.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
      </svg>
    )
  })
  Icon.displayName = displayName
  return Icon
}
