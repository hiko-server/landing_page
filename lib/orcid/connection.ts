/**
 * The authenticated marker's lifecycle on the stored CV document (pure;
 * lib/orcid/marker describes the marker itself):
 *
 *   connect     the OAuth callback writes the iD ORCID confirmed into every
 *               Personal Info section (EN and 中文 — the field is shared)
 *               together with the marker { id, at }. A different iD that
 *               was typed there is replaced: ORCID's answer is the owner's.
 *               The field's visibility is left as the owner set it.
 *   disconnect  removes the marker; the iD stays on the CV (now shown as
 *               unauthenticated) — clearing or hiding it is an ordinary
 *               edit, with Undo. One action, one effect.
 *   edit        changing the iD in the Studio removes the marker from the
 *               unsaved document in the same (undoable) step
 *               (dropStaleOrcidAuth): typing the old iD back does not bring
 *               it back — only Undo or a new sign-in does.
 *   save        a document from the browser (Studio, raw JSON, import)
 *               can drop the marker but never create or change it: the
 *               server keeps the STORED marker on a Personal Info section
 *               only where the document still carries that marker and the
 *               section's iD is still that iD, and removes every other
 *               marker (reconcileOrcidAuth). So an iD edited by hand to
 *               another value is unauthenticated from that save on, and a
 *               marker typed into the JSON is ignored.
 */

import { canonicalOrcid } from './uri'
import { ORCID_AUTH_FIELD, markerConfirms, orcidAuthMarkerOf, type OrcidAuthMarker } from './marker'

export type CvDocument = { en: any[]; zh: any[] }

const PI = 'personalInformation'
const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const isPi = (s: unknown): s is Record<string, any> => isObject(s) && s.sessionName === PI

function mapPi(list: unknown, fn: (pi: Record<string, any>) => Record<string, any>): { list: any[]; changed: boolean } {
  if (!Array.isArray(list)) return { list: [], changed: false }
  let changed = false
  const out = list.map((s) => {
    if (!isPi(s)) return s
    const next = fn(s)
    if (next !== s) changed = true
    return next
  })
  return { list: changed ? out : list, changed }
}

function withoutMarker(pi: Record<string, any>): Record<string, any> {
  if (!(ORCID_AUTH_FIELD in pi)) return pi
  const rest = { ...pi }
  delete rest[ORCID_AUTH_FIELD]
  return rest
}

/** True when the document has a Personal Info section in either language. */
export function hasPersonalInfo(doc: CvDocument): boolean {
  return [...(doc.en || []), ...(doc.zh || [])].some(isPi)
}

/** The marker stored on the document (the first well-formed one, EN first), or null. */
export function storedOrcidAuth(doc: CvDocument): OrcidAuthMarker | null {
  for (const s of [...(Array.isArray(doc.en) ? doc.en : []), ...(Array.isArray(doc.zh) ? doc.zh : [])]) {
    if (!isPi(s)) continue
    const m = orcidAuthMarkerOf(s)
    if (m && m.at) return m
  }
  return null
}

/**
 * The document with the iD ORCID confirmed set on every Personal Info
 * section and marked authenticated at `at` (ISO time). `replaced` is the
 * canonical iD that was there before when it was a different one.
 * null when the document has no Personal Info section to hold it.
 */
export function connectOrcidInCv(doc: CvDocument, id: string, at: string): { doc: CvDocument; replaced: string } | null {
  const canonical = canonicalOrcid(id)
  if (!canonical) throw new Error('not a canonical ORCID iD')
  if (!hasPersonalInfo(doc)) return null
  let replaced = ''
  const set = (pi: Record<string, any>) => {
    const before = canonicalOrcid(pi.orcid)
    if (before && before !== canonical && !replaced) replaced = before
    return { ...pi, orcid: canonical, [ORCID_AUTH_FIELD]: { id: canonical, at } }
  }
  return { doc: { en: mapPi(doc.en, set).list, zh: mapPi(doc.zh, set).list }, replaced }
}

/** The document without any marker (the iD stays); `changed` false when there was none. */
export function disconnectOrcidInCv(doc: CvDocument): { doc: CvDocument; changed: boolean } {
  const en = mapPi(doc.en, withoutMarker)
  const zh = mapPi(doc.zh, withoutMarker)
  return { doc: { en: en.list, zh: zh.list }, changed: en.changed || zh.changed }
}

/**
 * The Studio's edit rule: every Personal Info marker that no longer
 * confirms its section's iD is removed. Returns `doc` itself when nothing
 * changes.
 */
export function dropStaleOrcidAuth<T extends CvDocument>(doc: T): T {
  const fix = (pi: Record<string, any>) => (ORCID_AUTH_FIELD in pi && !markerConfirms(pi) ? withoutMarker(pi) : pi)
  const en = mapPi(doc.en, fix)
  const zh = mapPi(doc.zh, fix)
  return en.changed || zh.changed ? ({ ...doc, en: en.list, zh: zh.list } as T) : doc
}

/**
 * The save rule (see the module comment): `next` (a document a browser sent)
 * keeps the STORED marker on each Personal Info section that still carries
 * it (same iD) and still holds that iD; every other marker is removed.
 * Returns `next` itself when nothing changes.
 */
export function reconcileOrcidAuth(next: CvDocument, stored: CvDocument): CvDocument {
  const trusted = storedOrcidAuth(stored)
  const fix = (pi: Record<string, any>) => {
    const sent = orcidAuthMarkerOf(pi)
    const keep = !!trusted && !!sent && sent.id === trusted.id && canonicalOrcid(pi.orcid) === trusted.id
    if (!keep) return withoutMarker(pi)
    const current = pi[ORCID_AUTH_FIELD]
    if (isObject(current) && current.id === trusted.id && current.at === trusted.at && Object.keys(current).length === 2) return pi
    return { ...pi, [ORCID_AUTH_FIELD]: { id: trusted.id, at: trusted.at } }
  }
  const en = mapPi(next.en, fix)
  const zh = mapPi(next.zh, fix)
  return en.changed || zh.changed ? { en: en.list, zh: zh.list } : next
}
