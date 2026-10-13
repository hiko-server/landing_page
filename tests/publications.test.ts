/**
 * Publications (lib/publications): DOI handling, the owner's name in EN and
 * ZH author lists, ordering, visibility (hidden fields, entries and authors),
 * BibTeX, APA 7, citation keys, JSON-LD, JSON Resume and validation.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  apaAuthors,
  apaName,
  baseCitationKey,
  bibtexName,
  bibtexType,
  citationKeys,
  doiUrl,
  escapeBibtex,
  formatCitationParts,
  formatDetails,
  isOwnerName,
  isValidDoi,
  normalizeDoi,
  ownerNamesFrom,
  ownerNamesFromSections,
  parseName,
  protectCase,
  publicPublications,
  publicationHref,
  sameDoi,
  scholarlyArticleNode,
  sortPublications,
  statusLabel,
  textLang,
  toApa,
  toBibtex,
  toBibtexAll,
  toJsonResume,
  toPublication,
  type Publication,
} from '../lib/publications'
import { HIDDEN_ITEM_MARK, publicSections } from '../lib/cvVisibility'
import { validateCvDoc } from '../lib/cvValidate'
import { SECTION_BY_NAME, blankSection } from '../lib/cvSections'

const OWNER = ownerNamesFrom([
  { firstName: 'Yanpei', lastName: 'Li', nickName: 'Lucian' },
  { firstName: '彦霈', lastName: '李', nickName: 'Lucian' },
])

/** A publication with defaults; only what a test cares about is given. */
function pub(over: Partial<Publication> = {}): Publication {
  return {
    index: 0,
    title: 'Deep learning for tiny devices',
    authors: [
      { name: 'Yanpei Li', hidden: false },
      { name: 'Jane Doe', hidden: false },
    ],
    venue: 'Journal of Embedded Systems',
    venueType: 'journal',
    status: 'published',
    date: '2025-03',
    year: '2025',
    volume: '12',
    issue: '3',
    pages: '45-67',
    publisher: 'ACM',
    doi: '10.1145/3290605.3300857',
    url: '',
    pdfUrl: '',
    codeUrl: '',
    slidesUrl: '',
    abstract: '',
    keywords: [],
    award: '',
    ...over,
  }
}

// ── DOI ──────────────────────────────────────────────────────────────────

test('DOIs are recognised in every pasted shape and resolved through https://doi.org', () => {
  for (const raw of [
    '10.1145/3290605.3300857',
    'doi:10.1145/3290605.3300857',
    'DOI: 10.1145/3290605.3300857',
    'https://doi.org/10.1145/3290605.3300857',
    'http://dx.doi.org/10.1145/3290605.3300857',
    ' 10.1145/3290605.3300857. ',
  ]) {
    assert.equal(normalizeDoi(raw), '10.1145/3290605.3300857', raw)
  }
  for (const bad of ['', '10.12/abc', '11.1145/abc', 'not a doi', '10.1145/', '10.1145 /abc', 42, null]) {
    assert.equal(normalizeDoi(bad), '', String(bad))
    assert.equal(isValidDoi(bad), false)
  }
  assert.equal(doiUrl('10.1145/3290605.3300857'), 'https://doi.org/10.1145/3290605.3300857')
  // Characters a URL cannot carry are encoded; path-safe ones stay readable.
  assert.equal(doiUrl('10.1002/(SICI)1097-4571(199806)49:8<693::AID-ASI4>3.0.CO;2-0'), 'https://doi.org/10.1002/(SICI)1097-4571(199806)49:8%3C693::AID-ASI4%3E3.0.CO;2-0')
  assert.equal(doiUrl('10.1000/a#b?c'), 'https://doi.org/10.1000/a%23b%3Fc')
  assert.equal(normalizeDoi('https://doi.org/10.1000/a%23b'), '10.1000/a#b')
  assert.equal(doiUrl('nope'), '')
  assert.equal(sameDoi('10.1145/ABC', 'https://doi.org/10.1145/abc'), true)
  assert.equal(sameDoi('', ''), false)
})

test('publication links are https:// or same-site paths only', () => {
  assert.equal(publicationHref('https://arxiv.org/abs/2501.00001'), 'https://arxiv.org/abs/2501.00001')
  assert.equal(publicationHref('arxiv.org/abs/2501.00001'), 'https://arxiv.org/abs/2501.00001')
  assert.equal(publicationHref('/uploads/paper.pdf'), '/uploads/paper.pdf')
  for (const bad of ['http://example.com/a.pdf', 'javascript:alert(1)', 'data:text/html,x', '//evil.example/x', 'mailto:a@b.c', 'tel:123', 'not a url']) {
    assert.equal(publicationHref(bad), '', bad)
  }
})

// ── Names ────────────────────────────────────────────────────────────────

test('the owner is recognised in the usual EN and ZH author forms — from Personal Info, never hard-coded', () => {
  for (const name of [
    'Yanpei Li',
    'Li, Yanpei',
    'Li Yanpei',
    'LI Yanpei',
    'YANPEI LI',
    'Y. Li',
    'Li, Y.',
    'Li Y',
    'Lucian Li',
    'Yanpei Li*',
    'Yanpei Li†',
    'Yanpei Li¹',
    'Yanpei (Lucian) Li',
    'Yánpei Lí',
    '李彦霈',
    '李 彦霈',
  ]) {
    assert.equal(isOwnerName(name, OWNER), true, name)
  }
  for (const name of ['Yi Li', 'Jane Doe', 'Li Wei', 'Wei Li', 'Y. Lin', 'Lucian Smith', '李伟', '', HIDDEN_ITEM_MARK]) {
    assert.equal(isOwnerName(name, OWNER), false, name)
  }
  // A two-part given name also matches its two initials.
  const twoPart = ownerNamesFrom([{ firstName: 'Yan-Pei', lastName: 'Li' }])
  for (const name of ['Y.-P. Li', 'Y. P. Li', 'YP Li', 'Li YP', 'Yanpei Li', 'Yan Pei Li', 'Y. Li']) assert.equal(isOwnerName(name, twoPart), true, name)
  // Nothing in Personal Info: nobody is emphasised.
  assert.equal(isOwnerName('Yanpei Li', ownerNamesFrom([])), false)
})

test('owner names come from the public Personal Info; a hidden name is not used', () => {
  const en = [{ sessionName: 'personalInformation', firstName: 'Yanpei', lastName: 'Li', nickName: 'Lucian', hiddenFields: ['nickName'] }]
  const zh = [{ sessionName: 'personalInformation', firstName: '彦霈', lastName: '李' }]
  const pub = ownerNamesFromSections(publicSections(en, 'cv'), publicSections(zh, 'cv'))
  assert.equal(isOwnerName('Yanpei Li', pub), true)
  assert.equal(isOwnerName('李彦霈', pub), true)
  assert.equal(isOwnerName('Lucian Li', pub), false, 'the hidden preferred name is not a variant')
})

test('name forms for APA and BibTeX', () => {
  assert.deepEqual(parseName('Li, Yanpei*'), { display: 'Li, Yanpei', given: ['Yanpei'], family: 'Li', cjk: false, inverted: true })
  assert.equal(apaName('Yanpei Li'), 'Li, Y.')
  assert.equal(apaName('Li, Yan-Pei'), 'Li, Y.-P.')
  assert.equal(apaName('Jean Paul Sartre'), 'Sartre, J. P.')
  assert.equal(apaName('李彦霈'), '李彦霈')
  assert.equal(apaName('Plato'), 'Plato')
  assert.equal(bibtexName('Yanpei Li'), 'Li, Yanpei')
  assert.equal(bibtexName('Li, Yanpei'), 'Li, Yanpei')
  assert.equal(bibtexName('李彦霈'), '李彦霈')
  assert.equal(bibtexName('Barnes and Noble'), '{Barnes and Noble}')
})

// ── Normalisation, visibility, ordering ──────────────────────────────────

const doc = (papers: any[], extra: Record<string, any> = {}) => [{ sessionName: 'publications', headerName: 'Publications', papers, ...extra }]

test('an entry renders only with a title and a real status; values are trimmed and normalised', () => {
  assert.equal(toPublication({ title: '', status: 'published' }, 0), null)
  assert.equal(toPublication({ title: 'X', status: '' }, 0), null, 'no status chosen: never shown as published')
  assert.equal(toPublication({ title: 'X', status: 'Published' }, 0), null, 'statuses are exact values')
  const p = toPublication(
    {
      title: '  A   paper ',
      status: 'accepted',
      authors: ['Yanpei Li', ' ', 'Jane Doe'],
      date: '2026-13',
      doi: 'https://doi.org/10.1234/abcd',
      url: 'javascript:alert(1)',
      pdfUrl: '/uploads/a.pdf',
      keywords: ['vision', '', 'edge'],
      venueType: 'magazine',
    },
    3,
  )
  assert.ok(p)
  assert.equal(p.title, 'A paper')
  assert.deepEqual(p.authors.map((a) => a.name), ['Yanpei Li', 'Jane Doe'])
  assert.equal(p.date, '', 'an impossible month is dropped')
  assert.equal(p.doi, '10.1234/abcd')
  assert.equal(p.url, '', 'unsafe link refused')
  assert.equal(p.pdfUrl, '/uploads/a.pdf')
  assert.deepEqual(p.keywords, ['vision', 'edge'])
  assert.equal(p.venueType, '')
  assert.equal(p.index, 3)
})

test('hidden fields, entries, keywords and the whole list never render; a hidden author keeps its place', () => {
  const papers = [
    { title: 'Visible', status: 'published', date: '2024', doi: '10.1234/secret', hiddenFields: ['doi'], authors: ['Jane Doe', 'SECRET COAUTHOR', 'Yanpei Li'], hiddenItems: { authors: [1] }, keywords: ['public', 'SECRET-KW'] },
    { title: 'SECRET PAPER', status: 'published', isVisible: false },
  ]
  papers[0] = { ...papers[0], hiddenItems: { authors: [1], keywords: [1] } } as any
  for (const sections of [doc(papers), publicSections(doc(papers), 'cv'), publicSections(doc(papers), 'website')]) {
    const list = publicPublications(sections)
    assert.equal(list.length, 1)
    const [p] = list
    assert.equal(p.doi, '')
    assert.deepEqual(p.authors, [
      { name: 'Jane Doe', hidden: false },
      { name: '', hidden: true },
      { name: 'Yanpei Li', hidden: false },
    ])
    assert.deepEqual(p.keywords, ['public'])
    assert.ok(!JSON.stringify(list).includes('SECRET'))
  }
  // The public payload itself carries only the placeholder.
  const pruned = JSON.stringify(publicSections(doc(papers), 'any'))
  assert.ok(!pruned.includes('SECRET'))
  assert.ok(pruned.includes(`"${HIDDEN_ITEM_MARK}"`))
  // Every author hidden → no author line at all.
  assert.deepEqual(publicPublications(doc([{ title: 'T', status: 'preprint', authors: ['A B', 'C D'], hiddenItems: { authors: [0, 1] } }]))[0].authors, [])
  // Whole list hidden, section off the website.
  assert.deepEqual(publicPublications(publicSections(doc(papers, { hiddenFields: ['papers'] }), 'cv')), [])
  assert.deepEqual(publicPublications(publicSections(doc(papers, { showOnWebsite: false }), 'website')), [])
  assert.equal(publicPublications(publicSections(doc(papers, { showOnWebsite: false }), 'cv')).length, 1)
  assert.deepEqual(publicPublications([]), [])
  assert.deepEqual(publicPublications(null), [])
})

test('ordering: status (published → in press → accepted → under review → preprint), then newest first, ties keep the owner order', () => {
  const list = sortPublications([
    pub({ index: 0, status: 'preprint', date: '2026-01' }),
    pub({ index: 1, status: 'published', date: '2023' }),
    pub({ index: 2, status: 'under-review', date: '2025-05' }),
    pub({ index: 3, status: 'published', date: '2024-02' }),
    pub({ index: 4, status: 'accepted', date: '' }),
    pub({ index: 5, status: 'in-press', date: '2025' }),
    pub({ index: 6, status: 'published', date: '2024' }),
    pub({ index: 7, status: 'published', date: '2024-02' }),
    pub({ index: 8, status: 'published', date: '' }),
  ])
  assert.deepEqual(
    list.map((p) => p.index),
    [6, 3, 7, 1, 8, 5, 4, 2, 0],
  )
})

// ── Display parts ────────────────────────────────────────────────────────

test('citation parts: the owner emphasised, status labelled EN/ZH, no venue while under review', () => {
  const parts = formatCitationParts(pub(), 'en', OWNER)
  assert.deepEqual(parts.authors.map((a) => a.self), [true, false])
  assert.equal(parts.hasSelf, true)
  assert.equal(parts.status, '', 'published work carries no label')
  assert.equal(parts.details, '12(3), 45–67')
  assert.equal(parts.doiUrl, 'https://doi.org/10.1145/3290605.3300857')
  const zh = formatCitationParts(pub({ authors: [{ name: '李彦霈', hidden: false }], status: 'in-press' }), 'zh', OWNER)
  assert.equal(zh.authors[0].self, true)
  assert.equal(zh.status, '印刷中')
  const review = formatCitationParts(pub({ status: 'under-review' }), 'en', OWNER)
  assert.equal(review.venue, '')
  assert.equal(review.details, '')
  assert.equal(review.status, 'Under review')
  assert.deepEqual(
    (['published', 'accepted', 'in-press', 'under-review', 'preprint'] as const).map((s) => [statusLabel(s, 'en'), statusLabel(s, 'zh')]),
    [
      ['Published', '已发表'],
      ['Accepted', '已录用'],
      ['In press', '印刷中'],
      ['Under review', '审稿中'],
      ['Preprint', '预印本'],
    ],
  )
  assert.equal(formatDetails({ volume: '', issue: '2', pages: '1--9' }), '(2), 1–9')
})

test('language of parts: Chinese text on English pages, Latin text on Chinese pages', () => {
  assert.equal(textLang('基于深度学习的目标检测', 'en'), 'zh-Hans')
  assert.equal(textLang('Deep learning', 'en'), undefined)
  assert.equal(textLang('Deep learning', 'zh'), 'en')
  assert.equal(textLang('基于深度学习', 'zh'), undefined)
  assert.equal(textLang('', 'zh'), undefined)
})

// ── Keys ─────────────────────────────────────────────────────────────────

test('citation keys: lastnameYEARfirstword, unique within a list, never without a digit or "nd"', () => {
  assert.equal(baseCitationKey(pub()), 'li2025deep')
  assert.equal(baseCitationKey(pub({ title: 'The art of the GPU', authors: [{ name: 'Müller, Hans', hidden: false }] })), 'muller2025art')
  assert.equal(baseCitationKey(pub({ year: '', date: '' })), 'li2025deep'.replace('2025', 'nd'))
  assert.equal(baseCitationKey(pub({ title: '基于深度学习', authors: [{ name: '李彦霈', hidden: false }] })), 'paper2025')
  assert.equal(baseCitationKey(pub({ authors: [{ name: '', hidden: true }, { name: 'Jane Doe', hidden: false }] })), 'doe2025deep')
  assert.deepEqual(citationKeys([pub(), pub({ title: 'Deep thoughts' }), pub({ title: 'Other' }), pub()]), ['li2025deep', 'li2025deepb', 'li2025other', 'li2025deepc'])
})

// ── BibTeX ───────────────────────────────────────────────────────────────

test('BibTeX: entry types by venue type and status', () => {
  assert.equal(bibtexType(pub()), 'article')
  assert.equal(bibtexType(pub({ venueType: 'conference' })), 'inproceedings')
  assert.equal(bibtexType(pub({ venueType: 'workshop' })), 'inproceedings')
  assert.equal(bibtexType(pub({ venueType: 'book-chapter' })), 'incollection')
  assert.equal(bibtexType(pub({ venueType: 'thesis', venue: 'The University of Hong Kong' })), 'phdthesis')
  assert.equal(bibtexType(pub({ venueType: 'thesis', venue: 'MPhil thesis, HKU' })), 'mastersthesis')
  assert.equal(bibtexType(pub({ venueType: 'preprint' })), 'misc')
  assert.equal(bibtexType(pub({ venueType: 'other' })), 'misc')
  assert.equal(bibtexType(pub({ venueType: '' })), 'misc')
  assert.equal(bibtexType(pub({ status: 'under-review' })), 'unpublished')
})

test('BibTeX: a complete journal article', () => {
  const bib = toBibtex(pub({ title: 'GPU kernels for ImageNet & friends', keywords: ['edge', 'ML'] }), { key: 'li2025gpu' })
  assert.equal(
    bib,
    [
      '@article{li2025gpu,',
      '  author    = {Li, Yanpei and Doe, Jane},',
      '  title     = {{GPU} kernels for {ImageNet} \\& friends},',
      '  journal   = {Journal of Embedded Systems},',
      '  volume    = {12},',
      '  number    = {3},',
      '  pages     = {45--67},',
      '  year      = {2025},',
      '  month     = mar,',
      '  publisher = {ACM},',
      '  doi       = {10.1145/3290605.3300857},',
      '  keywords  = {edge, ML}',
      '}',
    ].join('\n'),
  )
})

test('BibTeX: special characters, hidden co-authors, statuses and site links', () => {
  assert.equal(escapeBibtex('50% of C# & R_2 cost $5 {x} ~ ^ \\'), '50\\% of C\\# \\& R\\_2 cost \\$5 \\{x\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}')
  assert.equal(protectCase('Training BERT on 3D data with ResNet-50'), 'Training {BERT} on {3D} data with {ResNet}-50')
  const hidden = toBibtex(pub({ authors: [{ name: 'Yanpei Li', hidden: false }, { name: '', hidden: true }] }), { key: 'k' })
  assert.match(hidden, /author\s+= \{Li, Yanpei and others\}/)
  const review = toBibtex(pub({ status: 'under-review' }), { key: 'k' })
  assert.match(review, /^@unpublished\{k,/)
  assert.doesNotMatch(review, /journal|Journal of Embedded|volume|pages|publisher/)
  assert.match(review, /note\s+= \{Under review\}/)
  assert.match(toBibtex(pub({ status: 'in-press' }), { key: 'k' }), /note\s+= \{In press\}/)
  assert.match(toBibtex(pub({ status: 'preprint', venueType: 'preprint', venue: 'arXiv', doi: '' , pdfUrl: '/uploads/p.pdf' }), { key: 'k', origin: 'https://lucian-dev.com' }), /howpublished = \{arXiv\},[\s\S]*url\s+= \{https:\/\/lucian-dev\.com\/uploads\/p\.pdf\},\n {2}note\s+= \{Preprint\}/)
  const thesis = toBibtex(pub({ venueType: 'thesis', venue: 'BEng thesis, HKU', publisher: '' }), { key: 'k' })
  assert.match(thesis, /^@mastersthesis\{k,/)
  assert.match(thesis, /school\s+= \{BEng thesis, HKU\}/)
  assert.match(thesis, /type\s+= \{Bachelor's thesis\}/)
  assert.equal(toBibtexAll([pub(), pub({ title: 'Other' })], ['a', 'b']).split('\n\n').length, 2)
})

// ── APA 7 ────────────────────────────────────────────────────────────────

test('APA 7: authors, journal, forthcoming, conference, preprint, thesis, under review', () => {
  assert.equal(apaAuthors([{ name: 'Yanpei Li', hidden: false }]), 'Li, Y.')
  assert.equal(apaAuthors([{ name: 'Yanpei Li', hidden: false }, { name: 'Jane Doe', hidden: false }]), 'Li, Y., & Doe, J.')
  assert.equal(apaAuthors([{ name: 'Jane Doe', hidden: false }, { name: '', hidden: true }, { name: 'Yanpei Li', hidden: false }]), 'Doe, J., …, & Li, Y.')
  const many = Array.from({ length: 22 }, (_, i) => ({ name: `${String.fromCharCode(65 + i)}nna Person${String.fromCharCode(97 + i)}`, hidden: false }))
  assert.match(apaAuthors(many), /^Persona, A\., .*Persons, S\., … Personv, V\.$/)
  assert.equal(apaAuthors(many).split(', ').length, 2 * 19 + 2, '19 authors, then the ellipsis with the last')

  assert.equal(toApa(pub()), 'Li, Y., & Doe, J. (2025). Deep learning for tiny devices. Journal of Embedded Systems, 12(3), 45–67. https://doi.org/10.1145/3290605.3300857')
  assert.equal(toApa(pub({ status: 'accepted', doi: '' })), 'Li, Y., & Doe, J. (in press). Deep learning for tiny devices. Journal of Embedded Systems.')
  assert.equal(
    toApa(pub({ venueType: 'conference', venue: 'Proceedings of the CHI Conference', volume: '', issue: '' })),
    'Li, Y., & Doe, J. (2025). Deep learning for tiny devices. In Proceedings of the CHI Conference (pp. 45–67). ACM. https://doi.org/10.1145/3290605.3300857',
  )
  assert.equal(
    toApa(pub({ venueType: 'preprint', status: 'preprint', venue: 'arXiv', publisher: '', doi: '', url: 'https://arxiv.org/abs/2501.00001' })),
    'Li, Y., & Doe, J. (2025). Deep learning for tiny devices. arXiv. https://arxiv.org/abs/2501.00001',
  )
  assert.equal(
    toApa(pub({ venueType: 'thesis', venue: 'The University of Hong Kong', authors: [{ name: 'Yanpei Li', hidden: false }], doi: '' })),
    'Li, Y. (2025). Deep learning for tiny devices [Doctoral dissertation, The University of Hong Kong].',
  )
  assert.equal(toApa(pub({ status: 'under-review', doi: '' })), 'Li, Y., & Doe, J. (2025). Deep learning for tiny devices [Manuscript submitted for publication].')
  assert.equal(toApa(pub({ authors: [], date: '', year: '', doi: '' })), 'Deep learning for tiny devices. (n.d.). Journal of Embedded Systems, 12(3), 45–67.')
  assert.equal(toApa(pub({ authors: [{ name: '李彦霈', hidden: false }], doi: '', venue: '计算机学报', volume: '', issue: '', pages: '' })), '李彦霈. (2025). Deep learning for tiny devices. 计算机学报.')
})

// ── JSON-LD and JSON Resume ──────────────────────────────────────────────

const PERSON = { '@type': 'Person', '@id': 'https://lucian-dev.com/#person', name: 'Li Yanpei (Lucian)', url: 'https://lucian-dev.com/about' }
const node = (p: Publication) =>
  scholarlyArticleNode(p, { id: 'https://lucian-dev.com/publications#k', person: PERSON, owner: OWNER, origin: 'https://lucian-dev.com' }) as Record<string, any>

test('JSON-LD: ScholarlyArticle with the site Person as author, DOI identifier, journal chain', () => {
  const n = node(pub({ pdfUrl: '/uploads/p.pdf', url: 'https://dl.acm.org/doi/10.1145/3290605.3300857', award: 'Best Paper', keywords: ['edge'] }))
  assert.equal(n['@type'], 'ScholarlyArticle')
  assert.deepEqual(n.author, [PERSON, { '@type': 'Person', name: 'Jane Doe' }])
  assert.equal(n.datePublished, '2025-03')
  assert.equal(n.creativeWorkStatus, 'Published')
  assert.deepEqual(n.identifier, { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.1145/3290605.3300857' })
  assert.deepEqual(n.sameAs, ['https://doi.org/10.1145/3290605.3300857', 'https://dl.acm.org/doi/10.1145/3290605.3300857'])
  assert.equal(n.url, 'https://doi.org/10.1145/3290605.3300857')
  assert.deepEqual(n.isPartOf, {
    '@type': 'PublicationIssue',
    issueNumber: '3',
    isPartOf: { '@type': 'PublicationVolume', volumeNumber: '12', isPartOf: { '@type': 'Periodical', name: 'Journal of Embedded Systems', publisher: { '@type': 'Organization', name: 'ACM' } } },
  })
  assert.deepEqual([n.pageStart, n.pageEnd], ['45', '67'])
  assert.equal(n.encoding.contentUrl, 'https://lucian-dev.com/uploads/p.pdf')
  assert.equal(n.award, 'Best Paper')
  assert.equal(n.keywords, 'edge')
})

test('JSON-LD: proceedings, theses, and no publication claims for unpublished work', () => {
  assert.equal(node(pub({ venueType: 'conference' })).isPartOf['@type'], 'Book')
  const thesis = node(pub({ venueType: 'thesis', venue: 'HKU' }))
  assert.equal(thesis['@type'], 'Thesis')
  assert.deepEqual(thesis.sourceOrganization, { '@type': 'Organization', name: 'HKU' })
  const review = node(pub({ status: 'under-review', doi: '' }))
  assert.equal(review.datePublished, undefined)
  assert.equal(review.isPartOf, undefined)
  assert.equal(review.creativeWorkStatus, 'Under review')
  assert.equal(review.url, 'https://lucian-dev.com/publications#k')
  assert.equal(node(pub({ status: 'accepted' })).datePublished, undefined)
  assert.equal(node(pub({ authors: [] })).author[0], PERSON)
})

test('JSON Resume: unpublished work says so and has no release date', () => {
  const out = toJsonResume([pub({ abstract: 'Summary.' }), pub({ status: 'under-review', doi: '' }), pub({ status: 'preprint', venue: 'arXiv', doi: '', pdfUrl: '/uploads/p.pdf' })], {
    origin: 'https://lucian-dev.com',
  })
  assert.deepEqual(out[0], { name: 'Deep learning for tiny devices', publisher: 'Journal of Embedded Systems', releaseDate: '2025-03', url: 'https://doi.org/10.1145/3290605.3300857', summary: 'Summary.' })
  assert.deepEqual(out[1], { name: 'Deep learning for tiny devices', publisher: 'Under review' })
  assert.deepEqual(out[2], { name: 'Deep learning for tiny devices', publisher: 'Preprint · arXiv', releaseDate: '2025-03', url: 'https://lucian-dev.com/uploads/p.pdf' })
})

// ── Registry + validation ────────────────────────────────────────────────

test('the registry describes the section; a blank paper and a blank section are well-formed', () => {
  const def = SECTION_BY_NAME.publications
  assert.ok(def)
  assert.deepEqual(def.headerDefault, { en: 'Publications', zh: '论文' })
  const keys = def.lists![0].fields.map((f) => f.key)
  assert.deepEqual(keys, ['title', 'authors', 'venue', 'venueType', 'status', 'date', 'pages', 'volume', 'issue', 'publisher', 'doi', 'url', 'pdfUrl', 'codeUrl', 'slidesUrl', 'abstract', 'keywords', 'award'])
  assert.deepEqual(Object.keys(def.lists![0].blank()).sort(), [...keys].sort())
  assert.deepEqual(blankSection('publications', 'zh'), { sessionName: 'publications', headerName: '论文', isVisible: true, papers: [] })
  const ok = validateCvDoc({ en: [{ ...blankSection('publications', 'en'), papers: [def.lists![0].blank()] }] })
  assert.equal(ok.ok, true, 'an untitled blank paper saves')
})

test('validation: status, venue type, date, DOI and https-only links', () => {
  const check = (paper: Record<string, unknown>) => validateCvDoc({ en: doc([{ title: 'T', status: 'published', ...paper }]) })
  assert.equal(check({}).ok, true)
  assert.equal(check({ date: '2026' }).ok, true)
  assert.equal(check({ date: '2026-03' }).ok, true)
  assert.equal(check({ doi: 'https://doi.org/10.1234/x' }).ok, true)
  assert.equal(check({ pdfUrl: '/uploads/paper.pdf', url: 'https://example.com', codeUrl: 'github.com/a/b' }).ok, true)
  const cases: Array<[Record<string, unknown>, string, RegExp]> = [
    [{ status: '' }, 'status', /Status is required: choose Published, In press, Accepted, Under review or Preprint/],
    [{ status: 'submitted' }, 'status', /Status must be one of/],
    [{ venueType: 'blog' }, 'venueType', /Venue type must be one of/],
    [{ date: '2026-3' }, 'date', /year \(2026\) or a year and month \(2026-03\)/],
    [{ date: '2026-03-01' }, 'date', /year/],
    [{ doi: '1234/abc' }, 'doi', /DOI must look like 10\.1234/],
    [{ url: 'http://example.com' }, 'url', /Paper page must be an https:\/\//],
    [{ pdfUrl: 'javascript:alert(1)' }, 'pdfUrl', /PDF must be an https:\/\//],
    [{ slidesUrl: '//evil.example' }, 'slidesUrl', /Slides must be/],
  ]
  for (const [paper, field, message] of cases) {
    const r = check(paper)
    assert.equal(r.ok, false, JSON.stringify(paper))
    if (r.ok) continue
    assert.deepEqual(r.errors[0].path, ['en', 0, 'papers', 0, field])
    assert.match(r.errors[0].message, message)
  }
  // No title yet: an empty status is fine (a paper being added).
  assert.equal(validateCvDoc({ en: doc([{ title: '', status: '' }]) }).ok, true)
})
