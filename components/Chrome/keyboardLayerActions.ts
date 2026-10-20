import Router from 'next/router'
import type { LayerKey } from '../../lib/keyboardLayer'
import { CHORD_HINT_DELAY_MS, LIST_ITEM_ATTR, anchorIndex, armChord, chordArmed, primaryLinkIndex, stepIndex, type Chord } from '../../lib/keyboardNavigation'
import { NAV_SHORTCUTS, PRIMARY_LINKS, shortcutTarget } from './chrome'
import { MAIN_ID } from './routeFocus'

/**
 * What the keyboard layer's keys do (loaded on demand by KeyboardLayer.tsx;
 * the keys are listed in lib/keyboardLayer.ts). Module state is the pending
 * "G then …" chord and its hint.
 */

let chord: Chord | null = null
let hintTimer: ReturnType<typeof setTimeout> | null = null
let expireTimer: ReturnType<typeof setTimeout> | null = null
let hint: HTMLElement | null = null
let routeListener = false

// ── "G then …" hint ─────────────────────────────────────────────────────────

/** The hint: "Go to" and every second key with its page (aria-hidden: the palette's shortcut page is the accessible list). */
function hintElement(): HTMLElement {
  if (hint?.isConnected) return hint
  const el = document.createElement('div')
  el.className = 'kbd-hint no-print'
  el.setAttribute('aria-hidden', 'true')
  el.setAttribute('lang', 'en')
  const title = document.createElement('span')
  title.className = 'kbd-hint__title'
  title.textContent = 'Go to'
  el.appendChild(title)
  for (const { key, url } of NAV_SHORTCUTS) {
    const row = document.createElement('span')
    const kbd = document.createElement('kbd')
    kbd.textContent = key.toUpperCase()
    row.appendChild(kbd)
    row.appendChild(document.createTextNode(PRIMARY_LINKS.find((l) => l.url === url)?.name || url))
    el.appendChild(row)
  }
  document.body.appendChild(el)
  hint = el
  return el
}

function hideHint(): void {
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = null
  hint?.removeAttribute('data-open')
}

function disarm(): void {
  chord = null
  if (expireTimer) clearTimeout(expireTimer)
  expireTimer = null
  hideHint()
}

function arm(at: number): void {
  disarm()
  chord = armChord(at)
  const left = chord.armedUntil - Date.now()
  if (left <= 0) {
    chord = null
    return
  }
  expireTimer = setTimeout(disarm, left)
  // Shown only when G is held a moment: a fluent "G H" never flashes it.
  hintTimer = setTimeout(() => {
    hintTimer = null
    const el = hintElement()
    // One frame at rest first, so the entrance transition runs.
    requestAnimationFrame(() => {
      if (chord) el.setAttribute('data-open', '')
    })
  }, Math.max(0, CHORD_HINT_DELAY_MS - (Date.now() - at)))
  if (!routeListener) {
    routeListener = true
    Router.events.on('routeChangeStart', disarm)
  }
}

function go(url: string): void {
  if (Router.asPath.split(/[?#]/)[0] !== url) void Router.push(url)
}

// ── J / K ───────────────────────────────────────────────────────────────────

function visible(el: Element): boolean {
  return el.getClientRects().length > 0
}

/** The bottom edge of the sticky header (0 when it is tucked away or absent). */
function headerBottom(): number {
  const header = document.querySelector('.site-header-sticky')
  if (!header) return 0
  return Math.max(0, header.getBoundingClientRect().bottom)
}

function pathOf(a: HTMLAnchorElement): string {
  try {
    return decodeURIComponent(new URL(a.href, window.location.href).pathname)
  } catch {
    return a.getAttribute('href') || ''
  }
}

function focusItem(item: HTMLElement): void {
  const links = Array.from(item.querySelectorAll<HTMLAnchorElement>('a[href]')).filter(visible)
  const own = item.getAttribute('data-vt-morph')
  let ownPath: string | null = null
  if (own) {
    try {
      ownPath = decodeURIComponent(own)
    } catch {
      ownPath = own
    }
  }
  const index = primaryLinkIndex(links.map(pathOf), ownPath)
  const target: HTMLElement = index >= 0 ? links[index] : item
  if (index < 0 && !item.hasAttribute('tabindex')) item.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // scroll-margin-top (globals.css) keeps the item clear of the sticky header.
  item.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
}

function moveInList(step: 1 | -1): void {
  const main = document.getElementById(MAIN_ID)
  if (!main) return
  const items = Array.from(main.querySelectorAll<HTMLElement>(`[${LIST_ITEM_ATTR}]`)).filter(visible)
  if (!items.length) return
  const active = document.activeElement
  const current = active ? items.findIndex((it) => it === active || it.contains(active)) : -1
  const anchor = current >= 0 ? current : anchorIndex(items.map((it) => it.getBoundingClientRect()), headerBottom())
  const next = stepIndex(current, anchor, items.length, step)
  if (next >= 0 && next !== current) focusItem(items[next])
}

// ── [ / ] and T ─────────────────────────────────────────────────────────────

function followPager(rel: 'prev' | 'next'): void {
  // ArticleNav's pager links (they also set the transition's direction).
  document.getElementById(MAIN_ID)?.querySelector<HTMLAnchorElement>(`a[rel="${rel}"][href]`)?.click()
}

function toggleTheme(): void {
  // The header's toggle: the new theme is revealed from it, exactly as on a click.
  document.querySelector<HTMLButtonElement>('[data-theme-toggle]')?.click()
}

/**
 * Runs a key KeyboardLayer classified as `key` (`char`: the key as typed) at
 * time `at`; "/" and "?" opened the palette already and only end a chord.
 */
export function handleLayerKey(key: LayerKey, char: string, at: number): void {
  const armed = chordArmed(chord, at)
  disarm()
  if (armed) {
    const url = shortcutTarget(char)
    if (url) {
      go(url)
      return
    }
  }
  switch (key) {
    case 'g':
      arm(at)
      return
    case 'j':
      moveInList(1)
      return
    case 'k':
      moveInList(-1)
      return
    case '[':
      followPager('prev')
      return
    case ']':
      followPager('next')
      return
    case 't':
      toggleTheme()
      return
    default:
      return
  }
}
