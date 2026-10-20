/**
 * admin-ops — keyboard-first admin (H14): the admin's "G then <key>" map,
 * the command registry the ⌘K palette reads, the list key model (j / k,
 * Enter, x, action keys) and the searchable shortcut sheet.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

test('H14 chords: admin letters never take a public one; every destination exists', async () => {
  const { ADMIN_CHORDS, chordTarget, adminShortcutFor } = await import('../components/Admin/shell/adminCommands')
  const { NAV_SHORTCUTS } = await import('../components/Chrome/chrome')
  const { DASHBOARD_TABS } = await import('../components/Admin/shell/dashboardTabs')
  const publicKeys = new Set(NAV_SHORTCUTS.map((n) => n.key))
  const keys = ADMIN_CHORDS.map((c) => c.key)
  assert.equal(new Set(keys).size, keys.length, 'one destination per letter')
  for (const c of ADMIN_CHORDS) {
    assert.ok(!publicKeys.has(c.key), `G ${c.key} is a public shortcut`)
    assert.match(c.key, /^[a-z]$/)
    assert.equal(chordTarget(c.key.toUpperCase()), c.href, 'case-insensitive')
    assert.equal(adminShortcutFor(c.href), `G ${c.key.toUpperCase()}`)
    const url = new URL(c.href, 'https://site.example')
    const page = url.pathname === '/admin' ? 'pages/admin/index.tsx' : `pages${url.pathname}.tsx`
    const alt = `pages${url.pathname}/index.tsx`
    assert.ok(fs.existsSync(path.join(root, page)) || fs.existsSync(path.join(root, alt)), `${c.href} has a page`)
    const tab = url.searchParams.get('tab')
    if (tab) assert.ok((DASHBOARD_TABS as readonly string[]).includes(tab), `${tab} is a dashboard tab`)
    const view = url.searchParams.get('view')
    if (view) assert.match(fs.readFileSync(path.join(root, 'pages/admin/system.tsx'), 'utf8'), new RegExp(`'${view}'`), `${view} is a System view`)
  }
  // The public letters still go to the public pages from the admin.
  assert.equal(chordTarget('h'), '/')
  assert.equal(chordTarget('c'), '/cv')
  assert.equal(chordTarget('z'), null)
})

test('H14 chords: "already there" ignores the hash and the order of query parameters', async () => {
  const { isCurrentHref } = await import('../components/Admin/shell/adminCommands')
  assert.equal(isCurrentHref('/admin/dashboard?tab=inbox', '/admin/dashboard?tab=inbox#x'), true)
  assert.equal(isCurrentHref('/admin/system?view=activity', '/admin/system?x=1&view=activity'), false)
  assert.equal(isCurrentHref('/admin/system?a=1&b=2', '/admin/system?b=2&a=1'), true)
  assert.equal(isCurrentHref('/admin', '/admin/'), true)
  assert.equal(isCurrentHref('/admin/system', '/admin/system?view=errors'), false)
})

test('H14 registry: views add their commands while mounted; ids carry the owner; the snapshot is stable', async () => {
  const { registerAdminCommands, registeredAdminCommands, subscribeAdminCommands } = await import('../components/Admin/shell/adminCommands')
  let calls = 0
  const off = subscribeAdminCommands(() => calls++)
  const before = registeredAdminCommands()
  assert.equal(registeredAdminCommands(), before, 'same array until something changes')
  const ran: string[] = []
  const unInbox = registerAdminCommands('inbox', [{ id: 'reply', label: 'Reply', run: () => void ran.push('reply') }])
  const unSys = registerAdminCommands('system', [{ id: 'drill', label: 'Run a restore drill', href: '/admin/system' }])
  assert.deepEqual(
    registeredAdminCommands().map((c) => c.id),
    ['inbox:reply', 'system:drill'],
  )
  void registeredAdminCommands()[0].run?.()
  assert.deepEqual(ran, ['reply'])
  // Re-registering the same owner replaces its list; the old unregister no longer removes it.
  const unInbox2 = registerAdminCommands('inbox', [{ id: 'archive', label: 'Archive' }])
  unInbox()
  assert.deepEqual(
    registeredAdminCommands().map((c) => c.id),
    ['inbox:archive', 'system:drill'],
  )
  unInbox2()
  unSys()
  assert.deepEqual(registeredAdminCommands(), [])
  assert.ok(calls >= 4)
  off()
})

test('H14 list keys: j / k / arrows move, Enter / o open, x selects, action keys act — never in text fields or with modifiers', async () => {
  const { listKeyAction } = await import('../components/Admin/shell/listKeys')
  const ctx = { count: 3, active: 1, singleKeys: true, inEditable: false, actions: ['s', 'e', '#', 'Delete'], selectable: true }
  const k = (key: string, extra: Record<string, unknown> = {}, over: Partial<typeof ctx> = {}) => listKeyAction({ key, ...extra }, { ...ctx, ...over })
  assert.deepEqual(k('j'), { type: 'move', to: 2 })
  assert.deepEqual(k('J'), { type: 'move', to: 2 })
  assert.deepEqual(k('k'), { type: 'move', to: 0 })
  assert.deepEqual(k('ArrowDown', {}, { active: 2 }), { type: 'move', to: 2 }, 'clamped at the end')
  assert.deepEqual(k('j', {}, { active: -1 }), { type: 'move', to: 0 }, 'from nowhere: the first item')
  assert.deepEqual(k('Home'), { type: 'move', to: 0 })
  assert.deepEqual(k('End'), { type: 'move', to: 2 })
  assert.deepEqual(k('Enter'), { type: 'open', index: 1 })
  assert.deepEqual(k('o'), { type: 'open', index: 1 })
  assert.deepEqual(k('x'), { type: 'select', index: 1 })
  assert.equal(k('x', {}, { selectable: false }), null)
  assert.deepEqual(k('s'), { type: 'action', key: 's', index: 1 })
  assert.deepEqual(k('#', { shiftKey: true }), { type: 'action', key: '#', index: 1 })
  assert.deepEqual(k('Delete', {}, { singleKeys: false }), { type: 'action', key: 'Delete', index: 1 }, 'Delete is not a character key')
  assert.equal(k('j', {}, { singleKeys: false }), null, 'the shortcut switch turns letters off')
  assert.deepEqual(k('ArrowDown', {}, { singleKeys: false }), { type: 'move', to: 2 }, 'arrows always work')
  assert.equal(k('j', {}, { inEditable: true }), null)
  assert.equal(k('j', { metaKey: true }), null)
  assert.equal(k('j', { isComposing: true }), null)
  assert.equal(k('j', { keyCode: 229 }), null)
  assert.equal(k('q'), null)
  assert.equal(k('j', {}, { count: 0 }), null)
})

test('H14 shortcut sheet: lists every chord and the Inbox keys; search filters by label, keys and group', async () => {
  const { adminShortcutGroups, filterShortcutGroups } = await import('../components/Admin/shell/shortcuts')
  const { ADMIN_CHORDS } = await import('../components/Admin/shell/adminCommands')
  for (const isMac of [true, false]) {
    const groups = adminShortcutGroups(isMac, 6)
    const flat = groups.flatMap((g) => g.items.map((i) => `${i.keys.join('+')} ${i.label}`))
    for (const c of ADMIN_CHORDS) assert.ok(flat.includes(`G+${c.key.toUpperCase()} ${c.label}`), c.label)
    assert.ok(flat.includes('G+B Writing') && flat.includes('G+H Home page'), 'the public G keys are listed one by one')
    for (const key of ['R Reply', 'S Star / unstar', 'E Archive (or move back to the inbox)', '# Delete (with Undo)']) assert.ok(flat.includes(key), key)
    assert.ok(flat.includes(`${isMac ? '⌘' : 'Ctrl'}+K Command menu: go anywhere, run an action`))
    const archive = filterShortcutGroups(groups, 'archive').flatMap((g) => g.items.map((i) => i.label))
    assert.deepEqual(archive, ['Archive (or move back to the inbox)', 'Undo the last delete or archive'])
    assert.deepEqual(
      filterShortcutGroups(groups, 'inbox reply').flatMap((g) => g.items.map((i) => i.keys.join('+'))),
      ['R', isMac ? '⌘+↵' : 'Ctrl+Enter'],
      'every word must match (group title counts)',
    )
    assert.deepEqual(
      filterShortcutGroups(groups, 'go to').map((g) => g.title),
      ['Go to (G, then a letter)', 'Go to the site (G, then a letter)'],
    )
    assert.deepEqual(filterShortcutGroups(groups, 'nothing-like-this'), [])
    assert.equal(filterShortcutGroups(groups, '  '), groups)
  }
})

test('H14 wiring: the palette lists admin destinations and view commands; the overlay runs the chords', () => {
  const palette = fs.readFileSync(path.join(root, 'components/General-UI/CommandPalette.tsx'), 'utf8')
  assert.match(palette, /useRegisteredAdminCommands\(\)/)
  assert.match(palette, /ADMIN_CHORDS\.filter/)
  assert.match(palette, /shortcut: adminShortcutFor\(href\)/)
  const overlay = fs.readFileSync(path.join(root, 'components/Admin/shell/ShortcutsOverlay.tsx'), 'utf8')
  assert.match(overlay, /useAdminChords\(\)/)
  const inbox = fs.readFileSync(path.join(root, 'components/Admin/InboxPanel.tsx'), 'utf8')
  assert.match(inbox, /useAdminCommands\(\s*'inbox'/)
  for (const list of ['components/Admin/shell/CollectionIndex.tsx', 'components/Admin/system/ActivityPanel.tsx', 'components/Admin/InboxPanel.tsx']) {
    assert.match(fs.readFileSync(path.join(root, list), 'utf8'), /useListKeyboard\(/, list)
  }
  // The chord listener and the palette module stay out of the shared bundle: only admin code and the lazy palette import them.
  const app = fs.readFileSync(path.join(root, 'pages/_app.tsx'), 'utf8')
  const header = fs.readFileSync(path.join(root, 'components/Header/Header.tsx'), 'utf8')
  for (const src of [app, header]) assert.doesNotMatch(src, /adminCommands|useAdminCommands/)
})
