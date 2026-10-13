import { createContext, useContext } from 'react'
import type { CvLang, CvPath } from '../../../lib/cvVisibility'
import type { ListOp } from './docOps'

/** A request to reveal and focus one element of the editor (from the Hidden items panel). */
export type FocusTarget = { lang: CvLang; path: CvPath; nonce: number }

/**
 * Edit API handed to every form control in the Studio. Paths are relative to
 * the active language's section array: [sectionIndex, key, index, key, …].
 */
export type StudioApi = {
  lang: CvLang
  linked: boolean
  /**
   * Text / value edit. Per language, except a registry field marked `shared`
   * (`{ shared: true }`), which also reaches the aligned twin when linked.
   */
  setValue: (path: CvPath, value: any, opts?: { shared?: boolean }) => void
  /** Visibility toggles; `label` names the thing in the confirmation toast. */
  toggleField: (nodePath: CvPath, field: string, label: string) => void
  toggleEntry: (entryPath: CvPath, label: string) => void
  toggleItem: (parentPath: CvPath, field: string, index: number, label: string) => void
  /** Structural edit of an object list or string list (mirrored when the languages line up). */
  list: (listPath: CvPath, op: ListOp, label?: string) => void
  /** Insert several string items at once (multi-line paste) as one undo step. */
  insertMany: (listPath: CvPath, index: number, values: string[], replaceAtIndex?: boolean) => void
  /**
   * Length of the same list in the other language, or null when there is no
   * unambiguous twin (section missing there, or an enclosing list differs).
   */
  twinLength: (listPath: CvPath) => number | null
  /** Latest jump request; lists expand the entries on its path. */
  focus: FocusTarget | null
}

export const StudioContext = createContext<StudioApi | null>(null)

export function useStudio(): StudioApi {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('useStudio must be used inside <StudioContext.Provider>')
  return ctx
}

/** Value of the data-cvpath attribute that marks an editor element for jump-to. */
export const cvPathAttr = (lang: CvLang, path: CvPath) => `${lang}:${path.join('.')}`

/** True when `path` runs through `prefix` (same leading segments). */
export function pathStartsWith(path: CvPath, prefix: CvPath): boolean {
  return path.length >= prefix.length && prefix.every((seg, i) => path[i] === seg)
}
