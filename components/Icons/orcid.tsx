import React, { forwardRef } from 'react'

/**
 * The ORCID iD icons that ORCID's iD display guidelines put in front of a
 * researcher's iD — ORCID's own marks, drawn as ORCID distributes them
 * (256-unit SVG, the colourways ORCID shows), never recoloured or reshaped,
 * and used only where they link to the record they identify:
 *
 *   authenticated     the green disc with a white "iD" — an iD the owner
 *                     proved by signing in to ORCID ("Connect your ORCID
 *                     iD", lib/orcid/oauth);
 *   unauthenticated   the outlined ring with a green "iD" (ORCID's own
 *                     green for it, #7FAA26) — an iD that was typed in; the
 *                     link is followed by "(unauthenticated)" (lib/orcid/
 *                     display), as the guidelines ask.
 *
 * public/licenses/orcid.txt (linked from /colophon) carries the trademark
 * statement and the guideline references. One colourway serves both site
 * themes (ORCID allows green, black-and-white and white reversed out; the
 * green reads on the light and the dark page alike). The icon is decorative
 * (aria-hidden, not focusable); the link around it carries the accessible
 * name "ORCID iD: https://orcid.org/…" (components/Common/OrcidIdLink).
 * 16 px is the smallest size the guidelines allow; 24 px is their optimum.
 */

export const ORCID_GREEN = '#A6CE39'
/** The green of ORCID's unauthenticated iD icon. */
export const ORCID_UNAUTH_GREEN = '#7FAA26'

export type OrcidIdIconProps = Omit<React.SVGProps<SVGSVGElement>, 'ref' | 'width' | 'height'> & {
  /** Rendered size in px (default 16, the guidelines' minimum). */
  size?: number
  /** false: ORCID's unauthenticated iD icon (default true: the authenticated one). */
  authenticated?: boolean
}

export const OrcidIdIcon = forwardRef<SVGSVGElement, OrcidIdIconProps>(function OrcidIdIcon({ size = 16, authenticated = true, className, ...rest }, ref) {
  const base = authenticated ? 'orcid-id-icon' : 'orcid-id-icon orcid-id-icon-unauth'
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className ? `${base} ${className}` : base}
      data-orcid-icon={authenticated ? 'authenticated' : 'unauthenticated'}
      {...rest}
    >
      {authenticated ? (
        <>
          <path fill={ORCID_GREEN} d="M256 128c0 70.7-57.3 128-128 128S0 198.7 0 128 57.3 0 128 0s128 57.3 128 128z" />
          <path fill="#fff" d="M86.3 186.2H70.9V79.1h15.4v107.1zM108.9 79.1h41.6c39.6 0 57 28.3 57 53.6 0 27.5-21.5 53.6-56.8 53.6h-41.8V79.1zm15.4 93.3h24.5c34.9 0 42.9-26.5 42.9-39.7 0-21.5-13.7-39.7-43.7-39.7h-23.7v79.4zM88.7 56.8c0 5.5-4.5 10.1-10.1 10.1s-10.1-4.6-10.1-10.1c0-5.6 4.5-10.1 10.1-10.1s10.1 4.6 10.1 10.1z" />
        </>
      ) : (
        <>
          <path fill={ORCID_UNAUTH_GREEN} fillRule="evenodd" d="M128 0a128 128 0 1 1 0 256a128 128 0 1 1 0-256zm0 19.7a108.3 108.3 0 1 0 0 216.6a108.3 108.3 0 1 0 0-216.6z" />
          <path fill={ORCID_UNAUTH_GREEN} d="M75.7 88.3h15.2v92.1H75.7zM93.1 71a9.8 9.8 0 1 1-19.6 0a9.8 9.8 0 1 1 19.6 0zM108.5 88.3h35.99c34.26 0 49.31 24.31 49.31 46.05 0 23.62-18.6 46.05-49.14 46.05H108.5zm16.1 77.7h18.94c26.98 0 33.16-21.2 33.16-31.75 0-17.2-10.59-31.75-33.78-31.75H124.6z" />
        </>
      )}
    </svg>
  )
})
