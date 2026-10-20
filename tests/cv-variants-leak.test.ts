/**
 * E4 — the audience leak test over every output.
 *
 * Like tests/s1-leak.test.ts and tests/cv-docs-leak.test.ts, a fixture CV is
 * generated from the section registry (every section, field, nested list
 * and bullet, EN and 中文). A unique sentinel is planted in each slot and
 * then kept OFF one surface at a time by every audience that covers it —
 * the field's own list (`fieldsOnlyIn`), each entry around it (`onlyIn`),
 * each list around it, its section — and the outputs of that surface may
 * not contain it:
 *
 *   web       the public API payload (/api/cvdata), the /cv page data (= the
 *             __NEXT_DATA__ and the HTML), the /about + home data, the
 *             Person JSON-LD, the search documents and the Ask passages
 *   download  the PDF / text document model, the plain text, the JSON
 *             Resume, the evidence links, the skill evidence, the vCard
 *   private   a share link's page data and its PDF model (through a CV
 *             variant's selection)
 *
 * The surfaces the audience keeps must still show it (controls), and an
 * audience never brings back what a hide flag removed (hidden wins). A
 * sample is rendered to real PDFs, checking the strings drawn.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CV_SECTIONS, type FieldDef, type FieldKind, type ListDef } from '../lib/cvSections'
import { CV_SURFACES, getAt, publicCvDoc, setAt, type CvDoc, type CvPath, type CvSurface } from '../lib/cvVisibility'
import { withEntryUids } from '../lib/cvEntryUid'
import { applyVariant, variantFromCv } from '../lib/cvVariants'
import { allEvidenceLinks, profileLinks, withEvidenceLinks } from '../lib/cvLinks'
import { buildCvModel } from '../lib/cvExport/model'
import { renderCvText } from '../lib/cvExport/text'
import { buildJsonResume } from '../lib/cvExport/jsonResume'
import { loadPdfFonts, renderCvPdf } from '../lib/cvExport/pdf'
import { buildSkillEvidence } from '../lib/skillEvidence'
import { personExtrasFromCv } from '../lib/personExtras'
import { personFactsFromCv, personNode } from '../lib/schema'
import { buildVcard, currentRoleFrom } from '../lib/vcard'
import { cvSearchDocs } from '../lib/searchIndex'
import { cvPassages } from '../lib/askIndex'
import { EXAMPLE_ORCID_ID } from './fixtures/orcid'

const TEXT = 'ZZ-AUDIENCE-SENTINEL-ZZ'
const URL_SENTINEL = 'https://zz-audience-sentinel.example/zz'
const URL_NEEDLE = 'zz-audience-sentinel'
const SLUG_SENTINEL = 'zz-audience-sentinel'
const DATE = '1907-07'
const DATE_NEEDLES = ['1907']
const NOW = '2026-10'

const works = [{ slug: SLUG_SENTINEL, title: 'Sentinel case study', link: 'https://case.example.org', repo: 'https://github.com/example/case' }]
const socials = { github: 'https://github.com/fallback', linkedin: 'https://www.linkedin.com/in/fallback/' }

function fill(f: Pick<FieldDef, 'kind' | 'options' | 'format'>): unknown {
  const kind = f.kind
  if (kind === 'bullets' || kind === 'tags') return ['first filler item', 'second filler item']
  if (kind === 'endMonth') return 'Present'
  if (kind === 'month' || kind === 'yearMonth') return '2020-01'
  if (kind === 'color') return '#123456'
  if (kind === 'url') return 'https://filler.example.org'
  if (kind === 'select') return f.options?.[0]?.value ?? 'filler text'
  if (kind === 'switch') return true
  if (kind === 'image') return '/uploads/filler-photo.webp'
  if (f.format === 'doi') return '10.5555/filler'
  if (f.format === 'orcid') return EXAMPLE_ORCID_ID
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
  return withEntryUids({ en: lang('en'), zh: lang('zh') })
}

type Slot = { path: CvPath; ownerPath: CvPath; field: string; kind: FieldKind | 'bullet'; entryPaths: CvPath[]; lists: Array<{ ownerPath: CvPath; key: string }> }

const PRIVATE_FIELDS = new Set(['photo', 'photoOnPdf', 'permission', 'separatorColor'])

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

function collect(node: Record<string, any>, path: CvPath, entryPaths: CvPath[], lists: Slot['lists'], out: Slot[], sessionName: string) {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'sessionName' || key === 'uid' || PRIVATE_FIELDS.has(key)) continue
    if (typeof value === 'string') {
      const kind = kindOf(sessionName, key) ?? 'text'
      if (kind === 'color' || kind === 'select') continue
      out.push({ path: [...path, key], ownerPath: path, field: key, kind, entryPaths, lists })
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'string') out.push({ path: [...path, key, i], ownerPath: path, field: key, kind: 'bullet', entryPaths, lists })
        else if (item && typeof item === 'object') {
          const p = [...path, key, i]
          collect(item, p, [...entryPaths, p], [...lists, { ownerPath: path, key }], out, sessionName)
        }
      })
    }
  }
}

const merge = (sections: any[], path: CvPath, patch: Record<string, any>) => setAt(sections, path, { ...getAt(sections, path), ...patch })
const withFieldOnly = (sections: any[], ownerPath: CvPath, field: string, allowed: CvSurface[]) => {
  const node = getAt(sections, ownerPath) || {}
  return merge(sections, ownerPath, { fieldsOnlyIn: { ...(node.fieldsOnlyIn || {}), [field]: allowed } })
}

type Mechanism = { label: string; apply: (s: any[], allowed: CvSurface[]) => any[] }

function mechanisms(slot: Slot): Mechanism[] {
  const out: Mechanism[] = [{ label: `field ${slot.field}`, apply: (s, a) => withFieldOnly(s, slot.ownerPath, slot.field, a) }]
  for (const e of slot.entryPaths) out.push({ label: `entry ${e.join('.')}`, apply: (s, a) => merge(s, e, { onlyIn: a }) })
  for (const l of slot.lists) out.push({ label: `list ${l.key}`, apply: (s, a) => withFieldOnly(s, l.ownerPath, l.key, a) })
  out.push({ label: 'section', apply: (s, a) => merge(s, [slot.path[0]], { onlyIn: a }) })
  return out
}

function sentinelFor(slot: Slot): { value: string; needles: string[] } {
  if (/date/i.test(slot.field)) return { value: DATE, needles: DATE_NEEDLES }
  if (slot.field === 'caseStudy') return { value: SLUG_SENTINEL, needles: [SLUG_SENTINEL] }
  if (slot.field === 'orcid') return { value: EXAMPLE_ORCID_ID, needles: [EXAMPLE_ORCID_ID] }
  if (slot.kind === 'url') return { value: URL_SENTINEL, needles: [URL_NEEDLE] }
  return { value: TEXT, needles: [TEXT] }
}

/** Everything the 'web' surface publishes from the CV. */
function webOutputs(doc: CvDoc): string {
  const any = publicCvDoc(doc, 'any', 'web')
  const cv = publicCvDoc(doc, 'cv', 'web')
  const site = publicCvDoc(doc, 'website', 'web')
  return [
    JSON.stringify(any),
    JSON.stringify(withEvidenceLinks(cv.en, { works, socials })),
    JSON.stringify(withEvidenceLinks(cv.zh, { works, socials })),
    JSON.stringify(site),
    JSON.stringify(personNode({ ...personFactsFromCv(site.en), ...personExtrasFromCv(site.en, NOW) })),
    JSON.stringify([...cvSearchDocs(cv.en, 'en'), ...cvSearchDocs(cv.zh, 'zh')]),
    JSON.stringify([...cvPassages(cv.en, 'en'), ...cvPassages(cv.zh, 'zh')]),
  ].join('\n')
}

/** Every file of one language built from `sections` (the downloads, or a share link's PDF). */
function fileOutputs(sections: any[], lang: 'en' | 'zh'): string {
  const linked = withEvidenceLinks(sections, { works, socials })
  const model = buildCvModel(linked, { lang, now: NOW, updatedAt: Date.UTC(2026, 9, 13), canonical: 'https://example.com/cv' })
  const pi = linked.find((s) => s.sessionName === 'personalInformation')
  const work = linked.find((s) => s.sessionName === 'workExperience')
  return [
    JSON.stringify(model),
    renderCvText(model),
    JSON.stringify(buildJsonResume(linked, { lang, now: NOW, canonical: 'https://example.com/cv.json' })),
    JSON.stringify(allEvidenceLinks(linked, lang)),
    JSON.stringify(buildSkillEvidence(linked, { lang, works: works.map((w) => ({ slug: w.slug, title: w.title })) })),
    buildVcard(pi ?? null, currentRoleFrom(work, NOW), { profiles: profileLinks(pi) }),
  ].join('\n')
}

function downloadOutputs(doc: CvDoc): string {
  const pub = publicCvDoc(doc, 'cv', 'download')
  return `${fileOutputs(pub.en, 'en')}\n${fileOutputs(pub.zh, 'zh')}`
}

/** A share link of a variant that prints every section the CV prints (all entries): page data + PDF model. */
function privateOutputs(doc: CvDoc): string {
  const variant = variantFromCv(doc.en, 'Everything')
  const selected = { en: applyVariant(doc.en, variant), zh: applyVariant(doc.zh, variant) }
  const pub = publicCvDoc(selected, 'cv', 'private')
  return [JSON.stringify(withEvidenceLinks(pub.en, { works, socials })), JSON.stringify(pub.zh), fileOutputs(pub.en, 'en'), fileOutputs(pub.zh, 'zh')].join('\n')
}

const OUTPUTS: Record<CvSurface, (doc: CvDoc) => string> = { web: webOutputs, download: downloadOutputs, private: privateOutputs }

const slots: Slot[] = []
buildDoc().en.forEach((section, i) => collect(section, [i], [], [], slots, (section as any).sessionName))

test('the fixture reaches every section, contact field, link, nested list and bullet', () => {
  const fields = new Set(slots.map((s) => s.field))
  for (const f of ['phoneNumber', 'email', 'address', 'github', 'orcid', 'gpa', 'caseStudy', 'url', 'repo', 'furtherExplanation', 'credentialURL', 'quote', 'authors', 'abstract']) {
    assert.ok(fields.has(f), f)
  }
  assert.equal(new Set(slots.map((s) => s.path[0])).size, CV_SECTIONS.length)
})

test('a value kept off a surface reaches none of its outputs; the surfaces it is kept for still show it', () => {
  let cases = 0
  const controls: Record<CvSurface, number> = { web: 0, download: 0, private: 0 }
  for (const slot of slots) {
    const { value, needles } = sentinelFor(slot)
    const base = buildDoc()
    let planted: CvDoc = { en: setAt(base.en, slot.path, value), zh: setAt(base.zh, slot.path, value) }
    if (slot.field === 'orcid') {
      const marker = { orcidAuthenticated: { id: value, at: '2026-10-21T08:00:00.000Z' } }
      planted = { en: merge(planted.en, slot.ownerPath, marker), zh: merge(planted.zh, slot.ownerPath, marker) }
    }
    const has = (text: string) => needles.some((n) => text.includes(n))
    for (const mech of mechanisms(slot)) {
      for (const off of CV_SURFACES) {
        const allowed = CV_SURFACES.filter((s) => s !== off)
        const doc: CvDoc = { en: mech.apply(planted.en, allowed), zh: mech.apply(planted.zh, allowed) }
        cases++
        assert.ok(!has(OUTPUTS[off](doc)), `${slot.path.join('.')} kept off ${off} by its ${mech.label}: leaked into a ${off} output`)
        // Controls: the allowed surfaces still show it (when their outputs print the slot at all).
        for (const keep of allowed) if (has(OUTPUTS[keep](doc))) controls[keep]++
      }
    }
  }
  assert.ok(cases > 1500, `exercised ${cases} audience cases`)
  // Many slots never print on a given surface (a project's role is /work-only, the abstract is never printed…),
  // but every surface must really show restricted values that are allowed there.
  for (const s of CV_SURFACES) assert.ok(controls[s] > 50, `${s}: an allowed value reaches its outputs (${controls[s]})`)
})

test('hidden always wins: an audience that names every surface brings nothing hidden back', () => {
  let cases = 0
  for (const slot of slots) {
    const { value, needles } = sentinelFor(slot)
    const base = buildDoc()
    const planted: CvDoc = { en: setAt(base.en, slot.path, value), zh: setAt(base.zh, slot.path, value) }
    const has = (text: string) => needles.some((n) => text.includes(n))
    const hides: Array<(s: any[]) => any[]> = [(s) => merge(s, slot.ownerPath, { hiddenFields: [slot.field], fieldsOnlyIn: { [slot.field]: [...CV_SURFACES] } })]
    for (const e of slot.entryPaths) hides.push((s) => merge(s, e, { isVisible: false, onlyIn: [...CV_SURFACES] }))
    for (const hide of hides) {
      const doc: CvDoc = { en: hide(planted.en), zh: hide(planted.zh) }
      for (const surface of CV_SURFACES) {
        cases++
        assert.ok(!has(OUTPUTS[surface](doc)), `${slot.path.join('.')}: hidden, yet in a ${surface} output`)
      }
    }
  }
  assert.ok(cases > 900, `exercised ${cases} cases`)
})

test('the PDF draws nothing kept off its surface (sampled: one slot per section and kind; downloads and share links)', async () => {
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
    for (const off of ['download', 'private'] as const) {
      const allowed = CV_SURFACES.filter((s) => s !== off)
      const doc: CvDoc = { en: withFieldOnly(planted.en, slot.ownerPath, slot.field, allowed), zh: withFieldOnly(planted.zh, slot.ownerPath, slot.field, allowed) }
      const source = off === 'private' ? { en: applyVariant(doc.en, variantFromCv(doc.en, 'All')), zh: [] } : doc
      const sections = withEvidenceLinks(publicCvDoc(source, 'cv', off).en, { works, socials })
      const model = buildCvModel(sections, { lang: 'en', now: NOW, canonical: 'https://example.com/cv' })
      const drawn: string[] = []
      const out = await renderCvPdf(model, { fonts, onText: (t) => drawn.push(t) })
      rendered++
      assert.ok(!needles.some((n) => drawn.join('\n').includes(n)), `${slot.path.join('.')} kept off ${off}: drawn in the PDF`)
      assert.ok(slot.kind !== 'url' || !out.buffer.toString('latin1').includes(URL_NEEDLE), `${slot.path.join('.')} kept off ${off}: URL in a PDF annotation`)
    }
  }
  assert.ok(rendered > 40, `rendered ${rendered} PDFs`)
})
