import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { availabilityView } from '../components/Common/contactForm'

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

const { default: AvailabilityCard } = await import('../components/Contact/AvailabilityCard')
const render = (availability: unknown) =>
  renderToStaticMarkup(createElement(AvailabilityCard, { availability: availability as never }))

test('the availability card renders nothing without a status', () => {
  assert.equal(render(undefined), '')
  assert.equal(render(null), '')
  assert.equal(render({}), '')
  assert.equal(
    render({ label: 'Open to work', roles: ['Backend'], bookingUrl: 'https://cal.com/x' }),
    ''
  )
  assert.equal(render({ status: 'maybe' }), '')
})

test('with a status it shows the label, roles, start month and a safe booking link', () => {
  const html = render({
    status: 'open',
    label: 'Open to new roles',
    label_zh: '正在寻找新机会',
    roles: ['Backend', 'ML engineering', 'Backend', ' '],
    from: '2026-11-01',
    bookingUrl: 'https://cal.com/lucian/intro',
  })
  assert.match(html, /id="availability"/)
  assert.match(html, /Open to new roles/)
  assert.ok(!html.includes('正在寻找新机会'), 'label_zh is not used on English pages')
  assert.equal((html.match(/<li/g) || []).length, 2, 'roles are de-duplicated and blanks dropped')
  assert.match(html, /From <time datetime="2026-11">2026-11<\/time>/i)
  assert.match(html, /href="https:\/\/cal\.com\/lucian\/intro"/)
  assert.match(html, /target="_blank"/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.match(html, /Book a call/)
})

test('defaults and rejected values', () => {
  assert.deepEqual(availabilityView({ status: 'limited' }), {
    status: 'limited',
    label: 'Limited availability',
    roles: [],
    from: '',
    bookingUrl: '',
    workStatus: '',
  })
  assert.equal(
    availabilityView({ status: 'open', bookingUrl: 'javascript:alert(1)' })?.bookingUrl,
    ''
  )
  assert.equal(availabilityView({ status: 'open', bookingUrl: 'http://cal.com/x' })?.bookingUrl, '')
  assert.equal(availabilityView({ status: 'open', from: 'soon' })?.from, '')
  assert.equal(availabilityView({ status: 'closed', from: '2026-13' })?.from, '')
  const html = render({ status: 'closed', bookingUrl: 'http://insecure.example' })
  assert.match(html, /Not taking on new work/)
  assert.ok(!html.includes('Book a call'))
  assert.ok(!html.includes('insecure.example'))
})
