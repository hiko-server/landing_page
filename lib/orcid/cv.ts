/**
 * The owner's ORCID iD as CV data: the Personal Info field that holds it
 * and the one reader every surface uses (the CV header and its files,
 * /publications, the /about rail, the Person JSON-LD, llms.txt). Pure and
 * light (no React, no formatting code), so server-only modules on the
 * proxy's import graph (lib/isrPages → lib/publicationsData) can use it.
 */

import { isRedacted } from '../cvVisibilityRead'
import { normalizeOrcidId } from './id'
import { orcidAuthMarkerOf } from './marker'

export { ORCID_AUTH_FIELD } from './marker'

/** The Personal Info field that holds the owner's ORCID iD. */
export const ORCID_FIELD = 'orcid'
export const ORCID_LABEL = 'ORCID'

/**
 * The owner's ORCID iD from a Personal Info section (public or editor
 * document): the canonical bare iD, or '' when empty, invalid or hidden.
 */
export function orcidOf(pi: unknown): string {
  if (!pi || typeof pi !== 'object' || Array.isArray(pi) || isRedacted(pi, ORCID_FIELD)) return ''
  return normalizeOrcidId((pi as Record<string, unknown>)[ORCID_FIELD])
}

/**
 * True when the owner's iD (as `orcidOf` reads it: set, valid, not hidden)
 * is the one ORCID confirmed through "Connect your ORCID iD" (the marker,
 * lib/orcid/marker). False for an iD that was typed in — it is shown with
 * ORCID's unauthenticated iD icon and "(unauthenticated)".
 */
export function orcidAuthenticatedOf(pi: unknown): boolean {
  const id = orcidOf(pi)
  return !!id && orcidAuthMarkerOf(pi)?.id === id
}
