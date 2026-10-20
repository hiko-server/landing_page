import { Link, type LinkProps } from '@chakra-ui/react'
import { OrcidIdIcon } from '../Icons/orcid'
import { ORCID_URL_PREFIX, canonicalOrcid } from '../../lib/orcid/uri'
import { orcidDisplay, type OrcidDisplayLang } from '../../lib/orcid/display'

/**
 * The owner's ORCID iD as ORCID's iD display guidelines want it on a web
 * page: the iD icon, then the full URI (`https://orcid.org/0000-…`) as the
 * link text, the whole thing linking to the record. An iD the owner proved
 * by signing in to ORCID (`authenticated`) gets the green iD icon; a typed-in
 * one gets ORCID's unauthenticated iD icon, and the link is FOLLOWED by
 * "(unauthenticated)" / "（未经认证）" (lib/orcid/display) — plain text after
 * the link, as the guidelines put it, so the link keeps its own name and
 * size. One component for every web surface (the A4 sheet's header, the
 * Reading view, the /about rail, /publications), so the format never
 * drifts; each caller passes the link's typography and colour (the suffix
 * takes the surrounding text's).
 *
 * Accessible name: "ORCID iD: https://orcid.org/0000-… (opens in a new
 * tab)" — a visually hidden "ORCID iD: " before the visible URI (so the
 * visible text is contained in the name, WCAG 2.5.3); the icon is
 * decorative; the suffix is read right after the link. Renders nothing for
 * an empty or invalid iD. `rel="me"` states that the record is the owner's.
 */
export default function OrcidIdLink({
  id,
  authenticated = false,
  lang = 'en',
  iconSize = 16,
  sx,
  ...rest
}: {
  /** The canonical iD or its record URI, as the server ships it (lib/orcid/cv orcidOf). */
  id: string
  /** True when ORCID confirmed the iD (lib/orcid/cv orcidAuthenticatedOf); a typed-in iD is shown as unauthenticated. */
  authenticated?: boolean
  /** Language of the "(unauthenticated)" suffix. */
  lang?: OrcidDisplayLang
  /** Icon size in px (16 is the smallest the guidelines allow). */
  iconSize?: number
} & Omit<LinkProps, 'href' | 'children'>) {
  const bare = canonicalOrcid(id)
  if (!bare) return null
  const href = `${ORCID_URL_PREFIX}${bare}`
  const display = orcidDisplay(authenticated, lang)
  // With a suffix, the link and the suffix share a wrapping row with a hanging
  // indent: the icon hangs in the indent, so a suffix that has to wrap lines
  // up under the URI, not under the icon.
  const indent = `calc(${iconSize}px + 0.4em)`
  const link = (
    <Link
      href={href}
      isExternal
      rel="me noopener noreferrer"
      display="inline-flex"
      // The URI sets the link's baseline (the suffix sits on its line of text) …
      alignItems="baseline"
      columnGap="0.4em"
      data-orcid={display.icon}
      sx={sx}
      {...rest}
      style={display.suffix ? { marginInlineStart: `calc(-1 * ${indent})` } : undefined}
    >
      {/* … while the icon is centred on its first line (1lh), also when the URI wraps. */}
      <OrcidIdIcon
        size={iconSize}
        authenticated={display.icon === 'authenticated'}
        style={{ flexShrink: 0, alignSelf: 'flex-start', marginTop: `max(0px, calc((1lh - ${iconSize}px) / 2))` }}
      />
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
  if (!display.suffix) return link
  return (
    <span
      className="orcid-id"
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        // The Chinese full-width bracket brings its own space.
        columnGap: display.suffixLang ? '0.1em' : '0.35em',
        paddingInlineStart: indent,
        maxWidth: '100%',
      }}
    >
      {link}
      <span className="orcid-id-suffix" lang={display.suffixLang} style={{ whiteSpace: 'nowrap' }}>
        {display.suffix}
      </span>
    </span>
  )
}
