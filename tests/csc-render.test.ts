/**
 * Server markup of this stream's components: the contact card's right-to-work
 * line, the form's privacy notice, the CV header extras (A4 + Reading view),
 * the self-assessment and recommendations sections, and /about's
 * recommendations — each rendering nothing until there is content.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Node strips TypeScript types but does not compile JSX: transpile .tsx with the project's TypeScript.
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
  },
)

const { default: AvailabilityCard } = await import('../components/Contact/AvailabilityCard')
const { default: ContactPro } = await import('../components/Contact/ContactPro')
const { CvHeaderExtrasContext } = await import('../components/CVViewerPage/HeaderExtras')
const { default: PersonalInformationSection } = await import('../components/CVViewerPage/PersonalInformation')
const { default: ReadingView } = await import('../components/CVViewerPage/ReadingView')
const { default: CVResult } = await import('../components/CVViewerPage/CVResult')
const { default: AboutRecommendations } = await import('../components/About/Recommendations')
const { cvHeaderExtras } = await import('../lib/cvLocale')
const { publicSections } = await import('../lib/cvVisibility')

const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el)

test('the contact card shows the English right-to-work line only when set', () => {
  const withLine = html(createElement(AvailabilityCard, { availability: { status: 'open', workStatus: 'Line EN', workStatus_zh: '中文行' } as never }))
  assert.match(withLine, /data-work-status/)
  assert.match(withLine, /work authorisation/)
  assert.match(withLine, /Line EN/)
  assert.ok(!withLine.includes('中文行'))
  assert.ok(!html(createElement(AvailabilityCard, { availability: { status: 'open' } as never })).includes('data-work-status'))
})

test('the form states the retention period, links the privacy notes, and starts without the structured fields', () => {
  const markup = html(createElement(ContactPro, { formOnly: true, retentionDays: 365 }))
  assert.match(markup, /id="contact-privacy"/)
  assert.match(markup, /deleted automatically after 12 months/)
  assert.match(markup, /href="\/colophon#privacy"/)
  assert.ok(!markup.includes('data-inquiry'), 'the fields appear once a reason is picked')
  const off = html(createElement(ContactPro, { formOnly: true, retentionDays: 0 }))
  assert.match(off, /delete them myself/)
})

const pi = { sessionName: 'personalInformation', firstName: 'Yanpei', lastName: 'Li', email: 'a@example.com', introduction: 'Summary.' }
const availability = { status: 'open', from: '2027-01', roles_zh: ['前端工程师'], city_zh: '香港', workStatus: 'EN line', workStatus_zh: '中文行' }

test('the A4 header prints the lines from the availability, in the page language', () => {
  const zh = html(
    createElement(CvHeaderExtrasContext.Provider, { value: cvHeaderExtras(availability, 'zh') }, createElement(PersonalInformationSection, { data: pi as never, lang: 'zh' })),
  )
  assert.match(zh, /data-cv-extra="jobIntent"/)
  assert.match(zh, /求职意向/)
  assert.match(zh, /前端工程师 ｜ 意向城市：香港 ｜ 到岗时间：2027\.01/)
  assert.match(zh, /工作身份/)
  const en = html(
    createElement(CvHeaderExtrasContext.Provider, { value: cvHeaderExtras(availability, 'en') }, createElement(PersonalInformationSection, { data: pi as never, lang: 'en' })),
  )
  assert.match(en, /Work authorisation/)
  assert.match(en, /EN line/)
  assert.ok(!en.includes('求职意向'))
  // No provider (Studio preview) or nothing set: the header is unchanged.
  const plain = html(createElement(PersonalInformationSection, { data: pi as never, lang: 'en' }))
  assert.ok(!plain.includes('data-cv-extras'))
})

test('the Reading view lists the same lines in the identity card', () => {
  const markup = html(createElement(CvHeaderExtrasContext.Provider, { value: cvHeaderExtras(availability, 'zh') }, createElement(ReadingView, { sections: [pi], lang: 'zh' })))
  assert.match(markup, /<dt[^>]*>求职意向<\/dt>/)
  assert.match(markup, /<dt[^>]*>工作身份<\/dt>/)
})

test('self-assessment and recommendations render on the sheet only with content and permission', () => {
  const sections = publicSections(
    [
      pi,
      { sessionName: 'selfAssessment', headerName: '自我评价', text: '踏实、好学。', points: ['热爱工程'] },
      {
        sessionName: 'recommendations',
        headerName: '推荐语',
        items: [
          { quote: 'Shipped on time, every time.', name: 'Pat Lee', role: 'CTO, Acme', permission: true, sourceUrl: 'https://example.com/r' },
          { quote: 'Not allowed yet', name: 'Sam', permission: false },
        ],
      },
    ],
    'cv',
  )
  const sheet = html(createElement(CVResult, { cvData: sections, lang: 'zh' }))
  assert.match(sheet, /id="cv-selfAssessment"/)
  assert.match(sheet, /踏实、好学。/)
  assert.match(sheet, /<figure[^>]*id="cv-recommendations-0"/)
  assert.match(sheet, /<blockquote[^>]*cite="https:\/\/example.com\/r"/)
  assert.match(sheet, /Pat Lee/)
  assert.ok(!sheet.includes('Not allowed yet'))
  assert.ok(!/Review|AggregateRating/.test(sheet), 'no review markup')
  const reading = html(createElement(ReadingView, { sections, lang: 'zh' }))
  assert.match(reading, /data-cv-anchor="cv-recommendations-0"/)
  assert.match(reading, /热爱工程/)
  // Empty sections render nothing.
  const empty = html(createElement(CVResult, { cvData: [{ sessionName: 'selfAssessment', text: '' }, { sessionName: 'recommendations', items: [] }], lang: 'en' }))
  assert.ok(!empty.includes('cv-selfAssessment') && !empty.includes('cv-recommendations'))
})

test('/about recommendations: figure cards with credit, nothing without an entry', () => {
  const markup = html(
    createElement(AboutRecommendations, {
      section: { sessionName: 'recommendations', items: [{ quote: 'Thoughtful engineer.', name: 'Jo', relation: 'worked together at Acme', date: '2026-02' }] },
    }),
  )
  assert.match(markup, /aria-labelledby="about-recommendations"/)
  assert.match(markup, /<h2[^>]*>Recommendations<\/h2>/)
  assert.match(markup, /<blockquote/)
  assert.match(markup, /worked together at Acme · Feb 2026/)
  assert.equal(html(createElement(AboutRecommendations, { section: { items: [] } })), '')
})
