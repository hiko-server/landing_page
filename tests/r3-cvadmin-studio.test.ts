/**
 * CV Studio: duplicating hidden content keeps it hidden (VIS-5), and the
 * Studio's ⌘Z / ⌘⇧Z only claims key events from its own document (UX-8).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { duplicatesHidden, listOp, studioOwnsUndo, type Doc } from '../components/Admin/cvStudio/docOps'
import { publicSections } from '../lib/cvVisibility'

const work = (): Doc => ({
  en: [
    {
      sessionName: 'workExperience',
      experiences: [
        { companyName: 'SECRET-EMPLOYER', jobTitle: 'Lead', isVisible: false, hiddenFields: ['endDate'] },
        { companyName: 'Public Co', jobTitle: 'Dev', features: ['shipped', 'private note'], hiddenItems: { features: [1] } },
      ],
    },
  ],
  zh: [
    {
      sessionName: 'workExperience',
      experiences: [
        { companyName: '保密', jobTitle: '负责人', isVisible: false },
        { companyName: '公开', jobTitle: '开发' },
      ],
    },
  ],
})

test('duplicating a hidden entry keeps the copy hidden, with its field hides', () => {
  const r = listOp(work(), 'en', [0, 'experiences'], { type: 'duplicate', index: 0 }, false)
  const list = r.doc.en[0].experiences
  assert.equal(list.length, 3)
  assert.equal(list[1].companyName, 'SECRET-EMPLOYER')
  assert.equal(list[1].isVisible, false)
  assert.deepEqual(list[1].hiddenFields, ['endDate'])
  // Nothing hidden reaches the public view.
  const pub = publicSections(r.doc.en, 'website')[0] as any
  assert.deepEqual(pub.experiences.map((e: any) => e.companyName), ['Public Co'])
})

test('linked duplicate of a hidden entry stays hidden in both languages', () => {
  const r = listOp(work(), 'en', [0, 'experiences'], { type: 'duplicate', index: 0 }, true)
  assert.equal(r.reached, true)
  assert.equal(r.doc.zh[0].experiences[1].companyName, '保密')
  assert.equal(r.doc.zh[0].experiences[1].isVisible, false)
})

test('duplicating a visible entry stays visible', () => {
  const r = listOp(work(), 'en', [0, 'experiences'], { type: 'duplicate', index: 1 }, false)
  const copy = r.doc.en[0].experiences[2]
  assert.equal(copy.companyName, 'Public Co')
  assert.notEqual(copy.isVisible, false)
  assert.deepEqual(copy.hiddenItems, { features: [1] })
})

test('duplicating a hidden bullet keeps the copy hidden; other hidden bullets shift', () => {
  const r = listOp(work(), 'en', [0, 'experiences', 1, 'features'], { type: 'duplicate', index: 1 }, false)
  const entry = r.doc.en[0].experiences[1]
  assert.deepEqual(entry.features, ['shipped', 'private note', 'private note'])
  assert.deepEqual(entry.hiddenItems, { features: [1, 2] })

  const visible = listOp(work(), 'en', [0, 'experiences', 1, 'features'], { type: 'duplicate', index: 0 }, false)
  const e2 = visible.doc.en[0].experiences[1]
  assert.deepEqual(e2.features, ['shipped', 'shipped', 'private note'])
  assert.deepEqual(e2.hiddenItems, { features: [2] })
})

test('duplicatesHidden reports hidden entries and bullets only', () => {
  const d = work()
  assert.equal(duplicatesHidden(d, 'en', [0, 'experiences'], 0), true)
  assert.equal(duplicatesHidden(d, 'en', [0, 'experiences'], 1), false)
  assert.equal(duplicatesHidden(d, 'en', [0, 'experiences', 1, 'features'], 1), true)
  assert.equal(duplicatesHidden(d, 'en', [0, 'experiences', 1, 'features'], 0), false)
  assert.equal(duplicatesHidden(d, 'en', [0, 'experiences'], 9), false)
  assert.equal(duplicatesHidden(d, 'en', [0, 'missing'], 0), false)
})

// ── ⌘Z scope ────────────────────────────────────────────────────────────

type FakeEl = {
  nodeType: number
  parent: FakeEl | null
  parentElement: FakeEl | null
  attrs: Record<string, string>
  className: string
  contains(n: unknown): boolean
  closest(sel: string): FakeEl | null
}

/** Minimal element tree: `closest` understands the selectors studioOwnsUndo uses. */
function el(parent: FakeEl | null, attrs: Record<string, string> = {}, className = ''): FakeEl {
  const self: FakeEl = {
    nodeType: 1,
    parent,
    parentElement: parent,
    attrs,
    className,
    contains(n: unknown) {
      for (let cur = n as FakeEl | null; cur; cur = cur.parent) if (cur === self) return true
      return false
    },
    closest(sel: string) {
      const parts = sel.split(',').map((s) => s.trim())
      const matches = (x: FakeEl) =>
        parts.some((p) => {
          if (p.startsWith('.')) return x.className.split(/\s+/).includes(p.slice(1))
          const m = p.match(/^\[([\w-]+)="([^"]*)"\]$/)
          return !!m && x.attrs[m[1]] === m[2]
        })
      for (let cur: FakeEl | null = self; cur; cur = cur.parent) if (matches(cur)) return cur
      return null
    },
  }
  return self
}

function page({ modalOpen = false } = {}) {
  const html = el(null)
  const body = el(html)
  const root = el(body)
  const field = el(root)
  const textNode = { nodeType: 3, parent: field, parentElement: field }
  const inlinePopover = el(root, { role: 'dialog' })
  const popoverInput = el(inlinePopover)
  const portal = el(body, {}, 'chakra-portal')
  const paletteInput = el(el(portal, { role: 'dialog', 'aria-modal': 'true' }))
  const outsideInput = el(body)
  const doc = {
    body,
    documentElement: html,
    querySelector: (sel: string) => (modalOpen && sel === '[aria-modal="true"]' ? paletteInput : null),
  }
  return { root, field, textNode, popoverInput, paletteInput, outsideInput, body, html, doc }
}

const owns = (t: unknown, root: unknown, doc: unknown) =>
  studioOwnsUndo(t as EventTarget, root as Element, doc as Parameters<typeof studioOwnsUndo>[2])

test('Studio undo handles events from inside the Studio root', () => {
  const p = page()
  assert.equal(owns(p.field, p.root, p.doc), true)
  assert.equal(owns(p.root, p.root, p.doc), true)
  assert.equal(owns(p.textNode, p.root, p.doc), true)
})

test('palette, dialogs, drawers and outside fields keep native undo', () => {
  const p = page({ modalOpen: true })
  assert.equal(owns(p.paletteInput, p.root, p.doc), false)
  assert.equal(owns(p.outsideInput, p.root, p.doc), false)
  assert.equal(owns(p.popoverInput, p.root, p.doc), false, 'overlay rendered inside the Studio')
})

test('nothing focused: Studio undo only when no modal is open', () => {
  const idle = page()
  assert.equal(owns(idle.body, idle.root, idle.doc), true)
  const open = page({ modalOpen: true })
  assert.equal(owns(open.body, open.root, open.doc), false)
  assert.equal(owns(open.html, open.root, open.doc), false)
})

test('no root or no target never claims the shortcut', () => {
  const p = page()
  assert.equal(owns(p.field, null, p.doc), false)
  assert.equal(owns(null, p.root, p.doc), false)
  assert.equal(owns({}, p.root, p.doc), false)
})
