import { useSyncExternalStore } from 'react'
import { getShortcutsEnabled, subscribeShortcuts } from '../../lib/keyboardShortcuts'

const serverSnapshot = () => true

/**
 * Whether single-character keyboard shortcuts are on (lib/keyboardShortcuts).
 * Renders "on" on the server and while hydrating, then the stored choice.
 */
export function useShortcutsEnabled(): boolean {
  return useSyncExternalStore(subscribeShortcuts, getShortcutsEnabled, serverSnapshot)
}
