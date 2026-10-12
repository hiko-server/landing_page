import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  absUrl,
  breadcrumb,
  ogImageUrl,
  ogLocale,
  personFactsFromCv,
  personNode,
  serializeJsonLd,
  websiteNode,
  withXDefault,
  CV_ALTERNATES,
  SITE_URL,
} from '../lib/schema'

test('serializeJsonLd cannot break out of the script element and stays valid JSON', () => {
  const data = { headline: '</script><script>alert(1)</script> &    >' }
  const out = serializeJsonLd(data)
  assert.ok(!out.includes('<'))
  assert.ok(!out.includes('>'))
  assert.ok(!out.includes('&'))
  assert.ok(!out.includes(' '))
  assert.ok(!out.includes(' '))
  assert.deepEqual(JSON.parse(out), data)
})

test('personNode() without data has no schools, address or skills', () => {
  const p = personNode()
  assert.equal(p['@type'], 'Person')
  assert.equal(p.url, SITE_URL)
  assert.ok(Array.isArray(p.sameAs) && p.sameAs.length > 0)
  assert.equal('alumniOf' in p, false)
  assert.equal('address' in p, false)
  assert.equal('knowsAbout' in p, false)
  // Other no-arg builders keep working.
  assert.equal(websiteNode()['@type'], 'WebSite')
  assert.equal(breadcrumb([{ name: 'Home', path: '/' }]).itemListElement[0].item, `${SITE_URL}/`)
  assert.equal(absUrl(''), SITE_URL)
  assert.equal(absUrl('/x'), `${SITE_URL}/x`)
})

test('personNode normalises caller-supplied public facts and keeps extra keys', () => {
  const p: any = personNode({
    alumniOf: ['School A', { name: 'School B', url: 'https://b.example' }, '  '],
    address: 'City, Region',
    jobTitle: 'Engineer',
    sameAs: ['https://github.com/x', 'https://github.com/x'],
    knowsAbout: ['TypeScript', 'TypeScript', 'Rust'],
    description: 'Hi',
  })
  assert.deepEqual(p.alumniOf, [
    { '@type': 'EducationalOrganization', name: 'School A' },
    { '@type': 'EducationalOrganization', name: 'School B', url: 'https://b.example' },
  ])
  assert.equal(p.address, 'City, Region')
  assert.equal(p.jobTitle, 'Engineer')
  assert.deepEqual(p.sameAs, ['https://github.com/x'])
  assert.deepEqual(p.knowsAbout, ['TypeScript', 'Rust'])
  assert.equal(p.description, 'Hi')
  const withExtra: any = personNode({ email: 'mailto:a@b.c' })
  assert.equal(withExtra.email, 'mailto:a@b.c')
  const postal: any = personNode({ address: { addressCountry: 'HK' } })
  assert.deepEqual(postal.address, { '@type': 'PostalAddress', addressCountry: 'HK' })
})

test('personFactsFromCv reads only what the public (pruned) CV still contains', () => {
  const facts = personFactsFromCv([
    { sessionName: 'personalInformation', address: '', redacted: ['address'] },
    {
      sessionName: 'education',
      educationExperience: [{ schoolName: 'Uni One' }, { schoolName: '' }, { schoolName: 'Uni One' }, { schoolName: 'College Two' }],
    },
    { sessionName: 'skill', languages: [{ language: 'Python' }, { language: '' }], technical: [{ name: 'Web', description: ['React', '', 'Python'] }] },
  ])
  assert.equal(facts.address, undefined)
  assert.deepEqual(facts.alumniOf, ['Uni One', 'College Two'])
  assert.deepEqual(facts.knowsAbout, ['Python', 'React'])
  assert.deepEqual(personFactsFromCv(undefined), {})
  assert.deepEqual(personFactsFromCv([{ sessionName: 'personalInformation', address: 'Somewhere' }]), { address: 'Somewhere' })
})

test('ogImageUrl builds an absolute /api/og URL with kind-specific params', () => {
  const url = new URL(ogImageUrl({ kind: 'blog', title: 'A & B', subtitle: 'x'.repeat(300) }))
  assert.equal(url.origin + url.pathname, `${SITE_URL}/api/og`)
  assert.equal(url.searchParams.get('kind'), 'blog')
  assert.equal(url.searchParams.get('title'), 'A & B')
  assert.equal(url.searchParams.get('subtitle')!.length, 200)
  assert.equal(new URL(ogImageUrl({ kind: 'cv', title: 'CV' })).searchParams.has('subtitle'), false)
})

test('withXDefault adds x-default, absolutises and de-duplicates; CV alternates are complete', () => {
  assert.deepEqual(withXDefault([{ hrefLang: 'en', href: '/cv' }, { hrefLang: 'zh-Hans', href: '/cv?lang=zh' }, { hrefLang: 'en', href: '/x' }]), [
    { hrefLang: 'en', href: `${SITE_URL}/cv` },
    { hrefLang: 'zh-Hans', href: `${SITE_URL}/cv?lang=zh` },
    { hrefLang: 'x-default', href: `${SITE_URL}/cv` },
  ])
  assert.deepEqual(withXDefault(undefined), [])
  assert.deepEqual(
    CV_ALTERNATES.map((a) => a.hrefLang),
    ['en', 'zh-Hans', 'x-default'],
  )
  assert.equal(withXDefault(CV_ALTERNATES).length, 3)
})

test('ogLocale maps page languages', () => {
  assert.equal(ogLocale(undefined), 'en_US')
  assert.equal(ogLocale('zh-Hans'), 'zh_CN')
  assert.equal(ogLocale('zh-Hant'), 'zh_TW')
  assert.equal(ogLocale('ja'), 'ja_JP')
})

test('robots.txt allows social cards but keeps the API and admin out', () => {
  const lines = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
  const allowOg = lines.indexOf('Allow: /api/og')
  const disallowApi = lines.indexOf('Disallow: /api/')
  assert.ok(allowOg >= 0 && disallowApi >= 0)
  // First-match crawlers need the Allow before the broader Disallow.
  assert.ok(allowOg < disallowApi)
  assert.ok(lines.includes('Disallow: /admin'))
})
