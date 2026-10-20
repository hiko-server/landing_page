import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { focusReturnTarget, initialSession, sessionAfterExit, sessionAfterToggle, type PaletteSession } from '../components/General-UI/paletteSession'

/**
 * followups-3: reopening ⌘K while the last palette is still leaving — after
 * it opened a page the route transition holds it hidden — focuses the new
 * dialog's search field, and focus returns where it should when that one
 * closes (components/General-UI/paletteSession.ts).
 */

type El = { name: string; connected?: boolean; body?: boolean }
const button: El = { name: 'header search button' }
const body: El = { name: 'body', body: true }
const usable = (el: El) => (el.body ? 'body' : el.connected === false ? 'gone' : 'yes') as 'yes' | 'gone' | 'body'

const open = (s: PaletteSession<El>, focused: El | null) => sessionAfterToggle(s, true, { focused, restores: true })
const close = (s: PaletteSession<El>, restores: boolean) => sessionAfterToggle(s, false, { focused: null, restores })

test('every opening gets a new dialog key; closing keeps it until the next opening', () => {
  let s = initialSession<El>(false)
  assert.equal(s.key, 0)
  s = open(s, button)
  assert.equal(s.key, 1)
  assert.equal(s.open, true)
  s = close(s, true)
  assert.equal(s.key, 1, 'the leaving dialog keeps its key (its exit runs)')
  assert.equal(s.leaving, true)
  s = sessionAfterExit(s)
  assert.equal(s.leaving, false)
  s = open(s, button)
  assert.equal(s.key, 2)
  assert.equal(s.interrupted, false)
  // Toggling to the same state is a no-op (the render that flips it runs once).
  assert.equal(sessionAfterToggle(s, true, { focused: body, restores: false }), s)
})

test('a palette mounted already open (the first ⌘K) remembers what had focus', () => {
  const s = initialSession<El>(true, button)
  assert.equal(s.key, 1)
  assert.equal(focusReturnTarget(close(s, true), { open: false, restores: true }, usable), button)
})

test('a fresh opening returns focus to what had focus when it opened (unchanged behaviour)', () => {
  let s = open(initialSession<El>(false), button)
  s = close(s, true)
  assert.equal(focusReturnTarget(s, { open: false, restores: true }, usable), button)
  // Opened with nothing focused: focus is left alone, as before.
  s = close(open(sessionAfterExit(s), body), true)
  assert.equal(focusReturnTarget(s, { open: false, restores: true }, usable), null)
})

test('a close that opens a page moves nothing: the new page takes focus (lib routeFocus)', () => {
  const s = close(open(initialSession<El>(false), button), false)
  assert.equal(focusReturnTarget(s, { open: false, restores: false }, usable), null)
})

test('the leaving dialog dropped by a reopen moves nothing — the new dialog takes focus', () => {
  const s = open(close(open(initialSession<El>(false), button), true), null)
  assert.equal(focusReturnTarget(s, { open: true, restores: true }, usable), null)
})

test('reopen after the palette opened a page (dialog still leaving): focus returns to the start of the new page', () => {
  let s = open(initialSession<El>(false), button)
  s = close(s, false) // Enter on a post: the page changes, the dialog fades out in the route transition
  assert.equal(s.leaving, true)
  s = open(s, body) // ⌘K again while it is still held: the old field had lost focus
  assert.equal(s.interrupted, true)
  assert.equal(s.key, 2)
  assert.equal(s.opener, 'page')
  // Escape on the reopened palette: the new page's content, not the body or the old header button.
  assert.equal(focusReturnTarget(close(s, true), { open: false, restores: true }, usable), 'page')
})

test('reopen while a closed (not navigating) palette is still fading out keeps its opener', () => {
  let s = open(initialSession<El>(false), button)
  s = close(s, true) // Escape: the click-opened dialog fades out…
  s = open(s, { name: 'the leaving dialog’s field' }) // …⌘K before it is gone
  assert.equal(s.interrupted, true)
  assert.equal(s.opener, button)
  assert.equal(focusReturnTarget(close(s, true), { open: false, restores: true }, usable), button)
  // Once the exit completed, the next opening is a fresh one again.
  s = sessionAfterExit(close(s, true))
  s = open(s, body)
  assert.equal(s.interrupted, false)
  assert.equal(s.opener, body)
})

test('an opener that left the page meanwhile: focus goes to the start of the content', () => {
  const gone: El = { name: 'a removed button', connected: false }
  const s = close(open(initialSession<El>(false), gone), true)
  assert.equal(focusReturnTarget(s, { open: false, restores: true }, usable), 'page')
})

test('CommandPalette keys its dialog by the session and owns the focus return', () => {
  const src = readFileSync(path.join(process.cwd(), 'components/General-UI/CommandPalette.tsx'), 'utf8')
  assert.match(src, /key=\{session\.key\}/)
  assert.match(src, /returnFocusOnClose=\{false\}/)
  assert.match(src, /finalFocusRef=\{returnFocusRef\}/)
  // The leaving dialog's chosen action still runs when a reopen drops it.
  assert.match(src, /if \(!session\.interrupted\) return/)
  // A palette opened while the next page loads is shown again when the route transition hides the overlays.
  assert.equal(src.match(/ref=\{layerRef\}\s+data-palette-session=\{session\.key\}/g)?.length, 2, 'scrim and panel')
  assert.match(src, /el\.dataset\.paletteSession === String\(s\.key\) && el\.style\.visibility === 'hidden'\) el\.style\.visibility = ''/)
})
