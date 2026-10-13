/**
 * E12 — structured contact inquiries: the pure model (lib/inquiry.ts), the
 * form logic (components/Common/contactForm.ts) and the home document's
 * reason → kind mapping (lib/homeShape normalizeHomeWrite, the editor form).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_REASONS,
  INTENT_FIELDS,
  ROLE_URL_ERROR,
  cleanIntentMap,
  hasCustomReasons,
  inquiryRows,
  intentOf,
  normalizeInquiry,
  parseInquiryMeta,
  reasonsOf,
  intentFieldsSummary,
} from '../lib/inquiry'
import { inquiryPayload, privacyNoticeText, validateContact, availabilityView, type ContactValues } from '../components/Common/contactForm'
import { normalizeHomeWrite, type HomeData } from '../lib/homeShape'
import { formFromHome, serializeHome } from '../components/Admin/home/homeForm'


const values = (over: Partial<ContactValues> = {}): ContactValues => ({
  name: 'Ada',
  email: 'ada@example.com',
  reason: 'Hiring',
  subject: '',
  message: 'Hello',
  mathAnswer: '7',
  company: '',
  roleUrl: '',
  timeline: '',
  ...over,
})

test('built-in reasons map to kinds; a custom list uses only the explicit mapping', () => {
  assert.deepEqual(reasonsOf(undefined), [...DEFAULT_REASONS])
  assert.deepEqual(reasonsOf({ reasons: ['  ', ''] }), [...DEFAULT_REASONS], 'blank list = built-in reasons')
  assert.equal(intentOf('Hiring', undefined), 'role')
  assert.equal(intentOf('Project Inquiry', {}), 'freelance')
  assert.equal(intentOf('Collaboration', { reasons: [] }), 'collab')
  assert.equal(intentOf('Mentorship', undefined), 'other')
  // Custom list: never guessed from the label.
  const custom = { reasons: ['Hiring', 'Recruiting', 'Talk'], intents: { Recruiting: 'role', Talk: 'other', Hiring: 'nonsense' } }
  assert.equal(hasCustomReasons(custom), true)
  assert.equal(intentOf('Recruiting', custom), 'role')
  assert.equal(intentOf('Hiring', custom), 'other', 'an unmapped (or invalid) custom reason is other, whatever it says')
  assert.equal(intentOf('Talk', custom), 'other')
  assert.equal(intentOf('', custom), 'other')
})

test('cleanIntentMap keeps only current reasons and real kinds, without the default', () => {
  assert.deepEqual(cleanIntentMap(['A', 'B', 'C'], { A: 'role', B: 'other', C: 'bogus', D: 'freelance' }), { A: 'role' })
  assert.deepEqual(cleanIntentMap(['A'], null), {})
  assert.deepEqual(cleanIntentMap(['A'], ['role']), {})
})

test('normalizeInquiry: caps, strips line breaks, drops what the kind does not ask for', () => {
  const role = normalizeInquiry({
    reason: 'Hiring\r\nBcc: x@y.z',
    intent: 'role',
    company: `  Acme\n${'x'.repeat(300)}`,
    roleUrl: ' https://jobs.example.com/1?ref=a ',
    timeline: '1-3m',
  })
  assert.equal(role.ok, true)
  if (!role.ok) return
  assert.equal(role.meta.reason, 'Hiring Bcc: x@y.z')
  assert.equal(role.meta.intent, 'role')
  assert.ok(role.meta.company!.length <= 120 && !/\n/.test(role.meta.company!))
  assert.equal(role.meta.roleUrl, 'https://jobs.example.com/1?ref=a')
  assert.equal(role.meta.timeline, '1-3m')

  const collab = normalizeInquiry({ intent: 'collab', company: 'Org', roleUrl: 'https://o.example', timeline: 'asap' })
  assert.deepEqual(collab, { ok: true, meta: { intent: 'collab', company: 'Org', roleUrl: 'https://o.example/' } }, 'collab has no timeline')

  const unknown = normalizeInquiry({ intent: 'hack', company: 'X', roleUrl: 'https://x.example', timeline: 'asap' })
  assert.deepEqual(unknown, { ok: true, meta: {} }, 'unknown kinds act as other: no structured fields')

  const badTimeline = normalizeInquiry({ intent: 'role', timeline: 'yesterday' })
  assert.deepEqual(badTimeline, { ok: true, meta: { intent: 'role' } })
})

test('normalizeInquiry refuses links that are not plain https', () => {
  for (const roleUrl of ['http://jobs.example.com', 'javascript:alert(1)', 'https://user:pw@x.example', '//x.example', 'ftp://x', `https://x.example/${'a'.repeat(600)}`]) {
    assert.deepEqual(normalizeInquiry({ intent: 'role', roleUrl }), { ok: false, field: 'roleUrl', error: ROLE_URL_ERROR }, roleUrl)
  }
  assert.equal(normalizeInquiry({ intent: 'other', roleUrl: 'javascript:alert(1)' }).ok, true, 'ignored when the kind has no link field')
})

test('stored meta is read defensively and labelled per kind', () => {
  assert.equal(parseInquiryMeta(null), undefined)
  assert.equal(parseInquiryMeta('x'), undefined)
  assert.equal(parseInquiryMeta({}), undefined)
  assert.deepEqual(parseInquiryMeta({ intent: 'evil', roleUrl: 'javascript:x', company: 42, timeline: 'later' }), undefined)
  const meta = parseInquiryMeta({ reason: 'Project Inquiry', intent: 'freelance', company: 'Acme', roleUrl: 'https://brief.example/x', timeline: 'asap' })
  assert.deepEqual(
    inquiryRows(meta).map((r) => `${r.label}: ${r.value}`),
    ['Reason: Project Inquiry', 'Kind: Freelance project', 'Company or organisation: Acme', 'Brief or project link: https://brief.example/x', 'Timeline: As soon as possible'],
  )
  assert.deepEqual(inquiryRows(undefined), [])
})

test('form validation checks the link only when its field is disclosed', () => {
  assert.deepEqual(validateContact(values({ roleUrl: 'http://x.example' }), 7, 'role'), { roleUrl: ROLE_URL_ERROR })
  assert.deepEqual(validateContact(values({ roleUrl: 'http://x.example' }), 7, 'other'), {}, 'not disclosed: not checked, not sent')
  assert.deepEqual(validateContact(values({ roleUrl: 'https://x.example' }), 7, 'role'), {})
  assert.deepEqual(validateContact(values(), 7), {}, 'the kind defaults to other')
})

test('the payload sends only the disclosed, filled fields', () => {
  const v = values({ reason: ' Hiring ', company: ' Acme ', roleUrl: ' https://x.example ', timeline: 'asap' })
  assert.deepEqual(inquiryPayload(v, 'role'), { reason: 'Hiring', intent: 'role', company: 'Acme', roleUrl: 'https://x.example', timeline: 'asap' })
  assert.deepEqual(inquiryPayload(v, 'collab'), { reason: 'Hiring', intent: 'collab', company: 'Acme', roleUrl: 'https://x.example' })
  assert.deepEqual(inquiryPayload(v, 'other'), { reason: 'Hiring', intent: 'other' })
  assert.deepEqual(INTENT_FIELDS.other, [])
})

test('the privacy notice states the period, or says nothing about it until known', () => {
  assert.match(privacyNoticeText(365), /private inbox/)
  assert.match(privacyNoticeText(365), /deleted automatically after 12 months\.$/)
  assert.match(privacyNoticeText(730), /after 2 years\.$/)
  assert.match(privacyNoticeText(90), /after 3 months\.$/)
  assert.match(privacyNoticeText(45), /after 45 days\.$/)
  assert.match(privacyNoticeText(0), /delete them myself/)
  assert.doesNotMatch(privacyNoticeText(null), /deleted|delete/)
})

test('the availability view carries the English right-to-work line only', () => {
  const view = availabilityView({ status: 'open', workStatus: ' Line\none ', workStatus_zh: '中文' } as never)
  assert.equal(view?.workStatus, 'Line one')
  assert.equal(availabilityView({ status: 'open' })?.workStatus, '')
})

test('the home document keeps a clean reason → kind map; the editor round-trips it', () => {
  const base: HomeData = { hero: { welcome: '', brand: '', tagline: '', avatarUrl: '' }, socials: {}, brands: [], quickAccess: [] }
  const ok = normalizeHomeWrite({ ...base, contact: { reasons: ['Recruiting', 'Chat'], intents: { Recruiting: 'role', Chat: 'other', Gone: 'freelance', Bad: 'x' } as never } })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.deepEqual(ok.home.contact?.intents, { Recruiting: 'role' })
  const defaults = normalizeHomeWrite({ ...base, contact: { reasons: [], intents: { Hiring: 'role' } } })
  assert.equal(defaults.ok, true)
  if (defaults.ok) assert.equal(defaults.home.contact?.intents, undefined, 'the built-in reasons need no stored map')
  const bad = normalizeHomeWrite({ ...base, contact: { reasons: ['A'], intents: ['role'] as never } })
  assert.equal(bad.ok, false)

  const form = formFromHome({ ...base, contact: { reasons: ['Recruiting', 'Chat'], intents: { Recruiting: 'role', Chat: 'collab' } } })
  assert.deepEqual(form.contact.intents, { Recruiting: 'role', Chat: 'collab' })
  form.contact.reasons = ['Recruiting']
  assert.deepEqual(serializeHome(form).contact, { heading: '', blurb: '', eyebrow: '', reasons: ['Recruiting'], intents: { Recruiting: 'role' } }, 'a removed reason loses its kind')
  assert.equal(intentFieldsSummary('role'), 'adds company, job posting link and ideal start')
  assert.equal(intentFieldsSummary('other'), 'no extra fields')
})
