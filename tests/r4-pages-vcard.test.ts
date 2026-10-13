import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicSections } from '../lib/cvVisibility'
import {
  buildVcard,
  currentRoleFrom,
  escapeVcardText,
  foldVcardLine,
  vcardDisplayName,
} from '../lib/vcard'

const octets = (s: string) => new TextEncoder().encode(s).length
/** Content lines with folding undone (RFC 6350 §3.2). */
const unfold = (card: string) => card.replace(/\r\n /g, '').split('\r\n').filter(Boolean)

const personal = {
  sessionName: 'personalInformation',
  firstName: 'Yanpei',
  lastName: 'Li',
  nickName: 'Lucian',
  email: 'hello@lucian-dev.com',
  phoneNumber: '+852 5555 0100',
  address: 'Kowloon, Hong Kong',
}

test('TEXT values are escaped per RFC 6350', () => {
  assert.equal(escapeVcardText('a\\b'), 'a\\\\b')
  assert.equal(escapeVcardText('one, two; three'), 'one\\, two\\; three')
  assert.equal(escapeVcardText('line 1\nline 2\r\nline 3'), 'line 1\\nline 2\\nline 3')
})

test('long lines fold at 75 octets without splitting multi-byte characters', () => {
  const ascii = `NOTE:${'x'.repeat(200)}`
  const folded = foldVcardLine(ascii)
  const lines = folded.split('\r\n')
  assert.ok(lines.length > 1)
  assert.ok(
    lines.every((l) => octets(l) <= 75),
    'every physical line ≤ 75 octets'
  )
  assert.ok(
    lines.slice(1).every((l) => l.startsWith(' ')),
    'continuations start with a space'
  )
  assert.equal(folded.replace(/\r\n /g, ''), ascii)

  const cjk = `NOTE:${'李彦霈'.repeat(30)}`
  const cjkLines = foldVcardLine(cjk).split('\r\n')
  assert.ok(cjkLines.every((l) => octets(l) <= 75))
  // Each physical line is still valid UTF-8 text (no character cut in half).
  for (const l of cjkLines) assert.ok(!l.includes('�'))
  assert.equal(foldVcardLine(cjk).replace(/\r\n /g, ''), cjk)
  assert.equal(foldVcardLine('FN:Short'), 'FN:Short')
})

test('a full card: CRLF lines, FN from the public name fields, contact data and photo', () => {
  const card = buildVcard(
    personal,
    { title: 'Software Engineer', org: 'Acme, Inc.' },
    { photoUrl: 'https://lucian-dev.com/uploads/me.jpg' }
  )
  assert.ok(card.endsWith('\r\n'))
  assert.ok(!/[^\r]\n/.test(card), 'only CRLF line endings')
  const lines = unfold(card)
  assert.equal(lines[0], 'BEGIN:VCARD')
  assert.equal(lines[1], 'VERSION:4.0')
  assert.equal(lines.at(-1), 'END:VCARD')
  assert.ok(lines.includes('FN:Li Yanpei (Lucian)'))
  assert.ok(lines.includes('N:Li;Yanpei;;;'))
  assert.ok(lines.includes('NICKNAME:Lucian'))
  assert.ok(lines.includes('EMAIL;TYPE=work:hello@lucian-dev.com'))
  assert.ok(lines.includes('TEL;TYPE=cell:+852 5555 0100'))
  assert.ok(lines.includes('URL:https://lucian-dev.com'))
  assert.ok(lines.includes('TITLE:Software Engineer'))
  assert.ok(lines.includes('ORG:Acme\\, Inc.'))
  assert.ok(lines.includes('ADR:;;Kowloon\\, Hong Kong;;;;'))
  assert.ok(lines.includes('PHOTO;MEDIATYPE=image/jpeg:https://lucian-dev.com/uploads/me.jpg'))
})

test('a hidden phone (or e-mail) never appears in the card', () => {
  const [pruned] = publicSections([{ ...personal, hiddenFields: ['phoneNumber', 'email'] }], 'cv')
  const card = buildVcard(pruned, null)
  assert.ok(!card.includes('TEL'))
  assert.ok(!card.includes('5555'))
  assert.ok(!card.includes('EMAIL'))
  assert.ok(!card.includes('hello@'))
  // Editor documents (hiddenFields still present) are honoured as well.
  assert.ok(!buildVcard({ ...personal, hiddenFields: ['phoneNumber'] }).includes('TEL'))
})

test('TITLE / ORG only for a role without an end date', () => {
  const now = '2026-10'
  const ended = {
    sessionName: 'workExperience',
    experiences: [
      { jobTitle: 'Engineer', companyName: 'Past Co', startDate: '2022-01', endDate: '2024-06' },
      { jobTitle: 'Intern', companyName: 'Older Co', startDate: '2020-06', endDate: '2020-09' },
    ],
  }
  assert.equal(currentRoleFrom(ended, now), null)
  const card = buildVcard(personal, currentRoleFrom(ended, now))
  assert.ok(!card.includes('TITLE'))
  assert.ok(!card.includes('ORG'))

  const current = {
    sessionName: 'workExperience',
    experiences: [
      { jobTitle: 'Engineer', companyName: 'Past Co', startDate: '2022-01', endDate: '2024-06' },
      { jobTitle: 'Lead', companyName: 'Now Co', startDate: '2025-01', endDate: 'Present' },
    ],
  }
  assert.deepEqual(currentRoleFrom(current, now), { title: 'Lead', org: 'Now Co' })
  assert.deepEqual(
    currentRoleFrom(
      { experiences: [{ jobTitle: 'Founder', companyName: 'Open Co', startDate: '2024-01' }] },
      now
    ),
    {
      title: 'Founder',
      org: 'Open Co',
    }
  )
})

test('a hidden end date or a future start is never treated as current', () => {
  const now = '2026-10'
  const hiddenEnd = publicSections(
    [
      {
        sessionName: 'workExperience',
        experiences: [
          {
            jobTitle: 'Secret',
            companyName: 'Hidden',
            startDate: '2020-01',
            endDate: '2021-01',
            hiddenFields: ['endDate'],
          },
        ],
      },
    ],
    'cv'
  )[0]
  assert.equal(currentRoleFrom(hiddenEnd, now), null)
  const future = {
    experiences: [
      { jobTitle: 'Next', companyName: 'Future Inc', startDate: '2027-03', endDate: 'present' },
    ],
  }
  assert.equal(currentRoleFrom(future, now), null)
  const off = {
    experiences: [
      {
        jobTitle: 'Off',
        companyName: 'Switched Off',
        startDate: '2025-01',
        endDate: 'present',
        isVisible: false,
      },
    ],
  }
  assert.equal(currentRoleFrom(off, now), null)
})

test('display name falls back sensibly and photos need https', () => {
  assert.equal(vcardDisplayName({ firstName: 'Yanpei', lastName: 'Li' }), 'Li Yanpei')
  assert.equal(vcardDisplayName({ nickName: 'Lucian' }), 'Lucian')
  assert.equal(vcardDisplayName(null), 'Li Yanpei (Lucian)')
  const minimal = unfold(buildVcard(null))
  assert.ok(minimal.includes('FN:Li Yanpei (Lucian)'))
  assert.ok(!minimal.some((l) => l.startsWith('N:')))
  assert.ok(
    !buildVcard(personal, null, { photoUrl: 'http://insecure.example/me.jpg' }).includes('PHOTO')
  )
  assert.ok(
    buildVcard(personal, null, { photoUrl: 'https://cdn.example/me' }).includes(
      'PHOTO:https://cdn.example/me'
    )
  )
  assert.ok(
    buildVcard(personal, null, { photoUrl: 'https://x.example/a.png?v=2' }).includes(
      'PHOTO;MEDIATYPE=image/png:'
    )
  )
})
