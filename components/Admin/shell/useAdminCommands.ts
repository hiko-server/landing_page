import { useEffect, useRef, useSyncExternalStore } from 'react'
import Router from 'next/router'
import { getShortcutsEnabled, isImeComposing } from '../../../lib/keyboardShortcuts'
import {
  chordTarget,
  isCurrentHref,
  registerAdminCommands,
  registeredAdminCommands,
  serverAdminCommands,
  subscribeAdminCommands,
  type AdminCommand,
} from './adminCommands'
import { isTextEntryTarget } from './listKeys'

/** How long "G" waits for its second key (the public header uses the same window). */
export const CHORD_WINDOW_MS = 1200

let chordUsers = 0
let detachChords: (() => void) | null = null

/**
 * Until when a "G" waits for its second key. Module state, not the
 * listener's: during a page change the old page's overlay detaches the
 * listener and the new one attaches it again (the URL has already changed
 * by then), and a "G" pressed in between must still count.
 */
let armedUntil = 0

export type ChordKeyEvent = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey' | 'repeat' | 'target' | 'isComposing' | 'keyCode' | 'preventDefault' | 'stopPropagation'>

export type ChordNavigation = { asPath: () => string; push: (href: string) => void }

const routerNavigation: ChordNavigation = { asPath: () => Router.asPath, push: (href) => void Router.push(href) }

/** One keydown for the "G then <key>" chords (exported for tests). */
export function handleChordKey(e: ChordKeyEvent, nav: ChordNavigation = routerNavigation, now = Date.now()): void {
  if (isImeComposing(e) || e.repeat) return
  if (e.metaKey || e.ctrlKey || e.altKey) {
    armedUntil = 0
    return
  }
  if (isTextEntryTarget(e.target) || !getShortcutsEnabled()) return
  if (document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]')) return
  const k = e.key.toLowerCase()
  if (now < armedUntil) {
    armedUntil = 0
    const target = chordTarget(k)
    if (!target) return
    e.preventDefault()
    e.stopPropagation()
    if (!isCurrentHref(target, nav.asPath())) nav.push(target)
    return
  }
  armedUntil = k === 'g' && !e.shiftKey ? now + CHORD_WINDOW_MS : 0
}

function attachChords(): () => void {
  const onKey = (e: KeyboardEvent) => handleChordKey(e)
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}

/**
 * "G then <key>" across the admin (mounted by the "?" overlay, which every
 * admin page has; one listener however many mount it): admin destinations
 * (adminCommands ADMIN_CHORDS) and the public site's. It listens in the
 * capture phase so the second key is never also a list's own key (G then S
 * goes to System, it does not star the focused message). Off with the
 * single-key shortcut switch, inside text fields, during IME composition and
 * while a dialog (the ⌘K palette included) is open.
 */
export function useAdminChords(): void {
  useEffect(() => {
    if (chordUsers++ === 0) detachChords = attachChords()
    return () => {
      if (--chordUsers === 0) {
        detachChords?.()
        detachChords = null
      }
    }
  }, [])
}

/**
 * Register a view's commands with the ⌘K palette while it is mounted. The
 * latest `commands` are used when one runs, so callers may pass a fresh
 * array each render; the list is re-registered only when `key` (labels,
 * availability) changes.
 */
export function useAdminCommands(owner: string, commands: readonly AdminCommand[], key: string): void {
  const latest = useRef(commands)
  latest.current = commands
  useEffect(() => {
    const stable = latest.current.map((c) => ({
      ...c,
      run: c.run ? () => latest.current.find((x) => x.id === c.id)?.run?.() : undefined,
    }))
    return registerAdminCommands(owner, stable)
  }, [owner, key])
}

/** The registered commands (the ⌘K palette's Admin group). */
export function useRegisteredAdminCommands(): readonly AdminCommand[] {
  return useSyncExternalStore(subscribeAdminCommands, registeredAdminCommands, serverAdminCommands)
}
