/**
 * orcid — the owner's ORCID iD as CV data (lib/orcid/id, the registry and
 * validator, lib/cvLinks) and on every surface: the document model, the
 * plain text, the PDF strings, the JSON Resume, the vCard, the Person
 * JSON-LD, the ScholarlyArticle author, llms.txt and the readiness check —
 * and nowhere once the owner hides the field.
 *
 * The iD used here is ORCID's documented example (a fictitious record ORCID
 * publishes for testing); the other valid iDs are derived from it by the
 * checksum, never a person's.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ORCID_MESSAGES, isValidOrcidId, normalizeOrcidId, orcidChecksum, orcidIdProblem, orcidUrl, withBareOrcid } from '../lib/orcid/id'
import { canonicalOrcid, orcidRecordUrl } from '../lib/orcid/uri'
import { CV_SECTIONS } from '../lib/cvSections'
import { validateCvDoc } from '../lib/cvValidate'
import { ORCID_FIELD, allEvidenceLinks, orcidOf, profileLinks, withEvidenceLinks } from '../lib/cvLinks'
import { publicCvDoc, publicSections } from '../lib/cvVisibility'
import { buildCvModel } from '../lib/cvExport/model'
import { renderCvText } from '../lib/cvExport/text'
import { buildJsonResume } from '../lib/cvExport/jsonResume'
import { loadPdfFonts, renderCvPdf } from '../lib/cvExport/pdf'
import { buildVcard } from '../lib/vcard'
import { personFactsFromCv, personNode, personAuthor, DEFAULT_SAME_AS } from '../lib/schema'
import { scholarlyArticleNode } from '../lib/publications/jsonld'
import { toPublication } from '../lib/publications/normalize'
import { ownerNamesFromSections } from '../lib/publications/names'
import { buildLlmsTxt, type LlmsInput } from '../lib/markdownTwin'
import { CHECK_LABEL, CHECK_SEVERITY, runReadinessChecks } from '../lib/cvReadiness'

const ID = '0000-0002-1825-0097'
const URL = `https://orcid.org/${ID}`
const NOW = '2026-10'

const pi = (extra: Record<string, unknown> = {}) => ({
  sessionName: 'personalInformation',
  headerName: 'Personal Information',
  firstName: 'Example',
  lastName: 'Person',
  nickName: '',
  email: 'owner@example.com',
  personalWebsite: 'example.com',
  github: 'https://github.com/example-person',
  address: '',
  introduction: 'A summary.',
  orcid: ID,
  ...extra,
})

const paper = (extra: Record<string, unknown> = {}) => ({
  title: 'An example paper about examples',
  authors: ['Example Person', 'Jane Doe'],
  venue: 'Journal of Examples',
  venueType: 'journal',
  status: 'published',
  date: '2025-03',
  doi: '10.5555/example.2025',
  ...extra,
})

const publications = (papers: unknown[] = [paper()], extra: Record<string, unknown> = {}) => ({ sessionName: 'publications', headerName: 'Publications', papers, ...extra })

const doc = (extra: Record<string, unknown> = {}, papers?: unknown[]) => ({
  en: [pi(extra), publications(papers)],
  zh: [pi({ firstName: '例', lastName: '人', ...extra }), publications(papers, { headerName: '论文' })],
})

// ── lib/orcid/id ──────────────────────────────────────────────────────────

test('MOD 11-2: the documented example checks out; a typo is caught; X is a valid check character', () => {
  assert.equal(orcidChecksum('000000021825009'), '7')
  assert.equal(isValidOrcidId(ID), true)
  assert.equal(isValidOrcidId('0000-0002-1825-0098'), false)
  assert.equal(orcidIdProblem('0000-0002-1825-0098'), 'checksum')
  assert.equal(orcidIdProblem('0000-0002-1825-009'), 'format')
  assert.equal(orcidIdProblem('not an id'), 'format')
  assert.equal(orcidIdProblem(''), '', 'blank is "no iD", not a problem')
  // Find a base whose check character is X and make sure it round-trips in either case.
  let withX = ''
  for (let i = 0; i < 100 && !withX; i++) {
    const base = `00000001${String(2000000 + i).padStart(7, '0')}`
    if (orcidChecksum(base) === 'X') withX = base
  }
  assert.ok(withX)
  const hyphenated = `${withX.slice(0, 4)}-${withX.slice(4, 8)}-${withX.slice(8, 12)}-${withX.slice(12, 15)}X`
  assert.equal(normalizeOrcidId(hyphenated.toLowerCase()), hyphenated)
  assert.equal(orcidIdProblem(hyphenated.replace(/X$/, '0')), 'checksum')
})

test('every pasted shape normalises to the bare iD; the URI is https://orcid.org/<iD>', () => {
  for (const v of [ID, ` ${ID} `, '0000000218250097', URL, `${URL}/`, `http://orcid.org/${ID}`, `orcid.org/${ID}`, `ORCID: ${ID}`, `orcid:${ID}`, `https://orcid.org/${ID}?lang=en`, `0000–0002–1825–0097`]) {
    assert.equal(normalizeOrcidId(v), ID, v)
  }
  assert.equal(orcidUrl(ID), URL)
  assert.equal(orcidUrl(URL), URL)
  assert.equal(orcidUrl('0000-0002-1825-0098'), '')
  assert.equal(normalizeOrcidId(undefined), '')
  assert.equal(normalizeOrcidId('https://example.com/0000-0002-1825-0097'), '', 'another host is not an ORCID link')
})

test('the light check for page code: canonical iDs and URIs only, checksum included; pasted shapes are the server\'s job', () => {
  assert.equal(canonicalOrcid(ID), ID)
  assert.equal(canonicalOrcid(URL), ID)
  assert.equal(orcidRecordUrl(ID), URL)
  assert.equal(orcidRecordUrl(URL), URL)
  for (const v of ['0000-0002-1825-0098', '0000000218250097', `http://orcid.org/${ID}`, `${URL}/`, ` ${ID}`, '0000-0002-1825-009x', '', null, 7]) {
    assert.equal(canonicalOrcid(v), '', String(v))
    assert.equal(orcidRecordUrl(v), '', String(v))
  }
  // Every canonical form the full normaliser produces passes the light check.
  for (const v of [ID, URL, `orcid:${ID}`, '0000000218250097']) assert.equal(canonicalOrcid(normalizeOrcidId(v)), ID)
})

test('saving stores the bare iD: a pasted link is rewritten, anything else (blank, a typo, other sections) is left alone', () => {
  const sections: Array<Record<string, unknown>> = [pi({ orcid: `${URL}/` }), publications()]
  const stored = withBareOrcid(sections)
  assert.equal(stored[0].orcid, ID)
  assert.equal(stored[1], sections[1], 'other sections are the same objects')
  assert.equal(sections[0].orcid, `${URL}/`, 'the input is not mutated')
  for (const orcid of [ID, '', '0000-0002-1825-0098', undefined]) {
    const same = [pi({ orcid })]
    assert.equal(withBareOrcid(same), same, String(orcid))
  }
  assert.equal(withBareOrcid(undefined), undefined)
  assert.deepEqual(withBareOrcid([{ sessionName: 'education', orcid: URL }]), [{ sessionName: 'education', orcid: URL }])
})

// ── Registry + validator ──────────────────────────────────────────────────

test('the registry offers the ORCID iD on Personal Info: hideable, shared across languages, format orcid', () => {
  const info = CV_SECTIONS.find((s) => s.sessionName === 'personalInformation')!
  const f = info.fields!.find((x) => x.key === ORCID_FIELD)!
  assert.ok(f)
  assert.equal(f.kind, 'text')
  assert.equal(f.format, 'orcid')
  assert.equal(f.shared, true)
  assert.notEqual(f.hideable, false)
  assert.doesNotMatch(f.placeholder || '', /[1-9]/, 'the placeholder shows the shape, never a real-looking iD')
})

test('the validator accepts the iD and its link, refuses a bad checksum with its own message and a bad shape with the format one', () => {
  assert.equal(validateCvDoc({ en: [pi()], zh: [] }).ok, true)
  assert.equal(validateCvDoc({ en: [pi({ orcid: URL })], zh: [] }).ok, true)
  assert.equal(validateCvDoc({ en: [pi({ orcid: '' })], zh: [] }).ok, true)
  const typo = validateCvDoc({ en: [pi({ orcid: '0000-0002-1825-0098' })], zh: [] })
  assert.equal(typo.ok, false)
  if (!typo.ok) {
    assert.deepEqual(typo.errors[0].path, ['en', 0, 'orcid'])
    assert.equal(typo.errors[0].message, ORCID_MESSAGES.checksum)
    assert.match(typo.errors[0].message, /typo|last character/i)
  }
  const shape = validateCvDoc({ en: [pi({ orcid: 'https://orcid.org/profile' })], zh: [] })
  assert.equal(shape.ok, false)
  if (!shape.ok) assert.equal(shape.errors[0].message, ORCID_MESSAGES.format)
})

// ── lib/cvLinks ───────────────────────────────────────────────────────────

test('profileLinks: the ORCID iD comes after GitHub / LinkedIn with its full URI as text; the public payload carries the bare iD', () => {
  const [decorated] = withEvidenceLinks(publicSections([pi({ orcid: URL })], 'cv'), { socials: { linkedin: 'https://www.linkedin.com/in/example/' } })
  assert.equal(decorated.orcid, ID, 'a pasted link is stored / shipped as the bare iD')
  const links = profileLinks(decorated)
  assert.deepEqual(
    links.map((l) => [l.kind, l.label, l.href, l.text]),
    [
      ['github', 'GitHub', 'https://github.com/example-person', 'github.com/example-person'],
      ['linkedin', 'LinkedIn', 'https://www.linkedin.com/in/example/', 'linkedin.com/in/example'],
      ['orcid', 'ORCID', URL, URL],
    ],
  )
  assert.equal(orcidOf(decorated), ID)
  assert.equal(orcidOf(pi({ orcid: '0000-0002-1825-0098' })), '', 'a typo never becomes a link')
  assert.equal(orcidOf(null), '')
})

test('a hidden iD is blank in the public payload and in every link list — there is no fallback to fill it', () => {
  const [hidden] = withEvidenceLinks(publicSections([pi({ hiddenFields: ['orcid'] })], 'cv'), { socials: { github: 'https://github.com/x' } })
  assert.equal(hidden.orcid, '')
  assert.ok(hidden.redacted.includes('orcid'))
  assert.deepEqual(profileLinks(hidden).map((l) => l.kind), ['github'])
  assert.equal(orcidOf(hidden), '')
  // An editor document (hiddenFields still present) behaves the same way.
  assert.equal(orcidOf(pi({ hiddenFields: ['orcid'] })), '')
  assert.deepEqual(allEvidenceLinks([pi({ hiddenFields: ['orcid'] })]).filter((l) => l.kind === 'orcid'), [])
})

// ── Files: model, text, PDF, JSON Resume, vCard ───────────────────────────

function cvSections(extra: Record<string, unknown> = {}, lang: 'en' | 'zh' = 'en') {
  return withEvidenceLinks(publicCvDoc(doc(extra), 'cv')[lang], { socials: null })
}

test('the document model, the plain text and the JSON Resume carry the iD; the PDF prints "ORCID: <URI>" as a link', async () => {
  for (const lang of ['en', 'zh'] as const) {
    const sections = cvSections({}, lang)
    const model = buildCvModel(sections, { lang, now: NOW, updatedAt: Date.UTC(2026, 9, 20), canonical: `https://lucian-dev.com/cv${lang === 'zh' ? '/zh' : ''}` })
    const orcid = model.contacts.profiles.find((p) => p.kind === 'orcid')!
    assert.ok(orcid, lang)
    assert.equal(orcid.href, URL)
    assert.equal(orcid.text, URL)
    const text = renderCvText(model)
    assert.ok(text.includes(lang === 'zh' ? `ORCID：${URL}` : `ORCID: ${URL}`), text.split('\n').slice(0, 6).join(' | '))
    assert.equal(text.split(URL).length, 2, 'the URI is printed once')

    const resume = buildJsonResume(sections, { lang, now: NOW, canonical: 'https://lucian-dev.com/cv.json' }) as any
    const profile = resume.basics.profiles.find((p: any) => p.network === 'ORCID')
    assert.deepEqual(profile, { network: 'ORCID', username: ID, url: URL })

    const drawn: string[] = []
    const pdf = await renderCvPdf(model, { fonts: loadPdfFonts(), onText: (t) => drawn.push(t) })
    assert.ok(pdf.buffer.length > 1000)
    assert.ok(drawn.includes(URL), 'the PDF draws the record URI')
    // The label may be drawn in two runs (the Chinese colon takes the CJK face), so look at the joined text.
    assert.ok(drawn.join('').includes(lang === 'zh' ? `ORCID：${URL}` : `ORCID: ${URL}`), 'with its label')
  }
})

test('the vCard carries URL;TYPE=orcid and X-ORCID (never a SOCIALPROFILE for it); hidden → neither', () => {
  const [open] = cvSections()
  const card = buildVcard(open, null, { profiles: profileLinks(open) })
  assert.ok(card.includes(`URL;TYPE=orcid:${URL}\r\n`), card)
  assert.ok(card.includes(`X-ORCID:${ID}\r\n`))
  assert.ok(!/SOCIALPROFILE[^\r\n]*orcid/i.test(card))
  assert.ok(card.includes('SOCIALPROFILE;SERVICE-TYPE=GitHub:https://github.com/example-person'), 'the other profiles stay')
  const [hidden] = cvSections({ hiddenFields: ['orcid'] })
  const quiet = buildVcard(hidden, null, { profiles: profileLinks(hidden) })
  assert.ok(!quiet.includes(ID) && !/orcid/i.test(quiet))
})

// ── Structured data, llms.txt ─────────────────────────────────────────────

test('the Person node lists the record in sameAs and as an ORCID identifier; the facts come from the public Personal Info', () => {
  const facts = personFactsFromCv(publicCvDoc(doc(), 'website').en)
  assert.equal(facts.orcid, ID)
  const node = personNode(facts) as any
  assert.deepEqual(node.sameAs, [...DEFAULT_SAME_AS, URL])
  assert.deepEqual(node.identifier, { '@type': 'PropertyValue', propertyID: 'ORCID', value: ID, url: URL })
  // The same with an explicit sameAs list, and from a pasted link.
  assert.ok((personNode({ sameAs: ['https://example.com/me'], orcid: URL }) as any).sameAs.includes(URL))
  // Nothing without an iD or with a hidden one.
  const bare = personNode(personFactsFromCv(publicCvDoc(doc({ hiddenFields: ['orcid'] }), 'website').en)) as any
  assert.equal(bare.identifier, undefined)
  assert.ok(!JSON.stringify(bare).includes(ID))
  assert.deepEqual(bare.sameAs, [...DEFAULT_SAME_AS])
  assert.equal((personNode({ orcid: '0000-0002-1825-0098' }) as any).identifier, undefined, 'a typo is not an identifier')
})

test('ScholarlyArticle: with an ORCID the owner is identified by the record URI; co-authors and the no-iD case are unchanged', () => {
  const pub = toPublication(paper(), 0)!
  const owner = ownerNamesFromSections([pi()], [])
  const base = { id: 'https://lucian-dev.com/publications#person2025example', person: personAuthor, owner, origin: 'https://lucian-dev.com' }
  const withId = scholarlyArticleNode(pub, { ...base, orcid: URL }) as any
  assert.deepEqual(
    withId.author.map((a: any) => a['@id'] || a.name),
    [URL, 'Jane Doe'],
  )
  assert.equal(withId.author[0].name, personAuthor.name)
  assert.equal(withId.author[0]['@type'], 'Person')
  const without = scholarlyArticleNode(pub, base) as any
  assert.deepEqual(
    without.author.map((a: any) => a['@id'] || a.name),
    [personAuthor['@id'], 'Jane Doe'],
  )
})

test('llms.txt gets one "ORCID iD" line under the profile only when the URI is given', () => {
  const input: LlmsInput = { siteUrl: 'https://lucian-dev.com', name: 'Example Person', summary: 'Summary.', work: [], posts: [], publications: true, cv: { en: true, zh: false } }
  const without = buildLlmsTxt(input)
  assert.ok(!/orcid/i.test(without))
  const withId = buildLlmsTxt({ ...input, orcid: URL })
  const lines = withId.split('\n')
  const at = lines.indexOf(`- ORCID iD: ${URL}`)
  assert.ok(at > 0, withId)
  assert.ok(lines[at - 1].startsWith('- [Publications]'), 'after the publications line, before Contact')
  assert.ok(lines[at + 1].startsWith('- [Contact]'))
})

// ── Readiness ─────────────────────────────────────────────────────────────

test('readiness: a paper with a DOI and no ORCID iD is a low suggestion pointing at the field; set or hidden → nothing', () => {
  assert.equal(CHECK_SEVERITY['orcid-missing'], 'low')
  assert.equal(CHECK_LABEL['orcid-missing'], 'No ORCID iD')
  const ctx = { now: NOW }
  const missing = runReadinessChecks(doc({ orcid: '' }), ctx).filter((f) => f.check === 'orcid-missing')
  assert.equal(missing.length, 2, 'one per language')
  assert.deepEqual(missing[0].path, [0, 'orcid'])
  assert.equal(missing[0].sectionName, 'personalInformation')
  assert.match(missing[0].title, /DOI/)
  assert.match(missing[0].detail, /orcid\.org/)
  const two = runReadinessChecks(doc({ orcid: '' }, [paper(), paper({ title: 'Second', doi: '10.5555/second' })]), ctx).filter((f) => f.check === 'orcid-missing' && f.lang === 'en')
  assert.match(two[0].title, /^2 papers/)

  const none = (d: ReturnType<typeof doc>) => runReadinessChecks(d, ctx).filter((f) => f.check === 'orcid-missing')
  assert.deepEqual(none(doc()), [], 'an iD is set')
  assert.deepEqual(none(doc({ orcid: '', hiddenFields: ['orcid'] })), [], 'the field is hidden: a decision')
  assert.deepEqual(none(doc({ orcid: '' }, [paper({ doi: '' })])), [], 'no DOI, no suggestion')
  assert.deepEqual(none(doc({ orcid: '' }, [paper({ hiddenFields: ['doi'] })])), [], 'a hidden DOI does not count')
  assert.deepEqual(none(doc({ orcid: '' }, [paper({ isVisible: false })])), [], 'a hidden paper does not count')
  assert.deepEqual(none({ en: [pi({ orcid: '' })], zh: [] }), [], 'no publications section')
})

// ── Leak: hidden means nowhere ────────────────────────────────────────────

test('a hidden ORCID iD reaches none of the outputs: model, text, PDF, JSON Resume, links, vCard, Person node', async () => {
  const fonts = loadPdfFonts()
  for (const lang of ['en', 'zh'] as const) {
    const sections = cvSections({ hiddenFields: ['orcid'] }, lang)
    const model = buildCvModel(sections, { lang, now: NOW, updatedAt: 0, canonical: 'https://lucian-dev.com/cv' })
    const drawn: string[] = []
    await renderCvPdf(model, { fonts, onText: (t) => drawn.push(t) })
    const outputs = [
      JSON.stringify(model),
      renderCvText(model),
      drawn.join('\n'),
      JSON.stringify(buildJsonResume(sections, { lang, now: NOW, canonical: 'https://lucian-dev.com/cv.json' })),
      JSON.stringify(allEvidenceLinks(sections, lang)),
      buildVcard(sections[0], null, { profiles: profileLinks(sections[0]) }),
    ]
    for (const out of outputs) assert.ok(!out.includes(ID) && !/orcid\.org/i.test(out), `${lang}: ${out.slice(0, 80)}`)
  }
  const website = personNode(personFactsFromCv(publicCvDoc(doc({ hiddenFields: ['orcid'] }), 'website').en))
  assert.ok(!JSON.stringify(website).includes(ID))
  // Control: visible, the iD is really there.
  const open = cvSections()
  assert.ok(renderCvText(buildCvModel(open, { lang: 'en', now: NOW, updatedAt: 0, canonical: 'https://lucian-dev.com/cv' })).includes(ID))
})
