import React, { forwardRef } from 'react'

/**
 * The ORCID iD icon — the green disc with a white "iD" that ORCID's iD
 * display guidelines put in front of a researcher's iD. It is ORCID's own
 * mark, drawn exactly as ORCID distributes it (its 256-unit SVG, in the
 * approved green colourway), never recoloured or reshaped, and used only
 * where it links to the record it identifies: public/licenses/orcid.txt
 * (linked from /colophon) carries the trademark statement and the
 * guideline references.
 *
 * The brand green (#A6CE39) reads on the site's light and dark pages alike,
 * so one colourway serves both themes (ORCID allows only its three: green,
 * black-and-white, and white reversed out). The icon is decorative
 * (aria-hidden, not focusable); the link around it carries the accessible
 * name "ORCID iD: https://orcid.org/…" (components/Common/OrcidIdLink).
 * 16 px is the smallest size the guidelines allow; 24 px is their optimum.
 */

export const ORCID_GREEN = '#A6CE39'

export type OrcidIdIconProps = Omit<React.SVGProps<SVGSVGElement>, 'ref' | 'width' | 'height'> & {
  /** Rendered size in px (default 16, the guidelines' minimum). */
  size?: number
}

export const OrcidIdIcon = forwardRef<SVGSVGElement, OrcidIdIconProps>(function OrcidIdIcon({ size = 16, className, ...rest }, ref) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className ? `orcid-id-icon ${className}` : 'orcid-id-icon'}
      {...rest}
    >
      <path fill={ORCID_GREEN} d="M256 128c0 70.7-57.3 128-128 128S0 198.7 0 128 57.3 0 128 0s128 57.3 128 128z" />
      <path fill="#fff" d="M86.3 186.2H70.9V79.1h15.4v107.1zM108.9 79.1h41.6c39.6 0 57 28.3 57 53.6 0 27.5-21.5 53.6-56.8 53.6h-41.8V79.1zm15.4 93.3h24.5c34.9 0 42.9-26.5 42.9-39.7 0-21.5-13.7-39.7-43.7-39.7h-23.7v79.4zM88.7 56.8c0 5.5-4.5 10.1-10.1 10.1s-10.1-4.6-10.1-10.1c0-5.6 4.5-10.1 10.1-10.1s10.1 4.6 10.1 10.1z" />
    </svg>
  )
})
