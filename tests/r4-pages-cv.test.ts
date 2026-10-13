import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { publicSections } from '../lib/cvVisibility'
import {
  cvDescription,
  cvEntryAnchor,
  cvSectionAnchor,
  indexedCertificates,
  indexedList,
  publicSeoSections,
} from '../components/CVViewerPage/fields'
import { qrSvg } from '../lib/qr'

// Node strips TypeScript types but does not compile JSX: transpile .tsx
// components with the project's TypeScript so they can be rendered here.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      let ts
      export async function initialize(data) { ts = (await import(data.ts)).default }
      export async function load(url, context, next) {
        if (!url.startsWith('file:') || !url.endsWith('.tsx')) return next(url, context)
        const { readFile } = await import('node:fs/promises')
        const source = await readFile(new URL(url), 'utf8')
        const out = ts.transpileModule(source, {
          fileName: url,
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        })
        return { format: 'module', source: out.outputText, shortCircuit: true }
      }
    `),
  {
    parentURL: import.meta.url,
    data: { ts: pathToFileURL(createRequire(import.meta.url).resolve('typescript')).href },
  }
)

const { default: EmailText, emailOffHtml } = await import('../components/Common/EmailText')
const { publicNameZh } = await import('../components/CVViewerPage/PersonalInformation')
const { default: CVResult } = await import('../components/CVViewerPage/CVResult')
const { default: ReadingView } = await import('../components/CVViewerPage/ReadingView')

const cvEditorDoc = [
  {
    sessionName: 'personalInformation',
    firstName: 'Yanpei',
    lastName: 'Li',
    nickName: 'Lucian',
    email: 'hello@lucian-dev.com',
    phoneNumber: '+852 5555 0100',
  },
  {
    sessionName: 'education',
    headerName: 'Education',
    educationExperience: [
      {
        degree: 'BSc Computer Science',
        schoolName: 'Uni',
        startDate: '2020-09',
        endDate: '2024-06',
      },
    ],
  },
  {
    sessionName: 'workExperience',
    headerName: 'Experience',
    experiences: [
      {
        jobTitle: 'Hidden job',
        companyName: 'Secret Co',
        startDate: '2019-01',
        endDate: '2019-06',
        isVisible: false,
      },
      { jobTitle: 'Engineer', companyName: 'Acme', startDate: '2024-07', endDate: 'present' },
      { jobTitle: 'Intern', companyName: 'Beta', startDate: '2023-06', endDate: '2023-09' },
    ],
  },
  {
    sessionName: 'patents',
    headerName: 'Patents',
    isVisible: false,
    patentExperience: [{ title: 'Hidden patent' }],
  },
  {
    sessionName: 'certification',
    headerName: 'Certifications',
    certifications: [
      {
        issuingOrganization: 'AWS',
        CertificationList: [{ certificationName: 'SAA' }, { certificationName: 'DVA' }],
      },
      { issuingOrganization: 'Google', CertificationList: [{ certificationName: 'PCA' }] },
    ],
  },
]
const cv = publicSections(cvEditorDoc, 'cv')

test('zh SEO copy names only the public sections, with the public Chinese name', () => {
  const present = publicSeoSections(cv)
  assert.deepEqual(present, ['education', 'workExperience', 'certification'])
  assert.equal(
    cvDescription('zh', { present, nameZh: '李彦霈' }),
    '李彦霈（Lucian）的中文简历：教育、工作经历与证书，另有英文版，可在线浏览，也可打印或保存为 A4 PDF。'
  )
  assert.equal(
    cvDescription('zh', {
      present: ['education', 'workExperience', 'project', 'patents', 'competitionAwards'],
      nameZh: '李彦霈',
    }),
    '李彦霈（Lucian）的中文简历：教育、工作经历、项目、专利与奖项，另有英文版，可在线浏览，也可打印或保存为 A4 PDF。'
  )
  // Hidden Chinese name → the romanised name, never an invented one.
  assert.equal(
    cvDescription('zh', { present: ['project'] }),
    'Li Yanpei（Lucian）的中文简历：项目，另有英文版，可在线浏览，也可打印或保存为 A4 PDF。'
  )
  assert.equal(
    cvDescription('zh', { present: [] }),
    'Li Yanpei（Lucian）的中文简历，另有英文版，可在线浏览，也可打印或保存为 A4 PDF。'
  )
  assert.equal(
    cvDescription('en', { present }),
    'The CV / résumé of Li Yanpei (Lucian) in English and Chinese: education, experience and certifications, printable as an A4 PDF.'
  )
  assert.ok(
    cvDescription('en', {
      present: ['education', 'workExperience', 'project', 'patents', 'competitionAwards'],
    }).length <= 155
  )
})

test('every CV description stays within 70–160 display columns, even with no public sections', () => {
  // Same measure as the E2E check: CJK and full-width characters count twice.
  const columns = (text: string) =>
    [...text].reduce((n, ch) => n + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(ch) ? 2 : 1), 0)
  const all = ['education', 'workExperience', 'project', 'patents', 'competitionAwards', 'certification']
  for (const present of [[], ['project'], all]) {
    for (const nameZh of [undefined, '李彦霈']) {
      const zh = columns(cvDescription('zh', { present, nameZh }))
      assert.ok(zh >= 70 && zh <= 160, `zh ${present.length} sections, name ${nameZh ?? '-'}: ${zh}`)
    }
    const en = columns(cvDescription('en', { present }))
    assert.ok(en >= 70 && en <= 160, `en ${present.length} sections: ${en}`)
  }
})

test('the public Chinese name follows the CV, and disappears when hidden', () => {
  const zh = publicSections(
    [{ sessionName: 'personalInformation', firstName: '彦霈', lastName: '李', nickName: 'Lucian' }],
    'cv'
  )
  assert.equal(publicNameZh(zh), '李彦霈')
  const hidden = publicSections(
    [
      {
        sessionName: 'personalInformation',
        firstName: '彦霈',
        lastName: '李',
        hiddenFields: ['firstName', 'lastName'],
      },
    ],
    'cv'
  )
  assert.equal(publicNameZh(hidden), '')
  assert.equal(publicNameZh([]), '')
})

test('EmailText wraps the escaped value in Cloudflare email_off markers', () => {
  assert.equal(
    emailOffHtml('hello@lucian-dev.com'),
    '<!--email_off-->hello@lucian-dev.com<!--/email_off-->'
  )
  assert.equal(
    emailOffHtml('<b>&"x\'</b>'),
    '<!--email_off-->&lt;b&gt;&amp;&quot;x&#39;&lt;/b&gt;<!--/email_off-->'
  )
  const html = renderToStaticMarkup(
    createElement(EmailText, { value: 'a<b>@x.io', className: 'mail' })
  )
  assert.equal(html, '<span class="mail"><!--email_off-->a&lt;b&gt;@x.io<!--/email_off--></span>')
})

test('anchor indices are positions in the public list, stable across renderers', () => {
  const work = cv.find((s) => s.sessionName === 'workExperience')
  assert.deepEqual(
    indexedList(work, 'experiences').map(({ item, index }) => [item.companyName, index]),
    [
      ['Acme', 0],
      ['Beta', 1],
    ]
  )
  const certs = cv.find((s) => s.sessionName === 'certification')
  assert.deepEqual(
    indexedCertificates(certs).map(({ cert, index }) => [cert.certificationName, index]),
    [
      ['SAA', 0],
      ['DVA', 1],
      ['PCA', 2],
    ]
  )
  assert.equal(cvSectionAnchor('workExperience'), 'cv-workExperience')
  assert.equal(cvEntryAnchor('workExperience', 1), 'cv-workExperience-1')
})

test('the A4 sheet carries the anchor ids, h2 section titles, no heading for the name, and the QR footer', () => {
  const html = renderToStaticMarkup(
    createElement(CVResult, {
      cvData: cv,
      lang: 'en',
      qr: {
        svg: '<svg viewBox="0 0 1 1"></svg>',
        caption: 'Live CV · lucian-dev.com/cv',
        label: 'QR code',
      },
    })
  )
  for (const id of [
    'cv-personalInformation',
    'cv-education',
    'cv-education-0',
    'cv-workExperience',
    'cv-workExperience-0',
    'cv-workExperience-1',
    'cv-certification-2',
  ]) {
    assert.ok(html.includes(`id="${id}"`), id)
  }
  assert.ok(!html.includes('Secret Co') && !html.includes('Hidden patent'))
  assert.ok(html.includes('<h2'), 'section titles are h2')
  assert.ok(!/<h2[^>]*>[^<]*LUCIAN/i.test(html), 'the name is not a heading')
  assert.ok(html.includes('<!--email_off-->hello@lucian-dev.com<!--/email_off-->'))
  assert.ok(html.includes('Live CV · lucian-dev.com/cv'))
  assert.ok(html.includes('role="img"'))
  assert.ok(
    !renderToStaticMarkup(createElement(CVResult, { cvData: cv, lang: 'en' })).includes(
      'cv-print-qr'
    )
  )
})

test('the Reading view mirrors the anchors as data attributes (ids stay unique to the sheet)', () => {
  const html = renderToStaticMarkup(createElement(ReadingView, { sections: cv, lang: 'en' }))
  for (const id of [
    'cv-personalInformation',
    'cv-workExperience',
    'cv-workExperience-0',
    'cv-workExperience-1',
    'cv-certification-2',
  ]) {
    assert.ok(html.includes(`data-cv-anchor="${id}"`), id)
    assert.ok(!html.includes(`id="${id}"`), `no duplicate id ${id}`)
  }
  assert.ok(html.includes('<!--email_off-->hello@lucian-dev.com<!--/email_off-->'))
  assert.ok(html.includes('href="mailto:hello@lucian-dev.com"'))
  assert.ok(!/\[0\d\]/.test(html), 'no section numbering')
  // Only section cards are h2; the name is not.
  assert.equal((html.match(/<h2/g) || []).length, 3)
})

test('QR codes are inline SVG drawn in currentColor on a transparent background', async () => {
  const svg = await qrSvg('https://lucian-dev.com/cv')
  assert.match(
    svg,
    /^<svg aria-hidden="true" focusable="false" xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/
  )
  assert.ok(svg.includes('stroke="currentColor"'))
  assert.ok(!/fill="#|stroke="#/.test(svg), 'no hard-coded colours')
  assert.equal(await qrSvg('https://lucian-dev.com/cv'), svg, 'memoised and deterministic')
  assert.notEqual(await qrSvg('https://lucian-dev.com/cv/zh'), svg)
})
