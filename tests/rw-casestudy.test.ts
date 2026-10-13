/**
 * reading-work D1 + D2: case-study "At a glance" fields (owner-entered only,
 * cleaned before anything renders), the documented template whose notes
 * never reach the page, the publish checks, covers (real size, small covers
 * on a panel, focal point, typographic fallback) and the JSON-LD.
 */
import { register } from 'node:module'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  cleanDate,
  cleanFocus,
  cleanGlanceFields,
  cleanLinks,
  cleanOutcomes,
  coverWordmark,
  focusPoint,
  outcomeText,
  primaryOutcome,
  safeCaseStudyUrl,
} from '../lib/caseStudy'
import { caseStudyTemplate, emptySections, templateNoteLines, CASE_STUDY_SECTIONS } from '../components/Admin/editor/caseStudyTemplate'
import { runPublishChecks } from '../components/Admin/shell/publishChecks'
import { workFromServer, workToServer, WORK_EMPTY, blogFromServer, blogToServer, BLOG_EMPTY } from '../components/Admin/shell/itemFrontmatter'
import { caseStudyNode } from '../lib/schema'

for (const k of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[k]

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      import { readFileSync } from 'node:fs'
      import { fileURLToPath } from 'node:url'
      import { createRequire } from 'node:module'
      const require = createRequire(${JSON.stringify(new URL('../package.json', import.meta.url).href)})
      const ts = require('typescript')
      export async function resolve(specifier, context, next) {
        if (specifier === 'next/link' || specifier === 'next/router' || specifier === 'next/head') return next(specifier + '.js', context)
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

const html = (el: unknown) => renderToStaticMarkup(el as Parameters<typeof renderToStaticMarkup>[0]).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

/** A PNG header (enough for the size reader): `w`×`h`. */
function pngHeader(w: number, h: number): Buffer {
  const b = Buffer.alloc(64)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  return b
}

const originalCwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-casestudy-'))
let db: typeof import('../lib/db')

before(async () => {
  process.chdir(tmp)
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'public', 'uploads', 'tiny.png'), pngHeader(142, 65))
  fs.writeFileSync(path.join(tmp, 'public', 'uploads', 'big.png'), pngHeader(2400, 1500))
  db = await import('../lib/db')
  const store = await import('../lib/contentStore')
  await store.putItem(
    'work',
    'case',
    {
      title: 'Smart Waste Classification System (SWCS)',
      summary: '  An offline   sorter that physically routes items. ',
      outcomes: [
        { value: '93.59', unit: '%', label: 'Offline classifier accuracy', source: '120-cycle run', sourceUrl: '#results' },
        { value: '61', unit: 'ms', label: 'Recognition time', sourceUrl: 'javascript:alert(1)' },
        { value: '', label: 'no value' },
        { value: '3.29', label: '' },
        'junk',
      ],
      team: 'Solo',
      published: '2026-05-30',
      links: [{ label: 'Demo video', url: 'https://youtu.be/jkAqK3vqILI' }, { label: 'Anchor', url: '#x' }, { label: '', url: 'https://x.dev' }],
      coverFocus: '10% 120%',
    },
    'Body.',
  )
  await store.putItem('blog', 'p1', { title: 'Post', date: '2026-05-30', project: '/work/case/' }, 'Body')
  await store.putItem('blog', 'p2', { title: 'Post 2', date: '2026-05-29', project: 'Not A Slug' }, 'Body')
})

after(() => {
  db.closeDb()
  process.chdir(originalCwd)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('D1 metrics: value and label required, at most four, safe evidence links only', () => {
  const rows = cleanOutcomes([
    { value: ' 93.59 ', unit: '%', label: ' Accuracy ', sourceUrl: '#results' },
    { value: '61', unit: 'ms', label: 'Latency', sourceUrl: 'javascript:alert(1)' },
    { value: '1', label: 'a', sourceUrl: '/blog/x' },
    { value: '2', label: 'b', sourceUrl: 'https://example.com/paper.pdf' },
    { value: '3', label: 'c' },
    { value: '', label: 'missing value' },
  ])
  assert.equal(rows.length, 4)
  assert.deepEqual(rows[0], { value: '93.59', label: 'Accuracy', unit: '%', sourceUrl: '#results' })
  assert.equal(rows[1].sourceUrl, undefined, 'javascript: refused')
  assert.equal(rows[2].sourceUrl, '/blog/x')
  assert.equal(safeCaseStudyUrl('mailto:a@b.c'), '')
  assert.equal(safeCaseStudyUrl('//evil.example'), '')
  assert.deepEqual(cleanLinks([{ label: 'Paper', url: 'https://x.dev/p' }, { label: 'Anchor', url: '#a' }, { label: '', url: 'https://x.dev' }]), [{ label: 'Paper', url: 'https://x.dev/p' }])
  assert.equal(cleanDate('2026-02-30'), '')
  assert.equal(cleanDate('2026-05-30T10:00:00Z'), '2026-05-30')
  assert.equal(cleanDate(new Date('2026-05-30T00:00:00Z')), '2026-05-30')
  assert.equal(cleanFocus('10% 120%'), '')
  assert.equal(cleanFocus(' 33.333% 0% '), '33.3% 0%')
  assert.deepEqual(focusPoint(''), { x: 50, y: 50 })
  assert.equal(outcomeText({ value: '93.59', unit: '%' }), '93.59%')
  assert.equal(outcomeText({ value: '61', unit: 'ms' }), '61 ms')
  assert.equal(primaryOutcome([{ value: '93.59', unit: '%', label: 'Offline classifier accuracy' }]), '93.59% offline classifier accuracy')
  assert.equal(primaryOutcome([{ value: '40', unit: '%', label: 'CPU load saved' }]), '40% CPU load saved')
  assert.equal(primaryOutcome([{ value: '61', unit: 'ms', label: '识别时间' }]), '61 ms 识别时间')
  assert.equal(primaryOutcome([]), '')
})

test('D1 the public loader keeps only valid "At a glance" fields; a post keeps a well-formed project slug', async () => {
  const { listWork, listPosts } = await import('../lib/mdx')
  const [w] = listWork()
  const fm = w.frontmatter
  assert.equal(fm.summary, 'An offline sorter that physically routes items.')
  assert.deepEqual(fm.outcomes, [
    { value: '93.59', label: 'Offline classifier accuracy', unit: '%', source: '120-cycle run', sourceUrl: '#results' },
    { value: '61', label: 'Recognition time', unit: 'ms' },
  ])
  assert.equal(fm.team, 'Solo')
  assert.equal(fm.published, '2026-05-30')
  assert.deepEqual(fm.links, [{ label: 'Demo video', url: 'https://youtu.be/jkAqK3vqILI' }])
  assert.equal('coverFocus' in fm, false, 'an invalid focal point is dropped')
  const posts = Object.fromEntries(listPosts().map((p) => [p.slug, p.frontmatter.project]))
  assert.deepEqual(posts, { p1: 'case', p2: undefined })
  const cleaned = cleanGlanceFields({ title: 't', outcomes: [], summary: ' ', links: 'x' })
  assert.deepEqual(cleaned, { title: 't' })
})

test('D1 the case-study feed dates an item by its publication date when one is set', async () => {
  const { workFeedItems } = await import('../lib/feedHtml')
  const [item] = await workFeedItems('https://lucian-dev.com')
  assert.equal(item.published, '2026-05-30')
  assert.ok(item.modified && item.modified.endsWith('Z'), 'modified stays the last write')
})

test('D1 admin form round trip: half-filled metric rows are kept for the owner, empty ones dropped, focus only with a cover', () => {
  const form = workFromServer({
    title: 'T',
    outcomes: [{ value: '93.59', unit: '%', label: 'Accuracy', source: 'run' }, { value: '2' }],
    links: [{ label: 'Paper', url: 'https://x.dev' }],
    published: '2026-13-01',
    coverFocus: '20% 30%',
  })
  assert.equal(form.outcomes.length, 2)
  assert.equal(form.published, '', 'an impossible date is not loaded')
  assert.equal(form.coverFocus, '20% 30%')
  const saved = workToServer({ ...form, outcomes: [...form.outcomes, { value: ' ', unit: '', label: '', source: '', sourceUrl: '' }], summary: ' Done. ', team: '' }, [])
  assert.deepEqual(saved.outcomes, [{ value: '93.59', unit: '%', label: 'Accuracy', source: 'run' }, { value: '2' }])
  assert.equal(saved.summary, 'Done.')
  assert.equal(saved.team, undefined)
  assert.equal(saved.coverFocus, undefined, 'no cover → no focal point')
  assert.equal(workToServer({ ...form, cover: '/uploads/a.png' }, []).coverFocus, '20% 30%')
  assert.deepEqual(workToServer(WORK_EMPTY, []).outcomes, undefined)
  assert.equal(blogToServer({ ...BLOG_EMPTY, project: ' case ' }, []).project, 'case')
  assert.equal(blogFromServer({ title: 'x' }).project, '')
})

test('D1 the case-study template: six sections whose notes never reach the page', async () => {
  const t = caseStudyTemplate()
  assert.equal((t.match(/^## /gm) || []).length, CASE_STUDY_SECTIONS.length)
  assert.equal(templateNoteLines(t).length, 6)
  assert.equal(emptySections(t).length, 6, 'every section is still empty')
  const { compileMdx } = await import('../lib/mdx')
  const { tree, toc } = await compileMdx(t, { lang: 'en', resolveSize: () => null, srcSetFor: () => null, posterFor: () => null })
  assert.deepEqual(
    toc.map((e) => e.text),
    CASE_STUDY_SECTIONS.map((s) => s.heading),
  )
  assert.ok(!JSON.stringify(tree).includes('Case-study template'), 'guidance notes are dropped by the compiler')
  const written = t.replace(/## The problem\n\n\{\/\*[^\n]*\*\/\}/, '## The problem\n\nSmall venues had no affordable sorter.')
  assert.equal(templateNoteLines(written).length, 5)
  assert.deepEqual(
    emptySections(written).map((s) => s.heading),
    CASE_STUDY_SECTIONS.slice(1).map((s) => s.heading),
  )
  assert.deepEqual(emptySections('## A\n\n```\n## not a heading\n```\n\n## B\n\n### Sub\n'), [])
})

test('D1/D2 publish checks: summary, complete sourced metrics, cover size, template leftovers', () => {
  const base = { title: 'A case study', description: 'x'.repeat(80), body: 'Body text.', slug: 'case', collection: 'work' as const, knownSlugs: { blog: [], work: [] } }
  const ids = (input: Parameters<typeof runPublishChecks>[0]) => runPublishChecks(input).filter((c) => c.level !== 'ok').map((c) => c.id)
  assert.ok(ids(base).includes('summary'))
  const full = runPublishChecks({ ...base, summary: 'It works.', outcomes: [{ value: '93.59', unit: '%', label: 'Accuracy', source: 'run' }] })
  assert.ok(full.some((c) => c.id === 'summary' && c.level === 'ok'))
  assert.ok(full.some((c) => c.id === 'outcomes' && c.level === 'ok' && c.label === '1 metric with a source'))
  const bad = runPublishChecks({ ...base, summary: 'x', outcomes: [{ value: '1', label: '' }, { value: '61', unit: 'ms', label: 'Latency' }] })
  assert.equal(bad.find((c) => c.id === 'outcome-0')?.label, 'Metric 1 needs a value and a label')
  assert.equal(bad.find((c) => c.id === 'outcome-source-1')?.label, 'Metric “61 ms” has no source')
  assert.equal(bad.find((c) => c.id === 'outcome-source-1')?.field, 'outcomes')
  const cover = (w: number) => runPublishChecks({ ...base, cover: '/uploads/a.png', coverWidth: w }).find((c) => c.id === 'cover-size')
  assert.equal(cover(142)?.level, 'warning')
  assert.match(cover(142)?.detail || '', /own size on a tinted panel/)
  assert.equal(cover(1280)?.level, 'warning')
  assert.equal(cover(2400)?.level, 'ok')
  assert.equal(runPublishChecks({ ...base, coverWidth: 142 }).find((c) => c.id === 'cover-size'), undefined, 'no cover, no size check')
  const blog = ids({ ...base, collection: 'blog', body: caseStudyTemplate() })
  assert.ok(!blog.includes('summary'), 'posts have no At a glance')
  assert.ok(blog.includes('template-notes'))
  assert.equal(blog.filter((id) => id.startsWith('empty-section-')).length, 6)
})

test('D2 covers: real size, small covers flagged, focal point, remote covers kept', async () => {
  const { resolveCover } = await import('../lib/coverImage')
  const tiny = resolveCover('/uploads/tiny.png', ' Logo ', '')
  assert.deepEqual(tiny, { src: '/uploads/tiny.png', srcSet: null, alt: 'Logo', width: 142, height: 65, small: true, focus: '50% 50%' })
  const big = resolveCover('/uploads/big.png', '', '20% 80%')
  assert.equal(big?.small, false)
  assert.equal(big?.width, 2400)
  assert.equal(big?.focus, '20% 80%')
  assert.deepEqual(resolveCover('https://cdn.example/x.jpg')?.small, false)
  assert.equal(resolveCover('javascript:alert(1)'), null)
  assert.equal(resolveCover(''), null)
})

test('D2 CoverFrame: cover around the focal point, small cover on a panel, typographic cover without one', async () => {
  const { default: CoverFrame } = await import('../components/Work/CoverFrame')
  const large = html(createElement(CoverFrame, { cover: { src: '/uploads/big.png', srcSet: null, alt: 'Rig', width: 2400, height: 1500, small: false, focus: '20% 80%' }, title: 'T', sizes: '100vw', eager: true }))
  assert.match(large, /data-cover="image"/)
  assert.match(large, /object-position:20% 80%/)
  assert.match(large, /width="2400"[^>]*height="1500"|height="1500"[^>]*width="2400"/)
  assert.match(large, /fetchpriority="high"/)
  assert.match(large, /alt="Rig"/)
  const small = html(createElement(CoverFrame, { cover: { src: '/uploads/tiny.png', srcSet: null, alt: '', width: 142, height: 65, small: true, focus: '50% 50%' }, title: 'T', sizes: '100vw', decorative: true }))
  assert.match(small, /data-cover="small"/)
  assert.ok(!/object-fit:cover/.test(small), 'never cropped and stretched')
  assert.match(small, /max-width:100%/)
  const none = html(createElement(CoverFrame, { cover: null, title: 'Smart Waste Classification System (SWCS)', wordmark: coverWordmark('Smart Waste Classification System (SWCS)'), eyebrow: '2025 – 2026', sizes: '100vw' }))
  assert.match(none, /data-cover="type"/)
  assert.match(none, /aria-hidden="true"/)
  assert.match(none, />SWCS</)
  assert.match(none, /\[case study\]/)
  assert.equal(coverWordmark('Carboy'), 'Carboy')
  assert.equal(coverWordmark('Project RAKU: AI Assistant Job Search System'), 'Project RAKU')
  assert.equal(coverWordmark('A very long project title without any separators at all here'), 'A very long project title…')
})

test('D1 AtAGlance: nothing until filled; a labelled description list with value, unit and source', async () => {
  const { default: AtAGlance } = await import('../components/Article/AtAGlance')
  assert.equal(html(createElement(AtAGlance, {})), '')
  const out = html(
    createElement(AtAGlance, {
      summary: 'An offline sorter.',
      outcomes: [
        { value: '93.59', unit: '%', label: 'Offline classifier accuracy', source: '120-cycle run', sourceUrl: '#results' },
        { value: '61', unit: 'ms', label: 'Recognition time' },
      ],
    }),
  )
  assert.match(out, /<section[^>]*aria-labelledby="glance-heading"/)
  assert.match(out, /<h2[^>]*id="glance-heading"[^>]*>At a glance<\/h2>/)
  assert.match(out, /<p[^>]*>An offline sorter\.<\/p>/)
  assert.match(out, /<dl/)
  assert.equal((out.match(/<dt/g) || []).length, 2)
  assert.match(out, /<dd[^>]*>93\.59<span[^>]*>%<\/span><\/dd>/)
  assert.match(out, /<a[^>]*href="#results"[^>]*>120-cycle run<\/a>/)
})

test('D1 JSON-LD: the summary is the abstract and the publication date is set', () => {
  const node = caseStudyNode({ path: '/work/case', title: 'T', lang: 'en', images: [], abstract: 'It works.', datePublished: '2026-05-30', dateModified: '2026-06-01T00:00:00.000Z' })
  assert.equal(node.abstract, 'It works.')
  assert.equal(node.datePublished, '2026-05-30T00:00:00+08:00')
  assert.equal(node.dateCreated, '2026-05-30T00:00:00+08:00')
  const bare = caseStudyNode({ path: '/work/case', title: 'T', lang: 'en', images: [] })
  assert.equal('abstract' in bare, false)
  assert.equal('datePublished' in bare, false)
})
