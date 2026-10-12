import { createContext, useContext } from 'react'
import type { CvLang, CvPath } from '../../../lib/cvVisibility'
import type { ListOp } from './docOps'

/**
 * Edit API handed to every form control in the Studio. Paths are relative to
 * the active language's section array: [sectionIndex, key, index, key, …].
 */
export type StudioApi = {
  lang: CvLang
  linked: boolean
  /** Text / value edit (never linked across languages). */
  setValue: (path: CvPath, value: any) => void
  toggleField: (nodePath: CvPath, field: string) => void
  toggleEntry: (entryPath: CvPath) => void
  toggleItem: (parentPath: CvPath, field: string, index: number) => void
  /** Structural edit of an object list or string list (linked when shapes match). */
  list: (listPath: CvPath, op: ListOp, label?: string) => void
  /** Insert several string items at once (multi-line paste) as one undo step. */
  insertMany: (listPath: CvPath, index: number, values: string[], replaceAtIndex?: boolean) => void
}

export const StudioContext = createContext<StudioApi | null>(null)

export function useStudio(): StudioApi {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('useStudio must be used inside <StudioContext.Provider>')
  return ctx
}
