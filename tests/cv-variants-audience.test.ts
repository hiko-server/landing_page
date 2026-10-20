/**
 * E4 — field-, entry- and section-level audiences (lib/cvVisibility), the
 * stable entry uids (lib/cvEntryUid) and how both travel through the
 * registry check (lib/cvValidate), the EN → 中文 sync (lib/cvSync) and the
 * Studio's document operations (components/Admin/cvStudio/docOps).
 * Synthetic data only (Example Person, example.com).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CV_SURFACES,
  audienceOf,
  countAudienceLimits,
  fieldAudience,
  isRedacted,
  normalizeAudience,
  publicCvDoc,
  publicSections,
  withFieldAudience,
  withNodeAudience,
  type CvSurface,
} from '../lib/cvVisibility'
import { isEntryUid, newEntryUid, withEntryUids, withListUids, withSectionUidsBeside } from '../lib/cvEntryUid'
import { applyVariant } from '../lib/cvVariants'
import { validateCvDoc } from '../lib/cvValidate'
import { syncLanguage } from '../lib/cvSync'
import { appendEntries, hasContent, listOp, previewText, setFieldAudience, setNodeAudience, type Doc } from '../components/Admin/cvStudio/docOps'

const PHONE = '+00 0000 ZZ-PHONE'
const ADDRESS = 'ZZ-ADDRESS Example Street'

function doc(): { en: any[]; zh: any[] } {
  const en = [
    {
      sessionName: 'personalInformation',
      firstName: 'Example',
      lastName: 'Person',
      email: 'person@example.com',
      phoneNumber: PHONE,
      address: ADDRESS,
      fieldsOnlyIn: { phoneNumber: ['download', 'private'], address: ['private'] },
    },
    {
      sessionName: 'workExperience',
      experiences: [
        { uid: 'role-a', jobTitle: 'Engineer', companyName: 'Example Co', features: [{ description: 'Shipped ZZ-PUBLIC-WIN' }] },
        { uid: 'role-b', jobTitle: 'ZZ-PRIVATE-ROLE', companyName: 'Quiet Co', onlyIn: ['private'] },
        { uid: 'role-c', jobTitle: 'Intern', companyName: 'Example Lab', features: [{ description: 'ZZ-WEB-ONLY-HIGHLIGHT' }], fieldsOnlyIn: { features: ['web'] } },
      ],
    },
    { sessionName: 'recommendations', items: [{ uid: 'rec-a', quote: 'ZZ-REC', name: 'Ref Person', permission: true }], onlyIn: ['private'] },
  ]
  return { en, zh: JSON.parse(JSON.stringify(en)) }
}

const text = (v: unknown) => JSON.stringify(v)

test('audiences: a field, an entry and a section reach only the surfaces they name', () => {
  const d = doc()
  const web = text(publicCvDoc(d, 'any', 'web'))
  const download = text(publicCvDoc(d, 'any', 'download'))
  const priv = text(publicCvDoc(d, 'any', 'private'))

  assert.ok(!web.includes('ZZ-PHONE'), 'phone off the web')
  assert.ok(download.includes('ZZ-PHONE') && priv.includes('ZZ-PHONE'), 'phone in downloads and private links')
  assert.ok(!web.includes('ZZ-ADDRESS') && !download.includes('ZZ-ADDRESS') && priv.includes('ZZ-ADDRESS'), 'address only in private links')
  assert.ok(!web.includes('ZZ-PRIVATE-ROLE') && !download.includes('ZZ-PRIVATE-ROLE') && priv.includes('ZZ-PRIVATE-ROLE'), 'entry')
  assert.ok(!web.includes('ZZ-REC') && !download.includes('ZZ-REC') && priv.includes('ZZ-REC'), 'section')
  assert.ok(web.includes('ZZ-WEB-ONLY-HIGHLIGHT') && !download.includes('ZZ-WEB-ONLY-HIGHLIGHT') && !priv.includes('ZZ-WEB-ONLY-HIGHLIGHT'), 'nested list')
  assert.ok(web.includes('ZZ-PUBLIC-WIN') && download.includes('ZZ-PUBLIC-WIN') && priv.includes('ZZ-PUBLIC-WIN'), 'unrestricted content everywhere')

  // The metadata and the uids never leave the server.
  for (const out of [web, download, priv]) {
    assert.ok(!out.includes('fieldsOnlyIn') && !out.includes('onlyIn') && !out.includes('"uid"') && !out.includes('role-a'))
  }
})

test('audiences: a field kept off a surface is redacted there (renderers must not fill it from elsewhere)', () => {
  const [pi] = publicSections(doc().en, 'cv', 'web')
  assert.equal(pi.phoneNumber, '')
  assert.ok(isRedacted(pi, 'phoneNumber'))
  const [piPrivate] = publicSections(doc().en, 'cv', 'private')
  assert.equal(piPrivate.phoneNumber, PHONE)
  assert.ok(!isRedacted(piPrivate, 'phoneNumber'))
  // A restricted field with no value yet is still "kept off", not empty.
  const [empty] = publicSections([{ sessionName: 'personalInformation', fieldsOnlyIn: { github: ['private'] } }], 'cv', 'web')
  assert.ok(isRedacted(empty, 'github'))
})

test('audiences: hidden always wins, whatever the audience says', () => {
  const d = doc()
  d.en[0].hiddenFields = ['phoneNumber']
  d.en[1].experiences[1].isVisible = false
  d.en[2].isVisible = false
  for (const surface of CV_SURFACES) {
    const out = text(publicCvDoc(d, 'cv', surface).en)
    assert.ok(!out.includes('ZZ-PHONE'), `${surface}: hidden field`)
    assert.ok(!out.includes('ZZ-PRIVATE-ROLE'), `${surface}: hidden entry`)
    assert.ok(!out.includes('ZZ-REC'), `${surface}: section off the CV`)
  }
  // The section's Website switch still decides /about + home on the web.
  const site = [{ sessionName: 'education', showOnWebsite: false, educationExperience: [{ schoolName: 'ZZ-SCHOOL' }] }]
  assert.equal(publicSections(site, 'website', 'web').length, 0)
  assert.equal(publicSections(site, 'cv', 'web').length, 1)
})

test('audiences: an empty or malformed list means nowhere (the safe reading); unknown surfaces are ignored', () => {
  assert.deepEqual(audienceOf(undefined), null)
  assert.deepEqual(audienceOf([]), [])
  assert.deepEqual(audienceOf('web'), [])
  assert.deepEqual(audienceOf(['private', 'nope', 'web']), ['web', 'private'])
  const nowhere = [{ sessionName: 'personalInformation', firstName: 'Example', phoneNumber: PHONE, fieldsOnlyIn: { phoneNumber: [] } }]
  for (const s of CV_SURFACES) assert.ok(!text(publicSections(nowhere, 'cv', s)).includes('ZZ-PHONE'))
  // A map that is not a map names no field — and is never stored: the registry check refuses it.
  const broken = { en: [{ sessionName: 'personalInformation', phoneNumber: PHONE, fieldsOnlyIn: 'web' }], zh: [] }
  assert.equal(validateCvDoc(broken).ok, false)
  for (const s of CV_SURFACES) assert.ok(!text(publicSections(broken.en, 'cv', s)).includes('fieldsOnlyIn'), 'the metadata itself never ships')
})

test('audiences: the ORCID marker follows the iD off a surface', () => {
  const pi = [{ sessionName: 'personalInformation', orcid: '0000-0002-1825-0097', orcidAuthenticated: { id: '0000-0002-1825-0097', at: '2026-10-01T00:00:00.000Z' }, fieldsOnlyIn: { orcid: ['download'] } }]
  const web = publicSections(pi, 'cv', 'web')[0]
  assert.equal(web.orcid, '')
  assert.equal('orcidAuthenticated' in web, false)
  const dl = publicSections(pi, 'cv', 'download')[0]
  assert.deepEqual(dl.orcidAuthenticated, { id: '0000-0002-1825-0097' })
})

test('audience editing helpers store the smallest form', () => {
  assert.equal(normalizeAudience(['web', 'download', 'private']), null)
  assert.deepEqual(normalizeAudience(['private', 'web']), ['web', 'private'])
  assert.deepEqual(normalizeAudience([]), [])
  const n = withFieldAudience({ a: 1 }, 'phoneNumber', ['download'])
  assert.deepEqual(n, { a: 1, fieldsOnlyIn: { phoneNumber: ['download'] } })
  assert.deepEqual(fieldAudience(n, 'phoneNumber'), ['download'])
  assert.deepEqual(withFieldAudience(n, 'phoneNumber', [...CV_SURFACES]), { a: 1 })
  const e = withNodeAudience({ b: 2 }, ['private'])
  assert.deepEqual(e, { b: 2, onlyIn: ['private'] })
  assert.deepEqual(withNodeAudience(e, null), { b: 2 })
  assert.equal(countAudienceLimits(doc().en), 5)
})

test('the registry check accepts audiences and uids, and names what is wrong', () => {
  assert.equal(validateCvDoc(withEntryUids(doc())).ok, true)
  const bad = doc()
  bad.en[0].fieldsOnlyIn = { phoneNumber: ['web', 'print'] }
  bad.en[1].experiences[0].onlyIn = 'private'
  bad.en[1].experiences[1].uid = 'has spaces'
  bad.en[1].experiences[2].uid = 'role-a'
  const r = validateCvDoc(bad)
  assert.equal(r.ok, false)
  const messages = r.ok ? [] : r.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
  assert.ok(messages.some((m) => m.startsWith('en.0.fieldsOnlyIn.phoneNumber')), messages.join('\n'))
  assert.ok(messages.some((m) => m.startsWith('en.1.experiences.0.onlyIn')))
  assert.ok(messages.some((m) => m.startsWith('en.1.experiences.1.uid') && /malformed/.test(m)))
  assert.ok(messages.some((m) => m.startsWith('en.1.experiences.2.uid') && /repeats/.test(m)))
})

test('uids: deterministic for a stored CV without them, kept once stored, unique per list, shared by EN / 中文 twins', () => {
  const raw = {
    en: [{ sessionName: 'education', educationExperience: [{ schoolName: 'A' }, { schoolName: 'B' }] }, { sessionName: 'personalInformation', firstName: 'Example' }],
    zh: [{ sessionName: 'education', educationExperience: [{ schoolName: '甲' }, { schoolName: '乙' }] }],
  }
  const once = withEntryUids(raw)
  const twice = withEntryUids(JSON.parse(JSON.stringify(raw)))
  assert.deepEqual(once, twice, 'the same stored document always reads the same')
  const uidsOf = (s: any) => s.educationExperience.map((e: any) => e.uid)
  assert.deepEqual(uidsOf(once.en[0]), ['educationExperience-0', 'educationExperience-1'])
  assert.deepEqual(uidsOf(once.zh[0]), uidsOf(once.en[0]))
  assert.equal('uid' in once.en[1], false, 'sections themselves carry none')
  assert.equal(withEntryUids(once), once, 'nothing to fill: the same object')

  // A stored uid moves with its entry; a new entry never takes one in use.
  const moved = [{ uid: 'educationExperience-1', schoolName: 'B' }, { schoolName: 'C' }]
  assert.deepEqual((withListUids(moved, 'educationExperience') as any[]).map((e) => e.uid), ['educationExperience-1', 'educationExperience-1-2'])
  // Duplicates (an import of a hand-edited file) are repaired, deterministically.
  const dup = [{ uid: 'x' }, { uid: 'x' }, { uid: 'x-1' }]
  const fixed = withListUids(dup, 'k') as any[]
  assert.deepEqual(fixed.map((e) => e.uid), ['x', 'x-1-2', 'x-1'])
  assert.deepEqual(withListUids(dup, 'k'), fixed)
  assert.ok(isEntryUid(newEntryUid()) && newEntryUid() !== newEntryUid())
})

test('CV-L-1 uids: EN and 中文 pair by position only where the lists line up; a variant never selects the wrong 中文 entry', () => {
  const role = (t: string) => ({ jobTitle: t, companyName: `${t} Co` })
  // The 中文 CV lacks role A: positions do not pair.
  const misaligned = {
    en: [{ sessionName: 'workExperience', experiences: [role('A'), role('B'), role('C'), role('D')] }],
    zh: [{ sessionName: 'workExperience', experiences: [role('B-zh'), role('C-zh'), role('D-zh-NOT-SELECTED')] }],
  }
  const filled = withEntryUids(misaligned)
  assert.deepEqual(withEntryUids(JSON.parse(JSON.stringify(misaligned))), filled, 'deterministic')
  const enUids = filled.en[0].experiences.map((e: any) => e.uid)
  const zhUids = filled.zh[0].experiences.map((e: any) => e.uid)
  assert.deepEqual(enUids, ['experiences-0', 'experiences-1', 'experiences-2', 'experiences-3'])
  assert.deepEqual(zhUids, ['zh-experiences-0', 'zh-experiences-1', 'zh-experiences-2'])
  assert.equal(enUids.filter((u: string) => zhUids.includes(u)).length, 0, 'no uid shared across unpaired lists')
  // A variant ticking C (EN) prints C in English and nothing wrong in Chinese.
  const variant = { sections: [{ name: 'workExperience', entries: { experiences: [enUids[2]] } }] }
  assert.deepEqual(applyVariant(filled.en, variant)[0].experiences.map((e: any) => e.jobTitle), ['C'])
  assert.deepEqual(applyVariant(filled.zh, variant)[0].experiences, [], 'never D-zh, which the owner left out')

  // Lined up (same length): twins share — the stored uid of the one that has it.
  const aligned = withEntryUids({
    en: [{ sessionName: 'workExperience', experiences: [{ uid: 'u-a', ...role('A') }, role('B')] }],
    zh: [{ sessionName: 'workExperience', experiences: [role('A-zh'), { uid: 'u-b', ...role('B-zh') }] }],
  })
  assert.deepEqual(aligned.en[0].experiences.map((e: any) => e.uid), ['u-a', 'u-b'])
  assert.deepEqual(aligned.zh[0].experiences.map((e: any) => e.uid), ['u-a', 'u-b'])

  // An entry added without a uid after an EN-only delete never takes the uid a different 中文 entry holds.
  const stored = withEntryUids({
    en: [{ sessionName: 'education', educationExperience: [{ schoolName: 'A' }, { schoolName: 'B' }, { schoolName: 'C' }] }],
    zh: [{ sessionName: 'education', educationExperience: [{ schoolName: '甲' }, { schoolName: '乙' }, { schoolName: '丙' }] }],
  })
  const enAfter = [{ ...stored.en[0], educationExperience: [stored.en[0].educationExperience[0], { schoolName: 'D' }] }]
  const zhAfter = [{ ...stored.zh[0], educationExperience: [...stored.zh[0].educationExperience, { schoolName: '丁' }] }]
  const next = withEntryUids({ en: enAfter, zh: zhAfter })
  const nextEn = next.en[0].educationExperience.map((e: any) => e.uid)
  const nextZh = next.zh[0].educationExperience.map((e: any) => e.uid)
  assert.equal(nextEn[0], 'educationExperience-0')
  assert.ok(!nextZh.slice(1).includes(nextEn[1]), `D (${nextEn[1]}) shares no uid with 乙 / 丙 / 丁 (${nextZh.join(', ')})`)

  // A one-language import is filled against the other language as it is: no rebinding by position when it does not line up.
  const imported = withSectionUidsBeside([{ sessionName: 'workExperience', experiences: [role('New'), role('B'), role('C'), role('D'), role('E')] }], 'en', filled.zh)
  assert.ok(imported[0].experiences.every((e: any) => !zhUids.includes(e.uid)))
})

test('sync EN → 中文: the twin takes EN’s uid; audiences merge to what both languages allow', () => {
  const en = [
    {
      sessionName: 'workExperience',
      onlyIn: ['web', 'private'],
      experiences: [{ uid: 'u-en', jobTitle: 'Engineer', fieldsOnlyIn: { location: ['private', 'download'] }, onlyIn: ['private', 'download'] }],
    },
  ]
  const zh = [
    {
      sessionName: 'workExperience',
      onlyIn: ['private'],
      experiences: [{ uid: 'u-zh', jobTitle: '工程师', fieldsOnlyIn: { location: ['private'], companyName: ['web'] } }],
    },
  ]
  const [synced] = syncLanguage(en, zh)
  assert.deepEqual(synced.onlyIn, ['private'])
  assert.equal(synced.experiences[0].uid, 'u-en')
  assert.equal(synced.experiences[0].jobTitle, '工程师')
  assert.deepEqual(synced.experiences[0].onlyIn, ['download', 'private'])
  assert.deepEqual(synced.experiences[0].fieldsOnlyIn, { location: ['private'], companyName: ['web'] })
})

test('Studio: created entries get one fresh uid shared with the 中文 twin; a copy gets its own', () => {
  const base: Doc = {
    en: [{ sessionName: 'project', projectExperience: [{ uid: 'p1', title: 'One' }] }],
    zh: [{ sessionName: 'project', projectExperience: [{ uid: 'p1', title: '一' }] }],
  }
  const inserted = listOp(base, 'en', [0, 'projectExperience'], { type: 'insert', index: 1, item: { title: '' } }, true)
  assert.equal(inserted.reached, true)
  const uidEn = inserted.doc.en[0].projectExperience[1].uid
  assert.ok(isEntryUid(uidEn) && uidEn !== 'p1')
  assert.equal(inserted.doc.zh[0].projectExperience[1].uid, uidEn)

  const dup = listOp(inserted.doc, 'en', [0, 'projectExperience'], { type: 'duplicate', index: 0 }, true)
  const copy = dup.doc.en[0].projectExperience[1]
  assert.equal(copy.title, 'One')
  assert.notEqual(copy.uid, 'p1')
  assert.equal(dup.doc.zh[0].projectExperience[1].uid, copy.uid)

  const appended = appendEntries(base, 'en', [0, 'projectExperience'], [{ title: 'Paper-like' }], true)
  assert.equal(appended.doc.en[0].projectExperience[1].uid, appended.doc.zh[0].projectExperience[1].uid)

  // Nested lists (highlights) carry no uid.
  const nested = listOp(base, 'en', [0, 'projectExperience', 0, 'features'], { type: 'insert', index: 0, item: { description: '' } }, false)
  assert.equal('uid' in nested.doc.en[0].projectExperience[0].features[0], false)

  // The uid is bookkeeping, never "content" (no "delete in both?" question for an empty entry).
  assert.equal(hasContent({ uid: 'u1', description: '' }), false)
  assert.equal(previewText({ uid: 'u1', title: 'Shown' }), 'Shown')
})

test('Studio: audience edits are linked like hides', () => {
  const base: Doc = doc() as Doc
  const r = setFieldAudience(base, 'en', [0], 'email', ['private'], true)
  assert.equal(r.reached, true)
  assert.deepEqual(r.doc.zh[0].fieldsOnlyIn.email, ['private'])
  const s = setNodeAudience(r.doc, 'en', [1, 'experiences', 0], ['download'] as CvSurface[], false)
  assert.deepEqual(s.doc.en[1].experiences[0].onlyIn, ['download'])
  assert.equal('onlyIn' in s.doc.zh[1].experiences[0], false)
})
