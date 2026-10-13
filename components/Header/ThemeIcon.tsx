import React, { useId } from 'react'

/**
 * Sun ⇄ moon toggle glyph (20px, decorative). One SVG: a disc masked by a
 * second circle, plus eight rays. In light mode the cut-out circle sits off
 * to the right (a small full sun with rays); in dark mode the disc grows, the
 * cut slides over it (a crescent moon) and the rays scale away. The states
 * are pure CSS on :root[data-theme='dark'] (globals.css, "Sun ⇄ moon"), and
 * data-theme is set before first paint, so the first frame is right with no
 * JS and no flash; the switch animates over 300ms (instant under reduced
 * motion).
 */

const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]
const RAY_INNER = 8
const RAY_OUTER = 10.5

function ray(angle: number) {
  const rad = (angle * Math.PI) / 180
  const round = (v: number) => Math.round(v * 100) / 100
  return {
    x1: round(12 + RAY_INNER * Math.cos(rad)),
    y1: round(12 + RAY_INNER * Math.sin(rad)),
    x2: round(12 + RAY_OUTER * Math.cos(rad)),
    y2: round(12 + RAY_OUTER * Math.sin(rad)),
  }
}

const RAYS = RAY_ANGLES.map(ray)

export default function ThemeIcon({ size = 20 }: { size?: number }) {
  // useId is SSR-stable; strip the colons React puts in it so the id is a
  // plain token inside url(#…).
  const maskId = `theme-icon-cut-${useId().replace(/:/g, '')}`
  return (
    <svg
      className="theme-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <mask id={maskId}>
        <rect x="0" y="0" width="24" height="24" fill="white" />
        <circle className="theme-icon__cut" cx="30" cy="7.5" r="9" fill="black" />
      </mask>
      <g mask={`url(#${maskId})`}>
        <circle className="theme-icon__core" cx="12" cy="12" r="5" fill="currentColor" />
      </g>
      <g className="theme-icon__rays" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {RAYS.map((r, i) => (
          <line key={RAY_ANGLES[i]} {...r} />
        ))}
      </g>
    </svg>
  )
}
