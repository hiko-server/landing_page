import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { getShortcutsEnabled, isImeComposing } from '../../../lib/keyboardShortcuts'
import { isNowhereTarget, isTextEntryTarget, listKeyAction, type ListKeyAction } from './listKeys'

/**
 * Roving-tabindex keyboard navigation for an admin list (keys: listKeys.ts).
 * The list container gets `listProps`, each row's focusable element
 * `itemProps(i)`: exactly one row is in the Tab order, j / k / arrows move
 * focus between rows, Enter / o open, x selects and the list's own keys run
 * its actions on the focused row.
 *
 * `global`: j / k also work while nothing in particular has focus (the page
 * body, <main>, a clicked panel — listKeys isNowhereTarget), the way list
 * views in mail and issue trackers behave — never while a
 * dialog is open, inside a text field or with single-key shortcuts off. That
 * listener runs in the capture phase, so it always comes before the visitor
 * keyboard layer (components/Chrome/KeyboardLayer, which also takes j / k
 * and mounts from a chunk of its own — whichever registered first used to
 * win); a key it moves the list with is marked handled for the layer.
 */

export type UseListKeyboardOptions = {
  count: number
  onOpen?: (index: number) => void
  onSelect?: (index: number) => void
  /** Keys handled by `onAction` ("e", "s", "#", "Delete", …). */
  actions?: readonly string[]
  onAction?: (key: string, index: number) => void
  global?: boolean
  /** Called when the roving focus moves (j / k / arrows / click / Tab). */
  onActiveChange?: (index: number) => void
}

export function useListKeyboard(opts: UseListKeyboardOptions) {
  const [active, setActive] = useState(-1)
  const containerRef = useRef<HTMLElement | null>(null)
  const optsRef = useRef(opts)
  optsRef.current = opts
  const activeRef = useRef(active)
  activeRef.current = active

  // Keep the roving index inside the list when it shrinks.
  useEffect(() => {
    if (active >= opts.count) setActive(opts.count - 1)
  }, [active, opts.count])

  const focusItem = useCallback((index: number) => {
    setActive(index)
    optsRef.current.onActiveChange?.(index)
    requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector<HTMLElement>(`[data-list-item="${index}"]`)
      el?.focus()
      el?.scrollIntoView?.({ block: 'nearest' })
    })
  }, [])

  const apply = useCallback(
    (action: ListKeyAction) => {
      const o = optsRef.current
      if (action.type === 'move') focusItem(action.to)
      else if (action.type === 'open') o.onOpen?.(action.index)
      else if (action.type === 'select') o.onSelect?.(action.index)
      else o.onAction?.(action.key, action.index)
    },
    [focusItem],
  )

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.defaultPrevented) return
      const o = optsRef.current
      // Rows may hold their own buttons: let Enter on them do their own thing.
      const target = e.target as HTMLElement
      if (e.key === 'Enter' && target.closest('button, a[href]') && !target.hasAttribute('data-list-item')) return
      const action = listKeyAction(e, {
        count: o.count,
        active: activeRef.current,
        singleKeys: getShortcutsEnabled(),
        inEditable: isTextEntryTarget(e.target),
        actions: o.actions,
        selectable: !!o.onSelect,
      })
      if (!action) return
      e.preventDefault()
      apply(action)
    },
    [apply],
  )

  useEffect(() => {
    if (!opts.global) return
    const onDocKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return
      if (e.key !== 'j' && e.key !== 'k') return
      const container = containerRef.current
      if (!container || container.contains(e.target as Node)) return
      if (isTextEntryTarget(e.target) || !getShortcutsEnabled()) return
      if (document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]')) return
      // Only from "nowhere": the body, <main>, or a plain container focused by a click
      // (the dashboard's tab panel) — not from a control or another widget.
      if (e.target && !isNowhereTarget(e.target)) return
      const action = listKeyAction(e, {
        count: optsRef.current.count,
        active: activeRef.current,
        singleKeys: true,
        inEditable: false,
      })
      if (!action || action.type !== 'move') return
      e.preventDefault()
      focusItem(action.to)
    }
    document.addEventListener('keydown', onDocKey, true)
    return () => document.removeEventListener('keydown', onDocKey, true)
  }, [opts.global, focusItem])

  const itemProps = useCallback(
    (index: number) => ({
      tabIndex: index === (active === -1 ? 0 : active) ? 0 : -1,
      'data-list-item': index,
      onFocus: (e: FocusEvent<HTMLElement>) => {
        // Focus inside the row (its own buttons) does not move the roving index.
        if (e.target !== e.currentTarget) return
        if (activeRef.current !== index) {
          setActive(index)
          optsRef.current.onActiveChange?.(index)
        }
      },
    }),
    [active],
  )

  const setContainer = useCallback((node: HTMLElement | null) => {
    containerRef.current = node
  }, [])

  return { active, setActive, focusItem, listProps: { onKeyDown, ref: setContainer }, itemProps }
}

/**
 * j / k for a widget that already owns its arrow keys (an Accordion's
 * buttons): move focus to the next / previous element matching `selector`
 * inside the element the handler is on. Same rules as the lists: the
 * single-key switch, never in text fields, with a modifier or while composing.
 */
export function onJkMoveFocus(selector: string) {
  return (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isImeComposing(e.nativeEvent)) return
    if (e.key !== 'j' && e.key !== 'k') return
    if (isTextEntryTarget(e.target) || !getShortcutsEnabled()) return
    const list = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(selector))
    if (!list.length) return
    const at = list.indexOf(document.activeElement as HTMLElement)
    const next = list[at === -1 ? 0 : Math.min(list.length - 1, Math.max(0, at + (e.key === 'j' ? 1 : -1)))]
    e.preventDefault()
    next?.focus()
  }
}
