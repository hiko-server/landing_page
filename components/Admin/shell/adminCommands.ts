/**
 * Keyboard-first admin (H14): the "G then <key>" destinations of the admin
 * and the command registry the ⌘K palette reads (framework-free and tiny —
 * the public palette chunk imports it; unit tested).
 *
 *   - ADMIN_CHORDS: G then a letter jumps to an admin surface. The letters
 *     never reuse the public site's (h a w b c n u — components/Chrome/
 *     chrome.ts NAV_SHORTCUTS), which keep working in the admin.
 *   - The registry: an admin view registers the commands that make sense
 *     while it is on screen (Inbox: reply, archive, star …) with
 *     registerAdminCommands(owner, commands); the palette lists them under
 *     Admin next to the built-in destinations, and they disappear when the
 *     view unmounts.
 */

import { NAV_SHORTCUTS } from '../../Chrome/chrome'

export type AdminChord = { key: string; href: string; label: string; keywords: string }

export const ADMIN_CHORDS: readonly AdminChord[] = [
  { key: 'd', href: '/admin', label: 'Admin overview', keywords: 'dashboard overview start' },
  { key: 'i', href: '/admin/dashboard?tab=inbox', label: 'Inbox', keywords: 'messages contact mail' },
  { key: 'r', href: '/admin/dashboard?tab=cv', label: 'CV Studio', keywords: 'resume cv edit' },
  { key: 'e', href: '/admin/dashboard?tab=home', label: 'Home editor', keywords: 'landing edit home' },
  { key: 'p', href: '/admin/blog', label: 'Posts', keywords: 'writing blog articles' },
  { key: 'o', href: '/admin/work', label: 'Case studies', keywords: 'work portfolio projects' },
  { key: 'm', href: '/admin/media', label: 'Media library', keywords: 'images uploads photos pictures alt text trash' },
  { key: 't', href: '/admin/dashboard?tab=analytics', label: 'Analytics', keywords: 'traffic visitors goals stats' },
  { key: 'v', href: '/admin/dashboard?tab=versions', label: 'Versions', keywords: 'history snapshots restore' },
  { key: 'f', href: '/admin/dashboard?tab=storage', label: 'Storage', keywords: 'backups files r2 restore' },
  { key: 's', href: '/admin/system', label: 'System health', keywords: 'server status disk database' },
  { key: 'l', href: '/admin/system?view=activity', label: 'Activity log', keywords: 'audit who changed history' },
  { key: 'q', href: '/admin/system?view=content', label: 'Content health', keywords: 'links images quality seo audit' },
  { key: 'x', href: '/admin/system?view=errors', label: 'Errors', keywords: 'exceptions crashes monitoring' },
  { key: 'k', href: '/admin/security', label: 'Security', keywords: 'passkeys sessions sign-in password' },
]

/** Where "G then `key`" goes inside the admin: an admin destination, else the public one, else null. */
export function chordTarget(key: string): string | null {
  const k = key.toLowerCase()
  const admin = ADMIN_CHORDS.find((c) => c.key === k)
  if (admin) return admin.href
  return NAV_SHORTCUTS.find((n) => n.key === k)?.url ?? null
}

/** "G I" for an admin destination (exact href match), for palette hints. */
export function adminShortcutFor(href: string): string | undefined {
  const c = ADMIN_CHORDS.find((x) => x.href === href)
  return c ? `G ${c.key.toUpperCase()}` : undefined
}

/** True when `href` is the page the browser is on (path + query, hash ignored). */
export function isCurrentHref(href: string, asPath: string): boolean {
  const norm = (u: string) => {
    const [pathAndQuery] = u.split('#')
    const [p, q = ''] = pathAndQuery.split('?')
    const params = new URLSearchParams(q)
    params.sort()
    const s = params.toString()
    return `${p.replace(/\/+$/, '') || '/'}${s ? `?${s}` : ''}`
  }
  return norm(href) === norm(asPath)
}

// ── Command registry ────────────────────────────────────────────────────────

export type AdminCommand = {
  /** Unique within its owner. */
  id: string
  label: string
  /** Quiet text at the right: what it does or its state. */
  hint?: string
  keywords?: string
  /** Single key the view itself binds (shown as a hint): "R", "E", "#". */
  shortcut?: string
  href?: string
  run?: () => void | Promise<void>
}

type Listener = () => void
const owners = new Map<string, readonly AdminCommand[]>()
const listeners = new Set<Listener>()
let snapshot: readonly AdminCommand[] = []

function publish() {
  snapshot = Array.from(owners.entries()).flatMap(([owner, cmds]) => cmds.map((c) => ({ ...c, id: `${owner}:${c.id}` })))
  listeners.forEach((fn) => fn())
}

/** Show `commands` in the palette until the returned function is called (or the owner registers again). */
export function registerAdminCommands(owner: string, commands: readonly AdminCommand[]): () => void {
  owners.set(owner, commands)
  publish()
  return () => {
    if (owners.get(owner) !== commands) return
    owners.delete(owner)
    publish()
  }
}

/** Every registered command, ids prefixed with their owner ("inbox:reply"). Stable between changes. */
export function registeredAdminCommands(): readonly AdminCommand[] {
  return snapshot
}

export function subscribeAdminCommands(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const EMPTY: readonly AdminCommand[] = []
/** Server snapshot for useSyncExternalStore (nothing is registered while rendering on the server). */
export function serverAdminCommands(): readonly AdminCommand[] {
  return EMPTY
}
