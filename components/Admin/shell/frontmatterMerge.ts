/**
 * Frontmatter round-trip for the admin editors (useMdxItemEditor for posts
 * and case studies, PageEditor for /now and /uses).
 *
 * A form models only some frontmatter keys, while the admin PUT stores the
 * frontmatter it receives as the whole new frontmatter. Keys the form does
 * not show — seoTitle, updated, lang, a post's coverAlt, anything added
 * later — must therefore travel with every save, or one save erases them:
 *
 *   on load   extra = unmodelledFrontmatter(stored, modelled)
 *   on save   frontmatter = mergeFrontmatter(extra, toServer(form), modelled)
 *
 * A modelled key the form emits as `undefined` (a field the editor cleared)
 * is left out of the merge, so the save still removes it.
 */

export type FrontmatterRecord = Record<string, unknown>

const isRecord = (v: unknown): v is FrontmatterRecord => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Every key an editor models: the keys of each given shape — its empty form
 * and what its toServer writes for it (keys with an undefined value count,
 * they are the fields a cleared input removes).
 */
export function modelledKeys(...shapes: ReadonlyArray<FrontmatterRecord | null | undefined>): Set<string> {
  const keys = new Set<string>()
  for (const shape of shapes) if (isRecord(shape)) for (const k of Object.keys(shape)) keys.add(k)
  return keys
}

/** The stored frontmatter without the modelled keys: the fields the form does not show, as stored. */
export function unmodelledFrontmatter(stored: unknown, modelled: ReadonlySet<string>): FrontmatterRecord {
  const out: FrontmatterRecord = {}
  if (!isRecord(stored)) return out
  for (const [k, v] of Object.entries(stored)) {
    if (!modelled.has(k) && v !== undefined) out[k] = v
  }
  return out
}

/**
 * The frontmatter to save: the unmodelled fields as loaded, then the form's
 * output. An undefined form value is left out (the save removes that key);
 * a modelled key never comes back from `extra`.
 */
export function mergeFrontmatter(
  extra: FrontmatterRecord,
  edited: FrontmatterRecord,
  modelled: ReadonlySet<string> = new Set(Object.keys(edited)),
): FrontmatterRecord {
  const out: FrontmatterRecord = {}
  for (const [k, v] of Object.entries(extra || {})) {
    if (!modelled.has(k) && !(k in edited) && v !== undefined) out[k] = v
  }
  for (const [k, v] of Object.entries(edited)) {
    if (v !== undefined) out[k] = v
  }
  return out
}
