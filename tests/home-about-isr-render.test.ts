/**
 * Stream home-about-isr: server markup of the new home / about components
 * (A1 proof strip, A2 calendar + language stack + contact band, A4 the open
 * CV with anchors, the identity rail). The components are .tsx; a
 * test-local loader transpiles them with the project's TypeScript (JSX →
 * react/jsx-runtime) so they render under node:test.
 */
import { register } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      import { readFileSync } from 'node:fs'
      import { fileURLToPath } from 'node:url'
      import { createRequire } from 'node:module'
      const require = createRequire(${JSON.stringify(new URL('../package.json', import.meta.url).href)})
      const ts = require('typescript')
      export async function resolve(specifier, context, next) {
        // next/<entry> are CommonJS files without an exports map: add the extension.
        if (/^next\\/[a-z-]+$/.test(specifier)) return next(specifier + '.js', context)
        return next(specifier, context)
      }
      export async function load(url, context, next) {
        if (url.startsWith('file:') && url.endsWith('.tsx') && !url.includes('/node_modules/')) {
          const source = readFileSync(fileURLToPath(url), 'utf8')
          const out = ts.transpileModule(source, {
            fileName: fileURLToPath(url),
            compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
          })
          return { format: 'module', source: out.outputText, shortCircuit: true }
        }
        return next(url, context)
      }
    `),
  import.meta.url,
)

/** Static markup without Emotion's inline <style> tags. */
const html = (el: unknown) =>
  renderToStaticMarkup(el as Parameters<typeof renderToStaticMarkup>[0]).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

test('A1: the proof strip renders nothing without highlights, else one link per tile to its source', async () => {
  const { default: ProofStrip } = await import('../components/LandingPage/ProofStrip')
  assert.equal(html(createElement(ProofStrip, { highlights: [] })), '')
  const out = html(
    createElement(ProofStrip, {
      highlights: [
        { value: '18th', label: 'IEEEXtreme 19.0 worldwide', href: '/cv#cv-competitionAwards-0' },
        { value: 'Best Potential Startup', label: 'YDC Entrepreneurial Program', href: 'https://ydc.example/award' },
      ],
    }),
  )
  assert.match(out, /<section[^>]*aria-label="Highlights"/)
  const links = Array.from(out.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)).map((m) => m[0])
  assert.equal(links.length, 2)
  assert.match(links[0], /href="\/cv#cv-competitionAwards-0"/)
  assert.doesNotMatch(links[0], /target=/)
  assert.match(links[1], /target="_blank"/)
  assert.match(out, /\(opens in a new tab\)/)
  // "18th" rolls up: the real value stays readable as text.
  assert.match(out, /<span class="sr-only">18<\/span><\/span>th/)
  assert.match(out, /Best Potential Startup/)
})

test('A2: the contact band links to /contact and shows availability only when set', async () => {
  const { default: ContactBand, CONTACT_FALLBACK_LEDE } = await import('../components/LandingPage/ContactBand')
  const plain = html(createElement(ContactBand, { home: null }))
  assert.match(plain, /<a [^>]*href="\/contact"[^>]*>Write to me/)
  assert.ok(plain.includes(CONTACT_FALLBACK_LEDE))
  assert.doesNotMatch(plain, /<form|<textarea|<input/)
  assert.doesNotMatch(plain, /id="availability"/, 'no invented availability')
  const open = html(
    createElement(ContactBand, {
      home: { hero: {}, socials: {}, brands: [], quickAccess: [], contact: { blurb: 'Hiring? Say hello.' }, availability: { status: 'open', label: 'Open to backend roles' } } as never,
    }),
  )
  assert.match(open, /id="availability"/)
  assert.match(open, /Open to backend roles/)
  assert.match(open, /Hiring\? Say hello\./)
})

test('A2: the contribution calendar is five paths and a text summary, from the compact props', async () => {
  const { default: ContributionGraph } = await import('../components/GitHub/ContributionGraph')
  const counts = Array.from({ length: 120 }, (_, i) => (i % 5 === 0 ? 0 : (i % 7) + 1))
  const out = html(createElement(ContributionGraph, { initialData: { available: true, total: 600, start: '2026-06-14', counts } }))
  assert.match(out, /<svg[^>]*role="img"[^>]*aria-label="Contribution calendar"/)
  assert.ok((out.match(/<path data-level=/g) || []).length <= 5)
  assert.doesNotMatch(out, /role="gridcell"|role="grid"/)
  assert.match(out, /Active on \d+ of 120 days\./)
  assert.match(out, /Busiest month: /)
  assert.match(out, /600 contributions in the last year/)
  assert.equal(html(createElement(ContributionGraph, { initialData: { available: false } })), '', 'unavailable: nothing')
})

test('A2: languages are one decorative bar plus a text legend (top five + Other)', async () => {
  const { default: LanguageStack } = await import('../components/GitHub/LanguageStack')
  const out = html(
    createElement(LanguageStack, {
      initialData: {
        available: true,
        count: 9,
        slices: [
          { name: 'HTML', pct: 41.5 },
          { name: 'Rust', pct: 13 },
          { name: 'Other', pct: 45.5, other: true },
        ],
      },
    }),
  )
  assert.match(out, /aria-hidden="true"[^>]*data-language-bar=""|data-language-bar=""[^>]*aria-hidden="true"/)
  assert.match(out, /aria-label="Languages by share of code, top 2 of 9"/)
  assert.equal((out.match(/<li/g) || []).length, 3)
  assert.match(out, /45\.5%/)
})

test('A4: /about’s CV stack starts open, puts each toggle in an h3 and anchors each section', async () => {
  const { default: LandingCVSections } = await import('../components/LandingPage/LandingCVSections')
  const en = [
    { sessionName: 'education', headerName: 'EDUCATION', educationExperience: [{ degree: 'MSc', schoolName: 'CUHK', startDate: '2026-09', endDate: '2028-12' }] },
    { sessionName: 'competitionAwards', headerName: 'COMPETITIONS', awards: [] },
  ]
  const out = html(createElement(LandingCVSections, { en, expanded: true, headingLevel: 'h3', idPrefix: 'about-' }))
  assert.match(out, /<h3[^>]*><button[^>]*aria-expanded="true"/)
  assert.match(out, /id="about-education"/)
  assert.doesNotMatch(out, /id="about-competitionAwards"/, 'a section with nothing to show leaves no anchor')
  // Without the options the stack renders as before (collapsed, no heading wrapper, no anchors).
  const plain = html(createElement(LandingCVSections, { en }))
  assert.doesNotMatch(plain, /<h3[^>]*><button/)
  assert.match(plain, /aria-expanded="false"/)
  assert.doesNotMatch(plain, /id="about-/)
})

test('A4: the identity rail is the page header: h1, availability in words, CV links, profiles and the section nav', async () => {
  const { default: IdentityRail } = await import('../components/About/IdentityRail')
  const out = html(
    createElement(IdentityRail, {
      brand: 'Lucian Sphere',
      identity: { name: 'Li Yanpei', nameZh: '李彦霈', nick: 'Lucian' } as never,
      portrait: { src: '/uploads/a.jpg', x: 10, y: 20, scale: 1, alt: 'Portrait of Li Yanpei', width: 800, height: 800 },
      availability: { status: 'open', label: 'Open to backend roles', roles: [], from: '2026-11', bookingUrl: '', workStatus: '' },
      socials: [{ key: 'github', name: 'GitHub', url: 'https://github.com/x' }],
      nav: [
        { id: 'about-bio', label: 'Bio' },
        { id: 'about-education', label: 'Education' },
      ],
    }),
  )
  assert.match(out, /^<header/)
  assert.match(out, /<h1[^>]*>Li Yanpei<\/h1>/)
  assert.match(out, /lang="zh-Hans">李彦霈/)
  assert.match(out, /alt="Portrait of Li Yanpei"/)
  assert.match(out, /Open to backend roles/)
  assert.match(out, /<time dateTime="2026-11"|<time datetime="2026-11"/)
  assert.match(out, /href="\/cv"/)
  assert.match(out, /href="\/cv\?print=1"/)
  assert.match(out, /aria-label="GitHub \(opens in a new tab\)"/)
  assert.match(out, /<nav[^>]*aria-label="On this page"/)
  assert.match(out, /href="#about-bio"/)
  // One entry is not a nav; no availability set means no badge.
  const minimal = html(createElement(IdentityRail, { identity: null, portrait: null, availability: null, socials: [], nav: [{ id: 'about-education', label: 'Education' }] }))
  assert.doesNotMatch(minimal, /<nav/)
  assert.doesNotMatch(minimal, /data-availability/)
})
