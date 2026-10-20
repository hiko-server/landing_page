/**
 * The "authenticated" marker of the owner's ORCID iD — light and pure, for
 * the public pruning (lib/cvVisibility), the readers (lib/orcid/cv) and the
 * Studio alike.
 *
 * Personal Info carries the iD in `orcid` (typed in, or filled by "Connect
 * your ORCID iD") and, once the owner signed in to ORCID and ORCID confirmed
 * the iD, the marker
 *
 *   orcidAuthenticated: { id: '<the confirmed iD>', at: '<ISO time>' }
 *
 * written only by the server (the OAuth callback; a save keeps the stored
 * marker while the iD stays the same and drops it otherwise —
 * lib/orcid/connection reconcileOrcidAuth). The iD counts as authenticated
 * exactly while `orcid` holds that same iD: editing the iD by hand to
 * another value makes it unauthenticated, everywhere, at once.
 *
 * Public views carry `{ id }` only, and only while the iD itself is public
 * and still the confirmed one; the connection time stays in the editor.
 */

import { canonicalOrcid } from './uri'

export const ORCID_AUTH_FIELD = 'orcidAuthenticated'

export type OrcidAuthMarker = { id: string; at?: string }

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The marker of a Personal Info node when it is well formed (canonical iD; `at` an ISO time when present), else null. */
export function orcidAuthMarkerOf(node: unknown): OrcidAuthMarker | null {
  if (!isObject(node)) return null
  const m = node[ORCID_AUTH_FIELD]
  if (!isObject(m)) return null
  const id = canonicalOrcid(m.id)
  if (!id) return null
  const at = typeof m.at === 'string' && !Number.isNaN(Date.parse(m.at)) ? m.at : undefined
  return at ? { id, at } : { id }
}

/**
 * True when the node's marker confirms the iD the node holds now (`orcid`,
 * canonical or its record URI). Visibility is the caller's business: the
 * public view has already removed a hidden iD and its marker.
 */
export function markerConfirms(node: unknown): boolean {
  const m = orcidAuthMarkerOf(node)
  return !!m && isObject(node) && canonicalOrcid(node.orcid) === m.id
}

/**
 * The marker's public form for a stored Personal Info section: `{ id }`
 * while the iD is public (`orcidHidden` false) and still the confirmed one;
 * null (no marker in the public view) otherwise.
 */
export function publicOrcidAuth(section: unknown, orcidHidden: boolean): { id: string } | null {
  if (orcidHidden || !markerConfirms(section)) return null
  return { id: (orcidAuthMarkerOf(section) as OrcidAuthMarker).id }
}
