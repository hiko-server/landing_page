/**
 * End-to-end leak test for CV visibility.
 *
 * A fixture CV is generated from the section registry (all 9 sections, every
 * field, nested list and bullet, in EN and ZH). For every text slot a unique
 * sentinel is planted and then hidden in turn by every mechanism that covers
 * it — field hide, bullet hide, entry hide, whole-list hide, and the section
 * CV / website switches. The public view for every audience, plus the derived
 * "currently coding" chip (from the pruned view and from the full document),
 * must never contain the sentinel; hidden field / list names must show up in
 * `redacted` so renderers can tell "hidden" from "empty".
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CV_SECTIONS, type ListDef, type FieldKind } from '../lib/cvSections'
import { getAt, isRedacted, publicCvDoc, setAt, type CvAudience, type CvDoc, type CvPath } from '../lib/cvVisibility'
import { deriveCurrentlyCoding } from '../lib/currentlyCoding'

const AUDIENCES: CvAudience[] = ['cv', 'website', 'any']
const TEXT_SENTINEL = 'ZZ-LEAK-SENTINEL-ZZ'
// Date-like slots get a parseable date so a leak through the derived
// "since YYYY" note would be caught too. No filler uses this year.
const DATE_SENTINEL = '1907-07'
const DATE_NEEDLE = '1907'

function fill(kind: FieldKind): unknown {
  if (kind === 'bullets' || kind === 'tags') return ['first filler item', 'second filler item']
  if (kind === 'month' || kind === 'endMonth') return '2020-01'
  if (kind === 'color') return '#123456'
  return 'filler text'
}

function buildEntry(list: ListDef): Record<string, any> {
  const entry: Record<string, any> = {}
  for (const f of list.fields) entry[f.key] = fill(f.kind)
  for (const nested of list.lists || []) entry[nested.key] = [buildEntry(nested), buildEntry(nested)]
  return entry
}

function buildDoc(): CvDoc {
  const lang = (l: 'en' | 'zh') =>
    CV_SECTIONS.map((def) => {
      const section: Record<string, any> = { sessionName: def.sessionName, headerName: def.headerDefault[l] }
      for (const f of def.fields || []) section[f.key] = fill(f.kind)
      for (const list of def.lists || []) section[list.key] = [buildEntry(list), buildEntry(list)]
      return section as { sessionName: string }
    })
  return { en: lang('en'), zh: lang('zh') }
}

type Slot = {
  path: CvPath
  ownerPath: CvPath
  field: string
  index?: number
  entryPaths: CvPath[]
  lists: Array<{ ownerPath: CvPath; key: string }>
}

function collectSlots(node: Record<string, any>, path: CvPath, entryPaths: CvPath[], lists: Slot['lists'], out: Slot[]) {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'sessionName') continue
    if (typeof value === 'string') {
      out.push({ path: [...path, key], ownerPath: path, field: key, entryPaths, lists })
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'string') {
          out.push({ path: [...path, key, i], ownerPath: path, field: key, index: i, entryPaths, lists })
        } else if (item && typeof item === 'object') {
          const p = [...path, key, i]
          collectSlots(item, p, [...entryPaths, p], [...lists, { ownerPath: path, key }], out)
        }
      })
    }
  }
}

type Mechanism = {
  label: string
  apply: (sections: any[]) => any[]
  hiddenFrom: CvAudience[]
  redacted?: { ownerPath: CvPath; name: string }
}

const merge = (sections: any[], path: CvPath, patch: Record<string, any>) => setAt(sections, path, { ...getAt(sections, path), ...patch })

function mechanismsFor(slot: Slot): Mechanism[] {
  const all: CvAudience[] = ['cv', 'website', 'any']
  const out: Mechanism[] = [
    {
      label: `field ${slot.field}`,
      apply: (s) => merge(s, slot.ownerPath, { hiddenFields: [slot.field] }),
      hiddenFrom: all,
      redacted: { ownerPath: slot.ownerPath, name: slot.field },
    },
  ]
  if (slot.index !== undefined) {
    out.push({
      label: `bullet ${slot.field}[${slot.index}]`,
      apply: (s) => merge(s, slot.ownerPath, { hiddenItems: { [slot.field]: [slot.index] } }),
      hiddenFrom: all,
    })
  }
  for (const entry of slot.entryPaths) {
    out.push({ label: `entry ${entry.join('.')}`, apply: (s) => merge(s, entry, { isVisible: false }), hiddenFrom: all })
  }
  for (const list of slot.lists) {
    out.push({
      label: `list ${list.key}`,
      apply: (s) => merge(s, list.ownerPath, { hiddenFields: [list.key] }),
      hiddenFrom: all,
      redacted: { ownerPath: list.ownerPath, name: list.key },
    })
  }
  const sectionPath: CvPath = [slot.path[0]]
  out.push(
    { label: 'section off CV', apply: (s) => merge(s, sectionPath, { isVisible: false }), hiddenFrom: ['cv'] },
    { label: 'section off website', apply: (s) => merge(s, sectionPath, { showOnWebsite: false }), hiddenFrom: ['website'] },
    { label: 'section off everywhere', apply: (s) => merge(s, sectionPath, { isVisible: false, showOnWebsite: false }), hiddenFrom: all },
  )
  return out
}

/** Resolve a full-document path in a pruned language (sections matched by name; no entries are removed in redaction cases). */
function resolvePruned(full: any[], pruned: any[], path: CvPath): any {
  const name = full[path[0] as number].sessionName
  const section = pruned.find((s) => s.sessionName === name)
  return section ? getAt(section, path.slice(1)) : undefined
}

const slots: Slot[] = []
buildDoc().en.forEach((section, i) => collectSlots(section, [i], [], [], slots))

test('fixture covers all 9 sections, nested lists and bullets', () => {
  assert.equal(CV_SECTIONS.length, 9)
  const sections = new Set(slots.map((s) => s.path[0]))
  assert.equal(sections.size, 9)
  assert.ok(slots.some((s) => s.index !== undefined && s.entryPaths.length === 2), 'bullet inside a nested list (features[].furtherExplanation)')
  assert.ok(slots.some((s) => s.lists.length === 2), 'nested object list (certifications[].CertificationList)')
})

test('a hidden sentinel never reaches any public view or the derived chip, and hidden names are listed in `redacted`', () => {
  let cases = 0
  for (const slot of slots) {
    const isDate = /date/i.test(slot.field)
    const sentinel = isDate ? DATE_SENTINEL : TEXT_SENTINEL
    const needle = isDate ? DATE_NEEDLE : TEXT_SENTINEL
    const base = buildDoc()
    const planted: CvDoc = { en: setAt(base.en, slot.path, sentinel), zh: setAt(base.zh, slot.path, sentinel) }

    // Control: unhidden, the sentinel is public — so the slot is real.
    assert.ok(JSON.stringify(publicCvDoc(planted, 'any')).includes(needle), `control ${slot.path.join('.')}`)

    for (const mech of mechanismsFor(slot)) {
      cases++
      const where = `${slot.path.join('.')} hidden by ${mech.label}`
      const doc: CvDoc = { en: mech.apply(planted.en), zh: mech.apply(planted.zh) }
      for (const audience of AUDIENCES) {
        const pub = publicCvDoc(doc, audience)
        const text = JSON.stringify(pub)
        if (mech.hiddenFrom.includes(audience)) {
          assert.ok(!text.includes(needle), `${where}: leaked to '${audience}'`)
          assert.ok(!JSON.stringify(deriveCurrentlyCoding(pub.en)).includes(needle), `${where}: leaked via derived chip ('${audience}')`)
        }
        assert.ok(!text.includes('"hiddenFields"') && !text.includes('"hiddenItems"'), `${where}: metadata leaked`)
        if (mech.redacted) {
          for (const lang of ['en', 'zh'] as const) {
            const owner = resolvePruned(doc[lang], pub[lang], mech.redacted.ownerPath)
            assert.ok(owner, `${where}: owner present in '${audience}' ${lang}`)
            assert.ok(Array.isArray(owner.redacted) && owner.redacted.includes(mech.redacted.name), `${where}: redacted name missing`)
            assert.equal(isRedacted(owner, mech.redacted.name), true)
          }
        }
      }
      if (mech.hiddenFrom.includes('website')) {
        assert.ok(!JSON.stringify(deriveCurrentlyCoding(doc.en)).includes(needle), `${where}: leaked via chip derived from the full document`)
      }
    }
  }
  assert.ok(cases > 500, `exercised ${cases} hide cases`)
})

test('the derived chip does pick up visible values (so the leak checks above are meaningful)', () => {
  const doc = buildDoc()
  const work = doc.en.findIndex((s) => s.sessionName === 'workExperience')
  let en = setAt(doc.en, [work, 'experiences', 0, 'companyName'], TEXT_SENTINEL)
  en = setAt(en, [work, 'experiences', 0, 'endDate'], '')
  en = setAt(en, [work, 'experiences', 0, 'startDate'], DATE_SENTINEL)
  const chip = deriveCurrentlyCoding(publicCvDoc({ en, zh: [] }, 'website').en)
  assert.equal(chip.project, TEXT_SENTINEL)
  assert.equal(chip.note, `since ${DATE_NEEDLE}`)
})
