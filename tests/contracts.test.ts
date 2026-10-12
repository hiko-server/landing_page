import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeHref } from '../lib/cvFormat'
import { isRedacted, publicSections } from '../lib/cvVisibility'

test('safeHref allows web, mail, tel and same-site links', () => {
  assert.equal(safeHref('https://a.com/x'), 'https://a.com/x')
  assert.equal(safeHref('HTTP://a.com'), 'HTTP://a.com')
  assert.equal(safeHref('lucian-dev.com/cv'), 'https://lucian-dev.com/cv')
  assert.equal(safeHref('mailto:hi@a.com'), 'mailto:hi@a.com')
  assert.equal(safeHref('tel:+85212345678'), 'tel:+85212345678')
  assert.equal(safeHref('/work/swcs'), '/work/swcs')
})

test('safeHref refuses script-capable and malformed links', () => {
  for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.com', 'not a url', '', 42, null]) {
    assert.equal(safeHref(bad), '', String(bad))
  }
})

test('pruning lists hidden field names in `redacted` and isRedacted reads it', () => {
  const [sec] = publicSections([
    { sessionName: 'workExperience', experiences: [{ companyName: 'A', endDate: '2023-05', hiddenFields: ['endDate'] }, { companyName: 'B', endDate: '' }] },
  ])
  const [a, b] = sec.experiences
  assert.equal(a.endDate, '')
  assert.deepEqual(a.redacted, ['endDate'])
  assert.equal(isRedacted(a, 'endDate'), true)
  assert.equal(isRedacted(b, 'endDate'), false)
  assert.equal('hiddenFields' in a, false)
  // Full editor documents answer from hiddenFields directly.
  assert.equal(isRedacted({ hiddenFields: ['gpa'] }, 'gpa'), true)
})

test('a smuggled `redacted` key in stored data is never passed through', () => {
  const [sec] = publicSections([{ sessionName: 'education', educationExperience: [{ schoolName: 'X', redacted: ['<script>'] }] }])
  assert.equal('redacted' in sec.educationExperience[0], false)
})

test('publicHome drops hidden photos and data of switched-off sections', async () => {
  const { publicHome } = await import('../lib/homeShape')
  const home: any = {
    hero: { brand: 'B', tagline: 't', welcome: '', avatarUrl: '' },
    socials: {},
    brands: [{ name: 'X', href: '', image: '' }],
    quickAccess: [],
    photos: [{ url: '/a.jpg' }, { url: '/b.jpg', visible: false }],
    sections: { brands: false },
    contact: { heading: 'Hi' },
  }
  const out = publicHome(home)!
  assert.deepEqual(out.photos, [{ url: '/a.jpg' }])
  assert.deepEqual(out.brands, [])
  assert.deepEqual(out.contact, { heading: 'Hi' })
  assert.equal(out.sections?.brands, false)
  assert.equal(publicHome(null), null)
})
