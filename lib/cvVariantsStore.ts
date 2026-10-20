/**
 * Storage of the CV variants (lib/cvVariants) — SERVER-ONLY.
 *
 * One kv row, `cvvariants`, in the content store: versioned like the CV
 * (`updated_at` = ETag, If-Match on save), mirrored to R2 and carried by
 * every backup. Never read by a public page except through a share link
 * (lib/cvShare/page), which renders one variant for the 'private' surface.
 */

import { getKvWithMeta, putKv, type KvPutResult } from './contentStore'
import { EMPTY_VARIANTS, VARIANTS_KV_KEY, findVariant, readVariantDoc, type CvVariant, type CvVariantDoc } from './cvVariants'

export function readVariants(): CvVariantDoc & { version: number } {
  const row = getKvWithMeta<unknown>(VARIANTS_KV_KEY)
  return { ...(row.value === null ? EMPTY_VARIANTS : readVariantDoc(row.value)), version: row.updatedAt }
}

export function readVariant(id: unknown): CvVariant | null {
  return findVariant(readVariants(), id)
}

/** Store a validated document; `precondition` makes the If-Match check atomic with the write. */
export async function writeVariants(doc: CvVariantDoc, precondition?: (version: number) => boolean): Promise<KvPutResult> {
  return await putKv(VARIANTS_KV_KEY, { variants: doc.variants }, precondition ? { precondition } : {})
}
