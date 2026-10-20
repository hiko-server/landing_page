/**
 * Plain section headings (owner request 2026-10-13): no "[01] INTRODUCTION"
 * labels on the public site — no "[NN]" index markers, no bracket eyebrows,
 * no zero-padded index labels. Every page section opens with
 * components/General-UI/SectionHeading.
 */
import { HOME_UI } from '../lib/uiStrings/home'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire, register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { textStyles } from '../theme/tokens'

// Node strips TypeScript types but does not compile JSX: transpile .tsx
// components with the project's TypeScript so they can be rendered here.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      let ts
      export async function initialize(data) { ts = (await import(data.ts)).default }
      export async function resolve(specifier, context, next) {
        if (/^next\\/[a-z-]+$/.test(specifier)) return next(specifier + '.js', context)
        return next(specifier, context)
      }
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

const { default: SectionHeading } = await import('../components/General-UI/SectionHeading')
const { default: CVSectionShell } = await import('../components/PersonalInstruction/_CVSectionShell')
type HeadingProps = Parameters<typeof SectionHeading>[0]
type ShellProps = Parameters<typeof CVSectionShell>[0]

const root = process.cwd()
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const text = (html: string) => html.replace(/<[^>]+>/g, '')

test('SectionHeading: an h2 carrying the id, the plain title and an optional aux outside the heading', () => {
  const html = renderToStaticMarkup(createElement(SectionHeading, { id: 'section-open-source-label', aux: '3 entries' } as HeadingProps, 'Open Source'))
  assert.match(html, /<h2[^>]*id="section-open-source-label"[^>]*>Open Source<\/h2>/)
  assert.match(html, /class="[^"]*section-heading/)
  // (Emotion may put <style> tags between the elements.)
  assert.match(html, /<\/h2>(<style[^>]*>[^<]*<\/style>)?<span[^>]*>3 entries<\/span>/, 'the aux text is not part of the heading’s name')
  assert.doesNotMatch(text(html), /\[|\]/)
  const h3 = renderToStaticMarkup(createElement(SectionHeading, { as: 'h3', id: 'x' } as HeadingProps, 'Currently'))
  assert.match(h3, /<h3[^>]*id="x"[^>]*>Currently<\/h3>/)
  assert.doesNotMatch(h3, /<span/, 'no aux, no extra element')
})

test('the section text style is sans, mixed case and on the type scale', () => {
  const s = textStyles.section as Record<string, unknown>
  assert.equal(s.fontSize, 'title-md')
  assert.equal(s.fontWeight, 500)
  assert.equal(s.fontFamily, undefined, 'the body (sans) family')
  assert.equal(s.textTransform, undefined, 'never uppercase')
})

test('CV section shells on /about show the title and the count, no "[NN]" index', () => {
  const html = renderToStaticMarkup(createElement(CVSectionShell, { label: 'Education', count: 3, countSuffix: 'ENTRIES', defaultOpen: true } as ShellProps, 'rows'))
  assert.match(text(html), /Education/)
  assert.match(text(html), /3 ENTRIES/)
  assert.doesNotMatch(text(html), /\[\d+\]|\b0\d\b/)
  assert.doesNotMatch(read('components/PersonalInstruction/_CVSectionShell.tsx'), /index\?: number|padStart/)
})

test('home: every section opens with SectionHeading (id `${id}-label`), the hero has no label', () => {
  const content = read('components/LandingPage/Content.tsx')
  assert.match(content, /<SectionHeading id=\{`\$\{s\.id\}-label`\}>\{s\.label\}<\/SectionHeading>/)
  assert.match(content, /aria-labelledby=\{`\$\{s\.id\}-label`\}/)
  assert.match(content, /data-nav-label=\{s\.label\}/)
  const hero = stripComments(read('components/LandingPage/PersonalInfo.tsx'))
  assert.doesNotMatch(hero, /Introduction|SectionLabel|SectionHeading/)
  assert.equal(fs.existsSync(path.join(root, 'components/General-UI/SectionLabel.tsx')), false, 'the "[NN]" label component is gone')
  // The reveal of label-only sections targets the new heading.
  assert.match(read('components/General-UI/SectionReveal.tsx'), /\.section-heading/)
})

test('/about: Bio, Recommendations and CV use SectionHeading, numbered nowhere', () => {
  const about = stripComments(read('pages/about/index.tsx'))
  for (const id of ['about-bio-heading', 'about-recommendations', 'about-cv-heading']) {
    assert.match(about, new RegExp(`<SectionHeading id="${id}"`), id)
  }
  assert.doesNotMatch(about, /RowHeading|recommendationsNumber|cvNumber|padStart/)
  assert.doesNotMatch(read('components/LandingPage/LandingCVSections.tsx'), /index: idx|const idx/)
})

/** Modules outside components/Admin that only the admin loads (they may keep their own markers). */
const ADMIN_ONLY = [path.join('components', 'Common', 'PanelFallback.tsx')]

/** Public UI source: components (not the admin), pages (not the admin, not API routes but the social card), layout. */
function publicSources(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (rel === path.join('components', 'Admin') || rel === path.join('pages', 'admin')) continue
        if (rel === path.join('pages', 'api')) continue
        walk(rel)
      } else if (/\.tsx$/.test(e.name) && !ADMIN_ONLY.includes(rel)) out.push(rel)
    }
  }
  for (const d of ['components', 'pages', 'layout']) walk(d)
  out.push(path.join('pages', 'api', 'og.tsx'))
  return out
}

/** `[{expr}]` in source — an expression wrapped in literal brackets — but not an array of objects. */
const BRACKET_MARKER = /\[\{(?!\s*(?:[\w$'"-]+\s*:|\.\.\.))[^}]*\}\]/

test('the bracket guard catches the old markers and leaves arrays of objects alone', () => {
  for (const old of ['[{padded}]', "[{r.kind === 'post' ? 'POST' : 'WORK'}]", '[{String(n).padStart(2, "0")}]', '[{kindLabel(p.kind, p.lang)}]']) {
    assert.match(old, BRACKET_MARKER, old)
  }
  for (const ok of ['[{ t: 1, x: 0 }]', "[{ path: '/a' }]", '[{ ...rest }]', "[{ 'a-b': 1 }]"]) assert.doesNotMatch(ok, BRACKET_MARKER, ok)
})

test('no public component renders a "[NN]" index, a bracket marker or a zero-padded index label', () => {
  const files = publicSources()
  assert.ok(files.length > 50, `scanned ${files.length} files`)
  const offenders: string[] = []
  for (const f of files) {
    const src = stripComments(read(f))
    // JSX text that wraps an expression or a word in brackets: [{n}], [POST], [01]
    // (not an array of objects: `[{ a: 1 }]`, `[{ ...x }]`).
    if (BRACKET_MARKER.test(src)) offenders.push(`${f}: [{…}] marker`)
    if (/>\s*\[[A-Z0-9][A-Z0-9 _-]*\]\s*</.test(src)) offenders.push(`${f}: [WORD] marker`)
    if (/padStart\(2,\s*['"]0['"]\)/.test(src)) offenders.push(`${f}: zero-padded index`)
    if (/className="section-label-rule"/.test(src)) offenders.push(`${f}: old section label rule`)
  }
  assert.deepEqual(offenders, [])
})

test('the drawer, the writing list and the social card drop their index numbers and brackets', () => {
  assert.doesNotMatch(read('components/Header/MobileDrawer.tsx'), /padStart/)
  const writing = stripComments(read('components/LandingPage/LatestWriting.tsx'))
  // The kind labels come from the home dictionary (F3), still without brackets.
  assert.match(writing, /\{r\.kind === 'post' \? w\.post : w\.work\}/)
  assert.doesNotMatch(writing, /\[\{r\.kind/)
  assert.deepEqual([HOME_UI.en.writing.post, HOME_UI.en.writing.work], ['POST', 'WORK'])
  for (const l of Object.values(HOME_UI)) assert.doesNotMatch(`${l.writing.post}${l.writing.work}`, /[[\]]/)
  assert.match(read('pages/api/og.tsx'), />\{kindLabel\(p\.kind, p\.lang\)\}</)
})

test('the token guard covers SectionHeading, and the docs describe the plain headings', () => {
  const config = JSON.parse(read('.eslintrc.json')) as { overrides: { files: string[]; rules: Record<string, unknown> }[] }
  const guard = config.overrides.find((o) => o.rules['no-restricted-syntax'])
  assert.ok(guard?.files.includes('components/General-UI/SectionHeading.tsx'))
  assert.ok(!guard?.files.includes('components/General-UI/SectionLabel.tsx'))
  assert.match(read('CONTRIBUTING.md'), /SectionHeading/)
  for (const doc of ['README.md', 'README.zh.md', 'CONTRIBUTING.md']) assert.doesNotMatch(read(doc), /`\[NN\]`/, doc)
})
