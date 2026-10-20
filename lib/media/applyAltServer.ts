import { scanBody } from '../contentHealth/mdxScan'
import { isValidUploadName } from '../security/uploadName'
import { isVariantName } from '../uploadVariants'
import { rebuildUsage } from './library'
import { readMediaMeta } from './metaStore'
import { altForLang, fillBodyAlt, fillCoverAlt } from './applyAlt'
import { rewriteDocuments, type RewriteRun } from './docRewrite'

/**
 * "Use the default alt text where it is missing" (H7) — SERVER-ONLY. Every
 * post, case study (live version and unpublished changes) and page that
 * shows the upload without an alt text (or with a file name as alt) gets
 * the image's default — the English one in English documents, the Chinese
 * one in Chinese documents (a document in another language, or without a
 * default in its language, is left alone). Snapshotted first, like a save.
 */

export type ApplyAltOutcome = ({ ok: true; places: number } & RewriteRun) | { ok: false; status: 400; error: string }

export async function applyDefaultAlt(name: string): Promise<ApplyAltOutcome> {
  if (!isValidUploadName(name) || isVariantName(name)) return { ok: false, status: 400, error: 'Not an upload name' }
  const meta = readMediaMeta().doc.items[name]
  if (!meta?.alt && !meta?.altZh) return { ok: false, status: 400, error: 'Write a default alt text first' }
  const run = await rewriteDocuments((doc, { lang }) => {
    const alt = altForLang(lang, meta)
    if (!alt) return { value: doc, count: 0 }
    const cover = fillCoverAlt(doc.frontmatter, name, alt)
    const body = fillBodyAlt(doc.body, scanBody(doc.body), name, alt)
    const count = cover.changed + body.changed
    return { value: count ? { frontmatter: cover.frontmatter, body: body.body } : doc, count }
  })
  rebuildUsage(true)
  return { ok: true, places: run.rewrites.reduce((n, r) => n + r.references, 0), ...run }
}
