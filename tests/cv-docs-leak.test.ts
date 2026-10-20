/**
 * cv-docs: the visibility leak test, extended to every new output.
 *
 * Like tests/s1-leak.test.ts, a fixture CV is generated from the section
 * registry (every section, field, nested list and bullet, EN and 中文). A
 * unique sentinel is planted in each slot and hidden in turn by every
 * mechanism that covers it. Then none of these may contain it:
 *   - the PDF / plain-text document model and the plain text (lib/cvExport),
 *   - the JSON Resume,
 *   - the evidence links (profiles, case-study / live / code links),
 *   - the skill evidence rows (labels and hrefs),
 *   - the Person facts (lib/personExtras, website audience),
 *   - the vCard;
 * and for a sample of cases, the strings the PDF renderer actually draws.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CV_SECTIONS, type FieldDef, type FieldKind, type ListDef } from '../lib/cvSections'
import { getAt, publicCvDoc, setAt, type CvAudience, type CvDoc, type CvPath } from '../lib/cvVisibility'
import { allEvidenceLinks, profileLinks, withEvidenceLinks } from '../lib/cvLinks'
import { buildCvModel } from '../lib/cvExport/model'
import { renderCvText } from '../lib/cvExport/text'
import { buildJsonResume } from '../lib/cvExport/jsonResume'
import { loadPdfFonts, renderCvPdf } from '../lib/cvExport/pdf'
import { buildSkillEvidence } from '../lib/skillEvidence'
import { personExtrasFromCv } from '../lib/personExtras'
import { personNode } from '../lib/schema'
import { buildVcard, currentRoleFrom } from '../lib/vcard'

const TEXT = 'ZZ-LEAK-SENTINEL-ZZ'
const URL_SENTINEL = 'https://zz-leak-sentinel.example/zz'
const URL_NEEDLE = 'zz-leak-sentinel'
const SLUG_SENTINEL = 'zz-leak-sentinel'
// ORCID's documented example iD (a fictitious record ORCID publishes for
// testing) — a valid checksum, so the slot really renders when visible.
const ORCID_FIXTURE = '0000-0002-1825-0097'
const DATE = '1907-07'
const DATE_NEEDLES = ['1907', 'Jul 1907', '1907.07']
const NOW = '2026-10'

const works = [{ slug: SLUG_SENTINEL, title: 'Sentinel case study', link: 'https://case.example.org', repo: 'https://github.com/example/case' }]
const socials = { github: 'https://github.com/fallback', linkedin: 'https://www.linkedin.com/in/fallback/' }

/** A valid value for a field, so every entry renders (a paper needs a real status; a DOI must be one). */
function fill(f: Pick<FieldDef, 'kind' | 'options' | 'format'>): unknown {
  const kind = f.kind
  if (kind === 'bullets' || kind === 'tags') return ['first filler item', 'second filler item']
  if (kind === 'endMonth') return 'Present'
  if (kind === 'month' || kind === 'yearMonth') return '2020-01'
  if (kind === 'color') return '#123456'
  if (kind === 'url') return 'https://filler.example.org'
  if (kind === 'select') return f.options?.[0]?.value ?? 'filler text'
  if (f.format === 'doi') return '10.5555/filler'
  if (f.format === 'orcid') return ORCID_FIXTURE
  return 'filler text'
}

function buildEntry(list: ListDef): Record<string, any> {
  const entry: Record<string, any> = {}
  for (const f of list.fields) entry[f.key] = fill(f)
  for (const nested of list.lists || []) entry[nested.key] = [buildEntry(nested), buildEntry(nested)]
  return entry
}

function buildDoc(): CvDoc {
  const lang = (l: 'en' | 'zh') =>
    CV_SECTIONS.map((def) => {
      const section: Record<string, any> = { sessionName: def.sessionName, headerName: def.headerDefault[l] }
      for (const f of def.fields || []) section[f.key] = fill(f)
      for (const list of def.lists || []) section[list.key] = [buildEntry(list), buildEntry(list)]
      return section as { sessionName: string }
    })
  return { en: lang('en'), zh: lang('zh') }
}

type Slot = { path: CvPath; ownerPath: CvPath; field: string; kind: FieldKind | 'bullet'; index?: number; entryPaths: CvPath[]; lists: Array<{ ownerPath: CvPath; key: string }> }

const kindOf = (sessionName: string, path: CvPath, field: string): FieldKind | undefined => {
  const def = CV_SECTIONS.find((s) => s.sessionName === sessionName)
  const all: Array<{ key: string; kind: FieldKind }> = []
  const walk = (lists: ListDef[] | undefined) => {
    for (const l of lists || []) {
      all.push(...l.fields)
      walk(l.lists)
    }
  }
  all.push(...(def?.fields || []))
  walk(def?.lists)
  void path
  return all.find((f) => f.key === field)?.kind
}

function collect(node: Record<string, any>, path: CvPath, entryPaths: CvPath[], lists: Slot['lists'], out: Slot[], sessionName: string) {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'sessionName') continue
    if (typeof value === 'string') {
      const kind = kindOf(sessionName, path, key) ?? 'text'
      if (kind === 'color') continue
      out.push({ path: [...path, key], ownerPath: path, field: key, kind, entryPaths, lists })
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'string') out.push({ path: [...path, key, i], ownerPath: path, field: key, kind: 'bullet', index: i, entryPaths, lists })
        else if (item && typeof item === 'object') {
          const p = [...path, key, i]
          collect(item, p, [...entryPaths, p], [...lists, { ownerPath: path, key }], out, sessionName)
        }
      })
    }
  }
}

type Mechanism = { label: string; apply: (s: any[]) => any[]; hiddenFrom: CvAudience[] }
const merge = (sections: any[], path: CvPath, patch: Record<string, any>) => setAt(sections, path, { ...getAt(sections, path), ...patch })

function mechanisms(slot: Slot): Mechanism[] {
  const all: CvAudience[] = ['cv', 'website', 'any']
  const out: Mechanism[] = [{ label: `field ${slot.field}`, apply: (s) => merge(s, slot.ownerPath, { hiddenFields: [slot.field] }), hiddenFrom: all }]
  if (slot.index !== undefined) out.push({ label: `bullet ${slot.field}[${slot.index}]`, apply: (s) => merge(s, slot.ownerPath, { hiddenItems: { [slot.field]: [slot.index] } }), hiddenFrom: all })
  for (const e of slot.entryPaths) out.push({ label: `entry ${e.join('.')}`, apply: (s) => merge(s, e, { isVisible: false }), hiddenFrom: all })
  for (const l of slot.lists) out.push({ label: `list ${l.key}`, apply: (s) => merge(s, l.ownerPath, { hiddenFields: [l.key] }), hiddenFrom: all })
  const section: CvPath = [slot.path[0]]
  out.push(
    { label: 'section off CV', apply: (s) => merge(s, section, { isVisible: false }), hiddenFrom: ['cv'] },
    { label: 'section off website', apply: (s) => merge(s, section, { showOnWebsite: false }), hiddenFrom: ['website'] },
  )
  return out
}

function sentinelFor(slot: Slot): { value: string; needles: string[] } {
  if (/date/i.test(slot.field)) return { value: DATE, needles: DATE_NEEDLES }
  if (slot.field === 'caseStudy') return { value: SLUG_SENTINEL, needles: [SLUG_SENTINEL] }
  // Only a valid iD renders, so the sentinel is the iD itself (the one slot of its kind per language).
  if (slot.field === 'orcid') return { value: ORCID_FIXTURE, needles: [ORCID_FIXTURE] }
  if (slot.kind === 'url') return { value: URL_SENTINEL, needles: [URL_NEEDLE] }
  return { value: TEXT, needles: [TEXT] }
}

/** Every output built from the CV-audience view of one language. */
function cvOutputs(doc: CvDoc, lang: 'en' | 'zh'): string {
  const sections = withEvidenceLinks(publicCvDoc(doc, 'cv')[lang], { works, socials })
  const model = buildCvModel(sections, { lang, now: NOW, updatedAt: Date.UTC(2026, 9, 13), canonical: 'https://lucian-dev.com/cv' })
  const pi = sections.find((s) => s.sessionName === 'personalInformation')
  const workSection = sections.find((s) => s.sessionName === 'workExperience')
  return [
    JSON.stringify(model),
    renderCvText(model),
    JSON.stringify(buildJsonResume(sections, { lang, now: NOW, canonical: 'https://lucian-dev.com/cv.json' })),
    JSON.stringify(allEvidenceLinks(sections, lang)),
    JSON.stringify(buildSkillEvidence(sections, { lang, works: works.map((w) => ({ slug: w.slug, title: w.title })) })),
    buildVcard(pi ?? null, currentRoleFrom(workSection, NOW), { profiles: profileLinks(pi) }),
  ].join('\n')
}

function websiteOutputs(doc: CvDoc): string {
  return JSON.stringify(personNode(personExtrasFromCv(publicCvDoc(doc, 'website').en, NOW)))
}

// Every section is sampled, publications included (the PDF, text and JSON
// Resume print papers); their page-level checks (props, JSON-LD,
// /api/cvdata, the switches) live in tests/publications-leak.test.ts, the
// home / search / export store checks in tests/publications-phase2.test.ts.
const slots: Slot[] = []
buildDoc().en.forEach((section, i) => {
  collect(section, [i], [], [], slots, (section as any).sessionName)
})

test('the fixture reaches the new fields (profiles, project links) and nested bullets', () => {
  const fields = new Set(slots.map((s) => s.field))
  for (const f of ['github', 'linkedin', 'orcid', 'caseStudy', 'url', 'repo', 'relatedSkills', 'furtherExplanation', 'credentialURL']) assert.ok(fields.has(f), f)
})

test('no hidden value reaches the model, the text, the JSON Resume, the evidence links, the skill evidence, the vCard or the Person facts', () => {
  let cases = 0
  let controls = 0
  for (const slot of slots) {
    const { value, needles } = sentinelFor(slot)
    const base = buildDoc()
    const planted: CvDoc = { en: setAt(base.en, slot.path, value), zh: setAt(base.zh, slot.path, value) }
    const has = (text: string) => needles.some((n) => text.includes(n))
    if (has(cvOutputs(planted, 'en')) || has(websiteOutputs(planted))) controls++

    for (const mech of mechanisms(slot)) {
      const doc: CvDoc = { en: mech.apply(planted.en), zh: mech.apply(planted.zh) }
      const where = `${slot.path.join('.')} hidden by ${mech.label}`
      if (mech.hiddenFrom.includes('cv')) {
        cases++
        for (const lang of ['en', 'zh'] as const) assert.ok(!has(cvOutputs(doc, lang)), `${where}: leaked into a ${lang} CV output`)
      }
      if (mech.hiddenFrom.includes('website')) {
        cases++
        assert.ok(!has(websiteOutputs(doc)), `${where}: leaked into the Person facts`)
      }
    }
  }
  // The planted values are really printed when visible, so the checks are meaningful.
  assert.ok(controls > slots.length * 0.75, `visible sentinels reach an output in ${controls}/${slots.length} slots`)
  assert.ok(cases > 600, `exercised ${cases} hide cases`)
})

test('a hidden link field is not refilled from another source (Home socials, the linked case study)', () => {
  const doc = buildDoc()
  const piAt = doc.en.findIndex((s) => s.sessionName === 'personalInformation')
  const projAt = doc.en.findIndex((s) => s.sessionName === 'project')
  const hide = (sections: any[]) => {
    let s = merge(sections, [piAt], { github: '', linkedin: '', hiddenFields: ['github', 'linkedin'] })
    s = merge(s, [projAt, 'projectExperience', 0], { caseStudy: SLUG_SENTINEL, url: '', repo: '', hiddenFields: ['caseStudy', 'url', 'repo'] })
    return s
  }
  const hidden: CvDoc = { en: hide(doc.en), zh: hide(doc.zh) }
  for (const lang of ['en', 'zh'] as const) {
    const text = cvOutputs(hidden, lang)
    for (const needle of ['github.com/fallback', 'linkedin.com/in/fallback', `/work/${SLUG_SENTINEL}`, 'case.example.org', 'github.com/example/case']) {
      assert.ok(!text.includes(needle), `${lang}: ${needle} must not stand in for a hidden field`)
    }
  }
  // Control: not hidden and empty, the fallbacks are used.
  const open = (sections: any[]) => merge(merge(sections, [piAt], { github: '', linkedin: '' }), [projAt, 'projectExperience', 0], { caseStudy: SLUG_SENTINEL, url: '', repo: '' })
  const text = cvOutputs({ en: open(doc.en), zh: open(doc.zh) }, 'en')
  for (const needle of ['github.com/fallback', 'linkedin.com/in/fallback', `/work/${SLUG_SENTINEL}`, 'case.example.org', 'github.com/example/case']) assert.ok(text.includes(needle), needle)
})

test('the PDF draws no hidden value (sampled: one slot per section and field kind, every mechanism)', async () => {
  const fonts = loadPdfFonts()
  const seen = new Set<string>()
  const sample = slots.filter((s) => {
    const key = `${s.path[0]}:${s.kind}:${s.lists.length}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  let rendered = 0
  for (const slot of sample) {
    const { value, needles } = sentinelFor(slot)
    const base = buildDoc()
    const planted: CvDoc = { en: setAt(base.en, slot.path, value), zh: setAt(base.zh, slot.path, value) }
    for (const mech of mechanisms(slot).filter((m) => m.hiddenFrom.includes('cv'))) {
      const doc: CvDoc = { en: mech.apply(planted.en), zh: mech.apply(planted.zh) }
      const sections = withEvidenceLinks(publicCvDoc(doc, 'cv').en, { works, socials })
      const model = buildCvModel(sections, { lang: 'en', now: NOW, canonical: 'https://lucian-dev.com/cv' })
      const drawn: string[] = []
      const out = await renderCvPdf(model, { fonts, onText: (t) => drawn.push(t) })
      rendered++
      const all = drawn.join('\n')
      assert.ok(!needles.some((n) => all.includes(n)), `${slot.path.join('.')} hidden by ${mech.label}: drawn in the PDF`)
      // Link targets live in annotations, outside the drawn text.
      assert.ok(!out.buffer.toString('latin1').includes(URL_NEEDLE) || slot.kind !== 'url', `${slot.path.join('.')} hidden by ${mech.label}: URL in a PDF annotation`)
    }
  }
  assert.ok(rendered > 40, `rendered ${rendered} PDFs`)
})
