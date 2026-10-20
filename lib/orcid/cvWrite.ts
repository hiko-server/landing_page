import type { NextApiResponse } from 'next'
import { readCvDataWithVersion, saveSnapshot, writeCvData, type FullCvDoc } from '../cvdata'
import { ifMatchAllows, kvEtag, stableStringify } from '../contentStore'
import { CV_PAGE_PATHS, revalidatePaths } from '../revalidate'
import { warmCvExports } from '../cvExport/service'
import type { Logger } from '../log'

/**
 * One server-side change to the stored CV, made the way a save is
 * (SERVER-ONLY): read the document and its version, apply `change`, keep the
 * current state recoverable (a snapshot, noted in the activity log's scope),
 * write only if the version is still the one read (a concurrent save wins
 * and the change is re-applied on top of it, up to three times), then
 * regenerate the CV-backed pages and re-render the PDFs, as a save does.
 *
 * `change` returns the new document, the same document (nothing to do), or
 * null (the change cannot apply — reported as `inapplicable`). With
 * `ifMatch` (the ETag an editor's copy is based on) the change applies only
 * to that version: anything newer is a `conflict` and nothing is written.
 */
export type CvChangeResult =
  | { kind: 'written'; etag: string; revalidateFailed: string[] }
  | { kind: 'unchanged' }
  | { kind: 'inapplicable' }
  | { kind: 'conflict'; etag: string }
  | { kind: 'error'; error: string }

export async function changeStoredCv(
  res: NextApiResponse,
  change: (doc: FullCvDoc) => FullCvDoc | null,
  log: Logger,
  opts: { ifMatch?: string | string[] } = {},
): Promise<CvChangeResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = readCvDataWithVersion()
    if (!ifMatchAllows(opts.ifMatch, current.version)) return { kind: 'conflict', etag: kvEtag(current.version) }
    const before: FullCvDoc = { en: current.en, zh: current.zh }
    const next = change(before)
    if (next === null) return { kind: 'inapplicable' }
    if (stableStringify(next) === stableStringify(before)) return { kind: 'unchanged' }
    try {
      saveSnapshot()
    } catch (err) {
      log.warn('CV snapshot failed', { before: 'orcid', err })
    }
    const written = await writeCvData(next, { precondition: (version) => version === current.version })
    if (!written.ok) {
      if (written.conflict) continue
      return { kind: 'error', error: written.error }
    }
    warmCvExports()
    const paths = [...CV_PAGE_PATHS]
    const revalidateFailed = await revalidatePaths(res, paths, { confirm: paths })
    return { kind: 'written', etag: kvEtag(written.updatedAt), revalidateFailed }
  }
  return { kind: 'error', error: 'The CV kept changing while it was being updated' }
}
