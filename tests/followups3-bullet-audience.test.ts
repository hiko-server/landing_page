/**
 * followups-3 (E4): an audience per bullet — `itemsOnlyIn` on the node that
 * holds a string list (bullets, tags, authors), keyed by position like
 * `hiddenItems`. The model (lib/cvVisibility), the validator, the EN / 中文
 * sync, the Studio's document operations (positions follow their bullets),
 * the Hidden items panel's "limited" rows and the wiring. The leak test over
 * every output per surface covers bullets too (tests/cv-variants-leak.test.ts).
 * Synthetic data only.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  CV_SURFACES,
  HIDDEN_ITEM_MARK,
  ITEMS_ONLY_IN_KEY,
  VISIBILITY_KEYS,
  countAudienceLimits,
  itemsOffSurface,
  publicCvDoc,
  publicSections,
} from '../lib/cvVisibility'
import { itemAudience, remapItemAudiences, withItemAudience } from '../lib/cvItemAudience'
import { errorFocusPath, validateCvDoc } from '../lib/cvValidate'
import { syncLanguage } from '../lib/cvSync'
import { listOp, setItemAudience, type Doc } from '../components/Admin/cvStudio/docOps'
import { collectHidden } from '../components/Admin/cvStudio/hiddenIndex'

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')

/** A highlight of a role (the registry's features list) with its sub-point bullets. */
const highlight = (over: Record<string, unknown> = {}) => ({
  description: 'Built the example pipeline',
  furtherExplanation: ['Public bullet', 'Download-only bullet', 'Third bullet'],
  ...over,
})
const role = (over: Record<string, unknown> = {}) => ({
  uid: 'r1',
  jobTitle: 'Example Engineer',
  companyName: 'Example Co',
  startDate: '2024-01',
  endDate: '2025-01',
  features: [highlight(over)],
})

const work = (over: Record<string, unknown> = {}) => ({ sessionName: 'workExperience', headerName: 'WORK', experiences: [role(over)] })
const bulletsAt = (sections: any[]) => sections[0].experiences[0].features[0]

const text = (v: unknown) => JSON.stringify(v)

// ── The model ─────────────────────────────────────────────────────────────

test('a bullet kept off a surface leaves that surface only; the metadata never reaches a public view', () => {
  const sections = [work({ itemsOnlyIn: { furtherExplanation: { '1': ['download', 'private'] } } })]
  const web = publicSections(sections, 'cv', 'web')
  assert.deepEqual(bulletsAt(web).furtherExplanation, ['Public bullet', 'Third bullet'])
  for (const surface of ['download', 'private'] as const) {
    assert.deepEqual(bulletsAt(publicSections(sections, 'cv', surface)).furtherExplanation, ['Public bullet', 'Download-only bullet', 'Third bullet'])
  }
  for (const surface of CV_SURFACES) assert.ok(!text(publicSections(sections, 'any', surface)).includes(ITEMS_ONLY_IN_KEY), `${surface}: no itemsOnlyIn in the output`)
  assert.ok((VISIBILITY_KEYS as readonly string[]).includes(ITEMS_ONLY_IN_KEY))
})

test('hidden always wins: a hidden bullet stays hidden whatever its audience says', () => {
  const sections = [work({ hiddenItems: { furtherExplanation: [1] }, itemsOnlyIn: { furtherExplanation: { '1': [...CV_SURFACES] } } })]
  for (const surface of CV_SURFACES) assert.ok(!text(publicSections(sections, 'any', surface)).includes('Download-only bullet'), surface)
})

test('authors keep their places: off a surface an author is the hidden mark there', () => {
  const paper = { uid: 'p1', title: 'An example paper', status: 'published', authors: ['Smith, J.', 'Example, P.', 'Doe, A.'], itemsOnlyIn: { authors: { '0': ['download'] } } }
  const papers = [{ sessionName: 'publications', papers: [paper] }]
  assert.deepEqual(publicSections(papers, 'cv', 'web')[0].papers[0].authors, [HIDDEN_ITEM_MARK, 'Example, P.', 'Doe, A.'])
  assert.deepEqual(publicSections(papers, 'cv', 'download')[0].papers[0].authors, ['Smith, J.', 'Example, P.', 'Doe, A.'])
})

test('reading itemsOnlyIn: absent = everywhere, unreadable = nowhere (string items only), stray keys and positions ignored', () => {
  const node = (map: unknown) => ({ furtherExplanation: ['a', 'b', 'c'], entries: [{ x: 1 }, 'loose'], itemsOnlyIn: map })
  assert.deepEqual(itemsOffSurface(node(undefined), 'furtherExplanation', 'web'), [])
  assert.equal(itemAudience(node(undefined), 'furtherExplanation', 0), null)
  assert.deepEqual(itemsOffSurface(node({ furtherExplanation: { '2': ['download'] } }), 'furtherExplanation', 'web'), [2])
  assert.deepEqual(itemsOffSurface(node({ furtherExplanation: { '2': ['download'] } }), 'furtherExplanation', 'download'), [])
  assert.deepEqual(itemAudience(node({ furtherExplanation: { '2': ['private', 'web'] } }), 'furtherExplanation', 2), ['web', 'private'])
  // An empty list is "nowhere"; an unknown surface is not implied.
  assert.deepEqual(itemsOffSurface(node({ furtherExplanation: { '0': [] } }), 'furtherExplanation', 'private'), [0])
  assert.deepEqual(itemsOffSurface(node({ furtherExplanation: { '0': ['print'] } }), 'furtherExplanation', 'web'), [0])
  // Unreadable: the whole map, or one field's map → every string item of that list is off.
  assert.deepEqual(itemsOffSurface(node('nope'), 'furtherExplanation', 'web'), [0, 1, 2])
  assert.deepEqual(itemsOffSurface(node({ furtherExplanation: ['x'] }), 'furtherExplanation', 'web'), [0, 1, 2])
  assert.deepEqual(itemAudience(node('nope'), 'furtherExplanation', 1), [])
  // Object entries have their own onlyIn; positions past the end and non-positions are ignored.
  assert.deepEqual(itemsOffSurface(node('nope'), 'entries', 'web'), [1])
  assert.deepEqual(itemsOffSurface(node({ furtherExplanation: { '7': ['download'], '01': ['download'], x: ['download'] } }), 'furtherExplanation', 'web'), [])
})

test('editor helpers: set, clear, count; positions follow inserts, removals and moves', () => {
  let n: Record<string, any> = { furtherExplanation: ['a', 'b', 'c'] }
  n = withItemAudience(n, 'furtherExplanation', 1, ['download'])
  n = withItemAudience(n, 'furtherExplanation', 2, ['web', 'download'])
  assert.deepEqual(n.itemsOnlyIn, { furtherExplanation: { '1': ['download'], '2': ['web', 'download'] } })
  assert.equal(countAudienceLimits(n), 2)
  // Every surface = everywhere: the entry (and empty maps) go.
  n = withItemAudience(n, 'furtherExplanation', 2, [...CV_SURFACES])
  assert.deepEqual(n.itemsOnlyIn, { furtherExplanation: { '1': ['download'] } })
  assert.deepEqual(withItemAudience(n, 'furtherExplanation', 1, null).itemsOnlyIn, undefined)
  // Insert before it (0 → 0, 1 → 2, 2 → 3), remove it, move it.
  assert.deepEqual(remapItemAudiences(n, 'furtherExplanation', [0, 2, 3]).itemsOnlyIn, { furtherExplanation: { '2': ['download'] } })
  assert.equal(remapItemAudiences(n, 'furtherExplanation', [0, -1, 1]).itemsOnlyIn, undefined)
  assert.deepEqual(remapItemAudiences(n, 'furtherExplanation', [1, 0, 2]).itemsOnlyIn, { furtherExplanation: { '0': ['download'] } })
  assert.equal(remapItemAudiences({ a: 1 }, 'furtherExplanation', [0]).a, 1, 'nothing to remap')
})

// ── Validation and sync ───────────────────────────────────────────────────

test('the validator accepts itemsOnlyIn by position and names what is wrong', () => {
  const ok = validateCvDoc({ en: [work({ itemsOnlyIn: { furtherExplanation: { '0': ['web'], '2': ['download', 'private'] } } })], zh: [] })
  assert.equal(ok.ok, true)
  const bad = (map: unknown) => {
    const out = validateCvDoc({ en: [work({ itemsOnlyIn: map })], zh: [] })
    return out.ok ? [] : out.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
  }
  assert.match(bad(['web']).join('\n'), /itemsOnlyIn must map field names/)
  assert.match(bad({ furtherExplanation: ['web'] }).join('\n'), /features\.0\.itemsOnlyIn\.furtherExplanation: itemsOnlyIn must map/)
  assert.match(bad({ furtherExplanation: { first: ['web'] } }).join('\n'), /keyed by item positions/)
  assert.match(bad({ furtherExplanation: { '1': ['print'] } }).join('\n'), /itemsOnlyIn\.furtherExplanation\.1 must be a list of: web, download, private/)
  // An error inside the metadata jumps to the entry that carries it.
  assert.deepEqual(errorFocusPath(['en', 0, 'experiences', 0, 'features', 0, 'itemsOnlyIn', 'furtherExplanation', '1']), { lang: 'en', sectionIdx: 0, path: [0, 'experiences', 0, 'features', 0] })
})

test('EN → 中文 sync: per bullet, what both sides allow, for bullets that still exist', () => {
  const en = [work({ itemsOnlyIn: { furtherExplanation: { '0': ['web', 'download'], '1': ['download'] } } })]
  const zh = [
    {
      sessionName: 'workExperience',
      experiences: [{ ...role(), features: [highlight({ furtherExplanation: ['公开', '仅下载', '第三', '多出的一条'], itemsOnlyIn: { furtherExplanation: { '0': ['download', 'private'], '3': ['private'] } } })] }],
    },
  ]
  const synced = syncLanguage(en, zh)
  assert.deepEqual(bulletsAt(synced).furtherExplanation, ['公开', '仅下载', '第三'], 'the list follows EN')
  assert.deepEqual(bulletsAt(synced).itemsOnlyIn, { furtherExplanation: { '0': ['download'], '1': ['download'] } })
  assert.equal(bulletsAt(syncLanguage([work()], [work()])).itemsOnlyIn, undefined)
})

// ── The Studio ────────────────────────────────────────────────────────────

const doc = (): Doc => ({ en: [work()], zh: [{ ...work(), headerName: '工作', experiences: [{ ...role(), features: [highlight({ furtherExplanation: ['公开', '仅下载', '第三'] })] }] }] })
const bulletsOf = (d: Doc, lang: 'en' | 'zh') => bulletsAt(d[lang])
const OWNER = [0, 'experiences', 0, 'features', 0]

test('a bullet’s audience reaches its twin when the lists line up, this language only when they do not', () => {
  const linked = setItemAudience(doc(), 'en', OWNER, 'furtherExplanation', 1, ['download'], true)
  assert.equal(linked.reached, true)
  assert.deepEqual(bulletsOf(linked.doc, 'en').itemsOnlyIn, { furtherExplanation: { '1': ['download'] } })
  assert.deepEqual(bulletsOf(linked.doc, 'zh').itemsOnlyIn, { furtherExplanation: { '1': ['download'] } })
  const uneven = doc()
  uneven.zh[0].experiences[0].features[0].furtherExplanation = ['只有一条']
  const mine = setItemAudience(uneven, 'en', OWNER, 'furtherExplanation', 1, ['download'], true)
  assert.equal(mine.reached, false)
  assert.equal(bulletsOf(mine.doc, 'zh').itemsOnlyIn, undefined)
  const unlinked = setItemAudience(doc(), 'en', OWNER, 'furtherExplanation', 1, ['download'], false)
  assert.equal(unlinked.reached, false)
  assert.equal(bulletsOf(unlinked.doc, 'zh').itemsOnlyIn, undefined)
})

test('positions follow their bullets through insert, remove, move and duplicate (a copy keeps its audience)', () => {
  const listPath = [...OWNER, 'furtherExplanation']
  let d = setItemAudience(doc(), 'en', OWNER, 'furtherExplanation', 1, ['download'], true).doc
  d = listOp(d, 'en', listPath, { type: 'insert', index: 0, item: 'New first', twinItem: '' }, true).doc
  assert.deepEqual(bulletsOf(d, 'en').itemsOnlyIn, { furtherExplanation: { '2': ['download'] } })
  assert.deepEqual(bulletsOf(d, 'zh').itemsOnlyIn, { furtherExplanation: { '2': ['download'] } })
  assert.equal(bulletsOf(d, 'en').furtherExplanation[2], 'Download-only bullet')
  d = listOp(d, 'en', listPath, { type: 'move', from: 2, to: 0 }, true).doc
  assert.equal(bulletsOf(d, 'en').furtherExplanation[0], 'Download-only bullet')
  assert.deepEqual(bulletsOf(d, 'en').itemsOnlyIn, { furtherExplanation: { '0': ['download'] } })
  d = listOp(d, 'en', listPath, { type: 'duplicate', index: 0 }, true).doc
  assert.deepEqual(bulletsOf(d, 'en').itemsOnlyIn, { furtherExplanation: { '0': ['download'], '1': ['download'] } }, 'a copy is never more public than its source')
  d = listOp(d, 'en', listPath, { type: 'remove', index: 0 }, true).doc
  d = listOp(d, 'en', listPath, { type: 'remove', index: 0 }, true).doc
  assert.equal(bulletsOf(d, 'en').itemsOnlyIn, undefined)
  assert.equal(bulletsOf(d, 'zh').itemsOnlyIn, undefined)
  // The pruned views agree with the editor at every step.
  assert.ok(!text(publicCvDoc(d, 'any', 'web')).includes(ITEMS_ONLY_IN_KEY))
})

test('Hidden items lists a limited bullet with where it shows; it jumps to the bullet', () => {
  const d = setItemAudience(doc(), 'en', OWNER, 'furtherExplanation', 1, ['download', 'private'], true).doc
  const rows = collectHidden(d).filter((r) => r.kind === 'limited')
  assert.deepEqual(
    rows.map((r) => [r.lang, r.label, r.preview, r.targetPath.join('.'), r.index]),
    [
      ['en', 'Sub-points #2', 'Only on Downloads + Private links · Download-only bullet', '0.experiences.0.features.0.furtherExplanation.1', 1],
      ['zh', 'Sub-points #2', 'Only on Downloads + Private links · 仅下载', '0.experiences.0.features.0.furtherExplanation.1', 1],
    ],
  )
  assert.equal(new Set(collectHidden(d).map((r) => r.id)).size, collectHidden(d).length, 'unique row ids')
})

test('wiring: each bullet has its "Shows on" menu; "Everywhere" in the panel resets a bullet', () => {
  const editor = read('components/Admin/cvStudio/SectionEditor.tsx')
  assert.match(editor, /renderAudience=\{\(i, text\) => \{/)
  assert.match(editor, /value=\{itemAudience\(node, def\.key, i\)\}/)
  assert.match(editor, /api\.setItemAudience\(nodePath, def\.key, i, l,/)
  const fields = read('components/Admin/cvStudio/fields.tsx')
  assert.match(fields, /audience=\{renderAudience\?\.\(i, text\)\}/)
  const studio = read('components/Admin/CVEditorStudio.tsx')
  assert.match(studio, /row\.index !== undefined\s*\?\s*setItemAudience\(d, row\.lang, row\.nodePath, String\(row\.field\), row\.index, null, linked\)/)
})
