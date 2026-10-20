import { useCallback, useRef, type RefObject } from 'react'

/**
 * A ref that keeps the last element it was given, for a focus target read
 * while React commits — e.g. a dialog's finalFocusRef, read as the dialog
 * unmounts. Chakra re-merges a MenuButton's refs on every render, and React
 * detaches the old merged ref (null) before it attaches the new one, so a
 * plain ref to a ⋯ / Period menu button is briefly null in exactly that
 * commit and focus went elsewhere. Callers check `isConnected` before use:
 * an element that really left the page is never focused.
 */
export function useStickyRef<T extends HTMLElement>(): [RefObject<T>, (el: T | null) => void] {
  const ref = useRef<T | null>(null)
  const set = useCallback((el: T | null) => {
    if (el) ref.current = el
  }, [])
  return [ref, set]
}
