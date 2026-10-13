import React, { useEffect, useState } from 'react'
import NextLink from 'next/link'
import { Box } from '@chakra-ui/react'
import { ADMIN_HINT_COOKIE } from '../../lib/adminHint'
import { getShortcutsEnabled, isImeComposing } from '../../lib/keyboardShortcuts'
import { useShortcutsEnabled } from '../Chrome/useShortcutsEnabled'

/**
 * Owner-only "Edit" pill in an article header, linking to the admin editor.
 *
 * Client-only: renders nothing until mounted, so the static HTML that every
 * visitor (and the CDN) receives never contains it. It appears only when
 * the non-secret admin hint cookie (lib/adminHint ADMIN_HINT_COOKIE, set by lib/auth on
 * admin session endpoints) is present AND GET /api/admin/session confirms a
 * valid session — the hint alone never shows it. Shortcut: E (ignored while
 * typing or composing, and off with the other single-key shortcuts —
 * lib/keyboardShortcuts).
 */

/**
 * Name of the hint cookie set alongside the httpOnly admin session
 * (lib/adminHint — dependency-free, so it is safe in the client bundle).
 */
const HINT_COOKIE = ADMIN_HINT_COOKIE

/** True when a `document.cookie` string carries the admin hint (`<ADMIN_HINT_COOKIE>=1`). */
export function hasAdminHint(cookie: string): boolean {
  return cookie.split(';').some((part) => part.trim() === `${HINT_COOKIE}=1`)
}

/** True while the user is typing somewhere (the shortcut must not fire). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}

export default function EditPill({ kind, slug }: { kind: 'blog' | 'work'; slug: string }) {
  const [admin, setAdmin] = useState(false)
  const shortcutsOn = useShortcutsEnabled()
  const href = `/admin/${kind}/edit?slug=${encodeURIComponent(slug)}`

  useEffect(() => {
    if (!hasAdminHint(document.cookie)) return
    const ctrl = new AbortController()
    fetch('/api/admin/session', { credentials: 'same-origin', cache: 'no-store', signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { authenticated?: unknown } | null) => setAdmin(data?.authenticated === true))
      .catch(() => undefined)
    return () => ctrl.abort()
  }, [])

  useEffect(() => {
    if (!admin) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'e' && e.key !== 'E') return
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented || isImeComposing(e) || isTypingTarget(e.target)) return
      if (!getShortcutsEnabled()) return
      e.preventDefault()
      window.location.assign(href)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [admin, href])

  if (!admin) return null

  return (
    <Box
      as={NextLink}
      href={href}
      aria-keyshortcuts={shortcutsOn ? 'E' : undefined}
      title={shortcutsOn ? 'Edit (E)' : 'Edit'}
      display="inline-flex"
      alignItems="center"
      gap={1.5}
      minH="32px"
      px={3}
      borderRadius="full"
      border="1px solid"
      borderColor="page.border-strong"
      bg="page.bg-elevated"
      color="page.fg"
      fontSize="13px"
      fontWeight={500}
      textDecoration="none"
      className="no-print"
      _hover={{ borderColor: 'accent.text', color: 'accent.text' }}
      _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
      transition="color 150ms var(--ease-out-quart), border-color 150ms var(--ease-out-quart)"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden focusable="false">
        <path d="M11.5 2.5l2 2L6 12l-2.75.75L4 10l7.5-7.5z" strokeLinejoin="round" />
      </svg>
      Edit
    </Box>
  )
}
