import { Link, type LinkProps } from '@chakra-ui/react'
import { OrcidIdIcon } from '../Icons/orcid'
import { ORCID_URL_PREFIX, canonicalOrcid } from '../../lib/orcid/uri'

/**
 * The owner's ORCID iD as ORCID's iD display guidelines want it on a web
 * page: the iD icon, then the full URI (`https://orcid.org/0000-…`) as the
 * link text, the whole thing linking to the record. One component for every
 * web surface (the A4 sheet's header, the Reading view, the /about rail,
 * /publications), so the format never drifts; each caller passes its own
 * typography and colour.
 *
 * Accessible name: "ORCID iD: https://orcid.org/0000-… (opens in a new
 * tab)" — a visually hidden "ORCID iD: " before the visible URI (so the
 * visible text is contained in the name, WCAG 2.5.3); the icon is
 * decorative. Renders nothing for an empty or invalid iD. `rel="me"` states
 * that the record is the owner's.
 */
export default function OrcidIdLink({
  id,
  iconSize = 16,
  sx,
  ...rest
}: {
  /** The canonical iD or its record URI, as the server ships it (lib/orcid/cv orcidOf). */
  id: string
  /** Icon size in px (16 is the smallest the guidelines allow). */
  iconSize?: number
} & Omit<LinkProps, 'href' | 'children'>) {
  const bare = canonicalOrcid(id)
  if (!bare) return null
  const href = `${ORCID_URL_PREFIX}${bare}`
  return (
    <Link
      href={href}
      isExternal
      rel="me noopener noreferrer"
      display="inline-flex"
      alignItems="flex-start"
      columnGap="0.4em"
      sx={sx}
      {...rest}
    >
      {/* Centred on the first line of text (1lh), also when the URI wraps. */}
      <OrcidIdIcon size={iconSize} style={{ flexShrink: 0, marginTop: `max(0px, calc((1lh - ${iconSize}px) / 2))` }} />
      <span className="sr-only">ORCID iD: </span>
      {/* In a narrow column the URI breaks after "orcid.org/", never inside the iD. */}
      <span>
        {ORCID_URL_PREFIX}
        <wbr />
        <span style={{ whiteSpace: 'nowrap' }}>{bare}</span>
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </Link>
  )
}
