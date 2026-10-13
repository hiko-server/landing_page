import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  absUrl,
  articleImages,
  blogPostingNode,
  caseStudyNode,
  clampDescription,
  composeTitle,
  isoWithTz,
  personAuthor,
  profilePageNode,
  breadcrumb,
  ogImageUrl,
  ogLocale,
  personFactsFromCv,
  personNode,
  serializeJsonLd,
  websiteNode,
  withXDefault,
  CV_ALTERNATES,
  PERSON_ID,
  SITE_URL,
  WEBSITE_ID,
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
  assert.equal(CV_ALTERNATES[1].href, `${SITE_URL}/cv/zh`)
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

test('article JSON-LD: resolvable author, image array, dates with the +08:00 offset', () => {
  const card = { kind: 'blog' as const, title: 'Post', date: '2026-05-30', mins: 4 }
  const post: any = blogPostingNode({
    path: '/blog/post',
    title: 'Post',
    description: 'About it',
    lang: 'en',
    images: articleImages(card, '/uploads/cover.jpg'),
    keywords: ['Edge AI'],
    datePublished: '2026-05-30',
    dateModified: '2026-06-01',
  })
  assert.equal(post['@type'], 'BlogPosting')
  assert.equal(post.author.name, 'Li Yanpei (Lucian)')
  assert.equal(post.author['@id'], PERSON_ID)
  assert.equal(post.author.url, `${SITE_URL}/about`)
  assert.deepEqual(post.publisher, personAuthor)
  assert.ok(Array.isArray(post.image) && post.image.length === 3)
  assert.equal(post.image[0], `${SITE_URL}/uploads/cover.jpg`)
  assert.equal(new URL(post.image[2]).searchParams.get('size'), 'square')
  assert.equal(new URL(post.image[1]).searchParams.has('size'), false)
  assert.equal(post.datePublished, '2026-05-30T00:00:00+08:00')
  assert.equal(post.dateModified, '2026-06-01T00:00:00+08:00')
  assert.equal(post.keywords, 'Edge AI')

  const work: any = caseStudyNode({ path: '/work/x', title: 'X', lang: 'zh-Hans', images: articleImages({ kind: 'work', title: 'X' }), sameAs: ['https://x.example'] })
  assert.equal(work.author.name, 'Li Yanpei (Lucian)')
  assert.equal(work.image.length, 2)
  assert.deepEqual(work.sameAs, ['https://x.example'])
  assert.equal('description' in work, false)
})

test('isoWithTz appends the site offset to bare dates only', () => {
  assert.equal(isoWithTz('2026-05-30'), '2026-05-30T00:00:00+08:00')
  assert.equal(isoWithTz('2026-05-30T10:00:00Z'), '2026-05-30T10:00:00Z')
  assert.equal(isoWithTz(''), '')
  assert.equal(isoWithTz(undefined), '')
})

test('person, website and profile-page nodes', () => {
  const p: any = personNode({ alternateName: ['李彦霈', 'Lucian', ' '] })
  assert.deepEqual(p.alternateName, ['Lucian', '李彦霈'])
  assert.deepEqual((personNode() as any).alternateName, ['Lucian'])
  const site: any = websiteNode({ name: undefined })
  assert.equal(site.url, `${SITE_URL}/`)
  assert.equal(site.name, 'Li Yanpei (Lucian)')
  assert.deepEqual(site.alternateName, ['lucian-dev.com'])
  assert.equal((websiteNode({ name: 'Lucian builds' }) as any).name, 'Lucian builds')
  const profile: any = profilePageNode({ path: '/about', dateModified: '2026-05-01' })
  assert.equal(profile['@type'], 'ProfilePage')
  assert.deepEqual(profile.mainEntity, { '@id': PERSON_ID })
  assert.deepEqual(profile.isPartOf, { '@id': WEBSITE_ID })
  assert.equal(profile.url, `${SITE_URL}/about`)
  assert.equal(profile.dateModified, '2026-05-01T00:00:00+08:00')
})

test('composeTitle names the owner; zh pages use the Chinese name', () => {
  assert.equal(composeTitle({ home: true }), 'Li Yanpei (Lucian) — Software Engineer')
  assert.equal(composeTitle({ home: true, jobTitle: 'ML Engineer' }), 'Li Yanpei (Lucian) — ML Engineer')
  assert.equal(composeTitle({ title: '  Writing  ' }), 'Writing · Li Yanpei')
  assert.equal(composeTitle({ title: '简历', lang: 'zh-Hans', nameZh: '李彦霈' }), '简历 · 李彦霈')
  assert.equal(composeTitle({ title: '简历', lang: 'zh-Hans' }), '简历 · Li Yanpei')
  assert.equal(composeTitle({ title: '', fallback: 'lucian-dev.com' }), 'lucian-dev.com')
})

test('clampDescription: ≤155 chars at a boundary, short ones fall back', () => {
  const long = `${'First sentence is here. '.repeat(4)}${'word '.repeat(40)}`
  const out = clampDescription(long)
  assert.ok(Array.from(out).length <= 155)
  assert.ok(out.endsWith('.'), out)
  const words = clampDescription('word '.repeat(60))
  assert.ok(words.endsWith('…') && !words.endsWith(' …'))
  assert.ok(Array.from(words).length <= 155)
  assert.equal(clampDescription('Too short.', 'A much longer first paragraph that explains what the article is about in detail.'), 'A much longer first paragraph that explains what the article is about in detail.')
  assert.equal(clampDescription('  spaced \n  out  '), 'spaced out')
})
