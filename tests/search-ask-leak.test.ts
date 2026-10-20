/**
 * search-ask (F4 / J1): the visibility leak test, extended to the search
 * documents and the "Ask" passage index.
 *
 * Like tests/s1-leak.test.ts and tests/cv-docs-leak.test.ts, a fixture CV is
 * generated from the section registry (every section, field, nested list and
 * bullet, EN and 中文). A unique sentinel is planted in each slot and hidden
 * in turn by every mechanism that covers it (field, bullet, entry, list, the
 * section's CV switch). Then neither the CV search documents
 * (cvSearchDocs, both languages) nor the passages (cvPassages → finish, the
 * JSON the browser receives) may contain it. Recommendations need the
 * person's consent; contact details are never indexed, hidden or not.
 *
 * tests/search-ask-store-leak.test.ts runs the whole builder against a
 * throw-away content store (drafts, the hidden introduction, …).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CV_SECTIONS, type FieldKind, type ListDef } from '../lib/cvSections'
import { getAt, publicCvDoc, setAt, type CvAudience, type CvDoc, type CvPath } from '../lib/cvVisibility'
import { cvAlignment, cvSearchDocs } from '../lib/searchIndex'
import { cvPassages, finish } from '../lib/askIndex'

const TEXT = 'ZZ-LEAK-SENTINEL-ZZ'
const URL_SENTINEL = 'https://zz-leak-sentinel.example/zz'
const URL_NEEDLE = 'zz-leak-sentinel'
const DATE = '1907-07'
const DATE_NEEDLES = ['1907']

function fill(kind: FieldKind): unknown {
  if (kind === 'bullets' || kind === 'tags') return ['first filler item', 'second filler item']
  if (kind === 'endMonth') return 'Present'
  if (kind === 'month') return '2020-01'
  if (kind === 'color') return '#123456'
  // Consent flags on (recommendations), so permitted entries are public and testable.
  if (kind === 'switch') return true
  if (kind === 'url') return 'https://filler.example.org'
  if (kind === 'image') return '/uploads/filler-photo.webp'
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

type Slot = { path: CvPath; ownerPath: CvPath; field: string; kind: FieldKind | 'bullet' | 'text'; index?: number; entryPaths: CvPath[]; lists: Array<{ ownerPath: CvPath; key: string }> }

function kindOf(sessionName: string, field: string): FieldKind | undefined {
  const def = CV_SECTIONS.find((s) => s.sessionName === sessionName)
  const all: Array<{ key: string; kind: FieldKind }> = [...(def?.fields || [])]
  const walk = (lists: ListDef[] | undefined) => {
    for (const l of lists || []) {
      all.push(...l.fields)
      walk(l.lists)
    }
  }
  walk(def?.lists)
  return all.find((f) => f.key === field)?.kind
}

function collect(node: Record<string, any>, at: CvPath, entryPaths: CvPath[], lists: Slot['lists'], out: Slot[], sessionName: string) {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'sessionName') continue
    if (typeof value === 'string') {
      const kind = kindOf(sessionName, key) ?? 'text'
      if (kind === 'color' || kind === 'switch') continue
      out.push({ path: [...at, key], ownerPath: at, field: key, kind, entryPaths, lists })
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'string') out.push({ path: [...at, key, i], ownerPath: at, field: key, kind: 'bullet', index: i, entryPaths, lists })
        else if (item && typeof item === 'object') {
          const p = [...at, key, i]
          collect(item, p, [...entryPaths, p], [...lists, { ownerPath: at, key }], out, sessionName)
        }
      })
    }
  }
}

type Mechanism = { label: string; apply: (s: any[]) => any[] }
const merge = (sections: any[], at: CvPath, patch: Record<string, any>) => setAt(sections, at, { ...getAt(sections, at), ...patch })

/** Every mechanism that hides the slot from the CV audience (the one /cv, /cv/zh and the index use). */
function mechanisms(slot: Slot): Mechanism[] {
  const out: Mechanism[] = [{ label: `field ${slot.field}`, apply: (s) => merge(s, slot.ownerPath, { hiddenFields: [slot.field] }) }]
  if (slot.index !== undefined) out.push({ label: `bullet ${slot.field}[${slot.index}]`, apply: (s) => merge(s, slot.ownerPath, { hiddenItems: { [slot.field]: [slot.index] } }) })
  for (const e of slot.entryPaths) out.push({ label: `entry ${e.join('.')}`, apply: (s) => merge(s, e, { isVisible: false }) })
  for (const l of slot.lists) out.push({ label: `list ${l.key}`, apply: (s) => merge(s, l.ownerPath, { hiddenFields: [l.key] }) })
  out.push({ label: 'section off CV', apply: (s) => merge(s, [slot.path[0]], { isVisible: false }) })
  return out
}

function sentinelFor(slot: Slot): { value: string; needles: string[] } {
  if (/date/i.test(slot.field)) return { value: DATE, needles: DATE_NEEDLES }
  if (slot.kind === 'url') return { value: URL_SENTINEL, needles: [URL_NEEDLE] }
  return { value: TEXT, needles: [TEXT] }
}

/** The search docs and the packed passages of the CV-audience view, as the browser receives them. */
function outputs(doc: CvDoc): string {
  const pub = publicCvDoc(doc, 'cv' as CvAudience)
  const aligned = cvAlignment(pub.en, pub.zh)
  return JSON.stringify([cvSearchDocs(pub.en, 'en', aligned), cvSearchDocs(pub.zh, 'zh', aligned), finish([...cvPassages(pub.en, 'en', aligned), ...cvPassages(pub.zh, 'zh', aligned)])])
}

const slots: Slot[] = []
buildDoc().en.forEach((section, i) => collect(section as any, [i], [], [], slots, (section as any).sessionName))

test('the fixture reaches the CV fields the index and the passages read', () => {
  const fields = new Set(slots.map((s) => s.field))
  for (const f of ['jobTitle', 'jobDescription', 'furtherExplanation', 'patents', 'introduction', 'quote', 'relatedSkills', 'certificationName', 'points']) assert.ok(fields.has(f), f)
})

test('no hidden CV value reaches the search documents or the "Ask" passages (EN and ZH)', () => {
  let cases = 0
  let controls = 0
  for (const slot of slots) {
    const { value, needles } = sentinelFor(slot)
    const base = buildDoc()
    const planted: CvDoc = { en: setAt(base.en, slot.path, value), zh: setAt(base.zh, slot.path, value) }
    const has = (text: string) => needles.some((n) => text.includes(n))
    if (has(outputs(planted))) controls++
    for (const mech of mechanisms(slot)) {
      cases++
      const hidden: CvDoc = { en: mech.apply(planted.en), zh: mech.apply(planted.zh) }
      assert.ok(!has(outputs(hidden)), `${slot.path.join('.')} hidden by ${mech.label}: leaked into the search index or the passages`)
    }
  }
  // Visible sentinels do reach the outputs in most slots, so the checks are meaningful
  // (contact details, links and colours are never indexed, visible or not).
  assert.ok(controls > slots.length * 0.5, `visible sentinels reach an output in ${controls}/${slots.length} slots`)
  assert.ok(cases > 300, `exercised ${cases} hide cases`)
})

test('contact details are never indexed or quoted, even when visible', () => {
  const doc = buildDoc()
  const at = doc.en.findIndex((s) => s.sessionName === 'personalInformation')
  const withContacts = (sections: any[]) => merge(sections, [at], { email: 'person@example.com', phoneNumber: '+852 5555 0100', address: 'ZZ Contact Street 1' })
  const out = outputs({ en: withContacts(doc.en), zh: withContacts(doc.zh) })
  for (const needle of ['person@example.com', '5555 0100', 'ZZ Contact Street']) assert.ok(!out.includes(needle), needle)
})

test('a recommendation without the person\'s consent is never quoted; with consent it is', () => {
  const doc = buildDoc()
  const at = doc.en.findIndex((s) => s.sessionName === 'recommendations')
  const quote = 'ZZ-CONSENT-QUOTE-ZZ wrote this about the work.'
  const withQuote = (permission: unknown) => (sections: any[]) => merge(merge(sections, [at, 'items', 0], { quote, permission }), [at], {})
  for (const permission of [false, undefined, 'yes', 1]) {
    const out = outputs({ en: withQuote(permission)(doc.en), zh: withQuote(permission)(doc.zh) })
    assert.ok(!out.includes('ZZ-CONSENT-QUOTE-ZZ'), `permission ${String(permission)}`)
  }
  assert.ok(outputs({ en: withQuote(true)(doc.en), zh: withQuote(true)(doc.zh) }).includes('ZZ-CONSENT-QUOTE-ZZ'), 'control: a permitted quote is quoted')
})
