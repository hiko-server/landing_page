import { createContext, useContext } from 'react'
import type { CvLang, CvPath, CvSurface } from '../../../lib/cvVisibility'
import type { ListOp } from './docOps'

/**
 * A request to reveal and focus one element of the editor (from the Hidden
 * items panel, a readiness finding, a save error). `control`: focus the
 * field's input instead of its eye toggle (to type a value into it);
 * `toggle: 'audience'`: focus its "Shows on" control (a limited row).
 */
export type FocusTarget = { lang: CvLang; path: CvPath; nonce: number; control?: boolean; toggle?: 'audience' }

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
  /** Audiences (E4): where a field / list of `nodePath`, or the section / entry at `path`, shows (null = everywhere). */
  setFieldAudience: (nodePath: CvPath, field: string, list: CvSurface[] | null, label: string) => void
  setNodeAudience: (path: CvPath, list: CvSurface[] | null, label: string) => void
  /** Structural edit of an object list or string list (mirrored when the languages line up). */
  list: (listPath: CvPath, op: ListOp, label?: string) => void
  /** Insert several string items at once (multi-line paste) as one undo step. */
  insertMany: (listPath: CvPath, index: number, values: string[], replaceAtIndex?: boolean) => void
  /**
   * Length of the same list in the other language, or null when there is no
   * unambiguous twin (section missing there, or an enclosing list differs).
   */
  twinLength: (listPath: CvPath) => number | null
  /**
   * Value at the same place in the other language (the section matched by
   * name, the rest of the path as is), or undefined when there is none.
   */
  twinValue?: (path: CvPath) => unknown
  /** Latest jump request; lists expand the entries on its path. */
  focus: FocusTarget | null
  /**
   * The owner's ORCID iD from the unsaved document (this language's
   * Personal Info, else the other's; bare, '' when unset or invalid). Set
   * even when the field is hidden — hiding keeps it off the public CV, not
   * out of the Studio's import.
   */
  orcid: string
  /** That iD is the one ORCID confirmed ("Connect your ORCID iD"). */
  orcidAuthenticated?: boolean
  /** Append whole entries (the ORCID import's papers) to an object list as ONE undo step; mirrored when linked and aligned. */
  appendEntries: (listPath: CvPath, entries: readonly Record<string, any>[], label: string) => void
  /** Open a section and focus one of its fields' input (e.g. Personal Info → ORCID iD). */
  goToField: (sectionName: string, field: string) => void
  /** Every case study (drafts flagged) for the project editor's slug note; null while unknown. */
  caseStudies?: readonly { slug: string; title: string; draft?: boolean }[] | null
  /** The document has unsaved changes (connecting ORCID waits for a save). */
  dirty?: boolean
  /**
   * The server changed the stored CV itself (disconnecting ORCID) on top of
   * the version this editor is based on: `etag` is the editor's If-Match for
   * that request; `adopt` takes the server's result as the saved state.
   */
  serverChange?: { etag: () => string | null; adopt: (doc: { en: any[]; zh: any[] }, etag: string) => void; current: () => { en: any[]; zh: any[] } }
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
