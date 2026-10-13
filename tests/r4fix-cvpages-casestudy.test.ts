/**
 * /about G3: CV project entries rendered by LandingCVSections →
 * PersonalInstruction/Project link to their /work case study when one
 * matches (owner-chosen `caseStudy` slug first, else the strict title match),
 * and /uses always ships a 70–160 character meta description.
 *
 * The components are .tsx; a test-local loader transpiles them with the
 * project's TypeScript (JSX → react/jsx-runtime) so they run under node:test.
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

const work = [
  { slug: 'raku', title: 'RAKU: an AI job-search assistant' },
  { slug: 'project-carboy', title: 'Carboy' },
  { slug: 'portfolio', title: 'This site' },
]

const project = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  startDate: '2024-01',
  endDate: '2024-06',
  projectLocation: '',
  description: `About ${title}`,
  features: [{ description: `Built ${title}`, furtherExplanation: [] }],
  ...extra,
})

const projectSection = {
  sessionName: 'project',
  headerName: 'Projects',
  projectExperience: [
    project('Project RAKU: AI Assistant Job Search System'),
    project('Personal Portfolio & CV Management System', { caseStudy: '/work/portfolio/' }),
    project('Smart Waste Classification System'),
    project('Carboy', { caseStudy: 'no-such-study', features: [] }),
  ],
}

test('projectEntries: owner slug wins, unknown slug falls back to the strict title match, no match → null', async () => {
  const { projectEntries } = await import('../components/PersonalInstruction/Project')
  const entries = projectEntries(projectSection as never, work)
  assert.deepEqual(
    entries.map((e) => e.study?.slug ?? null),
    ['raku', 'portfolio', null, 'project-carboy'],
  )
  assert.deepEqual(
    projectEntries(projectSection as never, undefined).map((e) => e.study),
    [null, null, null, null],
  )
  assert.deepEqual(projectEntries({ projectExperience: [project('  ', { description: '' })] } as never, work), [])
  assert.deepEqual(projectEntries(null, work), [])
})

test('LandingCVSections threads `work` to the project rows: one "Case study →" link per matched project', async () => {
  const { default: LandingCVSections } = await import('../components/LandingPage/LandingCVSections')
  const out = html(createElement(LandingCVSections, { en: [projectSection], work }))
  const links = Array.from(out.matchAll(/<a [^>]*href="(\/work\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g))
  assert.deepEqual(
    links.map((m) => m[1]),
    ['/work/raku', '/work/portfolio', '/work/project-carboy'],
  )
  for (const [, , inner] of links) {
    assert.match(inner, /^Case study <span class="nudge" aria-hidden="true">→<\/span>/)
    assert.match(inner, /<span class="sr-only">: [^<]+<\/span>$/)
  }
  assert.match(links[0][2], /: RAKU: an AI job-search assistant</)
})

test('LandingCVSections without `work` (or with an empty index) renders no case-study links', async () => {
  const { default: LandingCVSections } = await import('../components/LandingPage/LandingCVSections')
  for (const props of [{ en: [projectSection] }, { en: [projectSection], work: [] }]) {
    const out = html(createElement(LandingCVSections, props))
    assert.ok(out.includes('Smart Waste Classification System'), 'projects still render')
    assert.doesNotMatch(out, /href="\/work\//)
  }
})

test('Chinese CV: the link label is localised, the target is the same case study', async () => {
  const { default: LandingCVSections } = await import('../components/LandingPage/LandingCVSections')
  const zhSection = { ...projectSection, headerName: '项目', projectExperience: [project('乐酷求职助手', { caseStudy: 'raku' })] }
  const { default: ProjectSection } = await import('../components/PersonalInstruction/Project')
  const out = html(createElement(ProjectSection, { data: zhSection as never, lang: 'zh', work }))
  assert.match(out, /href="\/work\/raku"[^>]*>案例研究 <span class="nudge"/)
  // The accordion itself starts in English and only offers the toggle when a zh CV exists.
  const both = html(createElement(LandingCVSections, { en: [projectSection], zh: [zhSection], work }))
  assert.match(both, /aria-label="CV language"/)
})

test('/uses meta descriptions are 70–160 characters in every variant', async () => {
  const { usesDescription, USES_DESCRIPTIONS } = await import('../pages/uses')
  const len = (s: string) => Array.from(s).length
  for (const [key, d] of Object.entries(USES_DESCRIPTIONS)) {
    assert.ok(len(d) >= 70 && len(d) <= 160, `${key}: ${len(d)} chars`)
  }
  assert.deepEqual(usesDescription({ written: false, hasStack: true }), { description: USES_DESCRIPTIONS.built })
  assert.deepEqual(usesDescription({ written: false, hasStack: false }), { description: USES_DESCRIPTIONS.builtNoStack })
  // An owner description for an empty write-up is never used (the page shows no write-up).
  assert.deepEqual(usesDescription({ written: false, hasStack: true, ownDescription: 'Mine' }), { description: USES_DESCRIPTIONS.built })
  assert.deepEqual(usesDescription({ written: true, hasStack: true }), { description: USES_DESCRIPTIONS.written })
  assert.deepEqual(usesDescription({ written: true, hasStack: false, ownDescription: '  ' }), { description: USES_DESCRIPTIONS.writtenNoStack })
  // The owner's own description wins; the default backs up a short one (CustomHead's < 70 rule).
  assert.deepEqual(usesDescription({ written: true, hasStack: true, ownDescription: ' My desk, editor and terminal. ' }), {
    description: 'My desk, editor and terminal.',
    fallbackDescription: USES_DESCRIPTIONS.written,
  })
  const { clampDescription } = await import('../lib/schema')
  const shown = clampDescription('My desk.', USES_DESCRIPTIONS.written)
  assert.equal(shown, USES_DESCRIPTIONS.written)
})
