import { ITEMS_ONLY_IN_KEY, audienceOf, normalizeAudience, type CvSurface } from './cvVisibility'

/**
 * The editor's side of an audience per bullet (followups-3, E4): reading,
 * setting and re-mapping `itemsOnlyIn` — the audience of one item of a
 * string list (a bullet, a tag, an author), keyed by position like
 * `hiddenItems`. What the public views do with it (the pruning:
 * itemsOffSurface) stays in lib/cvVisibility; these helpers are the
 * Studio's only, kept apart so the public pages' copy of the visibility
 * model does not grow with them.
 */

const isPlainObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A list position as stored in an itemsOnlyIn key ("0", "12"). */
export const ITEM_POSITION_RE = /^(0|[1-9]\d{0,5})$/

/**
 * The audience list of item `index` of `field` on `node` (null =
 * unrestricted). An unreadable map — of the node, or of the field — allows
 * none, as the pruning reads it (itemsOffSurface).
 */
export function itemAudience(node: any, field: string, index: number): CvSurface[] | null {
  const map = node?.[ITEMS_ONLY_IN_KEY]
  if (map === undefined || map === null) return null
  if (!isPlainObject(map)) return []
  const perField = map[field]
  if (perField === undefined || perField === null) return null
  if (!isPlainObject(perField)) return []
  return audienceOf(perField[String(index)])
}

/**
 * Set (or clear, with null / every surface) the audience of item `index` of
 * the string list `field`. Empty maps are removed.
 */
export function withItemAudience<T extends Record<string, any>>(node: T, field: string, index: number, list: readonly CvSurface[] | null): T {
  const next = normalizeAudience(list)
  const map = isPlainObject(node[ITEMS_ONLY_IN_KEY]) ? { ...node[ITEMS_ONLY_IN_KEY] } : {}
  const perField = isPlainObject(map[field]) ? { ...map[field] } : {}
  if (next === null) delete perField[String(index)]
  else perField[String(index)] = next
  if (Object.keys(perField).length) map[field] = perField
  else delete map[field]
  const out: any = { ...node, [ITEMS_ONLY_IN_KEY]: map }
  if (Object.keys(map).length === 0) delete out[ITEMS_ONLY_IN_KEY]
  return out
}

/**
 * Re-map the item audiences of the string list at `field` after it changed
 * shape (`mapping[oldIndex] = newIndex | -1 (removed)`), like
 * remapHiddenItems. A position with no mapping is dropped.
 */
export function remapItemAudiences<T extends Record<string, any>>(node: T, field: string, mapping: number[]): T {
  const map = node[ITEMS_ONLY_IN_KEY]
  if (!isPlainObject(map) || !isPlainObject(map[field])) return node
  const perField: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(map[field] as Record<string, unknown>)) {
    if (!ITEM_POSITION_RE.test(key)) continue
    const to = Number(key) < mapping.length ? mapping[Number(key)] : -1
    if (to >= 0) perField[String(to)] = value
  }
  const nextMap: Record<string, unknown> = { ...map }
  if (Object.keys(perField).length) nextMap[field] = perField
  else delete nextMap[field]
  const out: any = { ...node, [ITEMS_ONLY_IN_KEY]: nextMap }
  if (Object.keys(nextMap).length === 0) delete out[ITEMS_ONLY_IN_KEY]
  return out
}
