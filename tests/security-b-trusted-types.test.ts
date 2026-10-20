/**
 * security-b / I2 — Trusted Types (report-only) with the page's default
 * policy (lib/trustedTypesDefault.ts):
 *   - the policy approves exactly the safe shapes the framework and the app
 *     write (markup-free HTML, the e-mail markers, React's inert script,
 *     JSON script text, this build's chunk URLs) and nothing else;
 *   - it is harmless where Trusted Types are missing or a default policy
 *     already exists;
 *   - the inline scripts and every dangerouslySetInnerHTML value pass it
 *     (QR codes are drawn as elements: tests/security-b-qr.test.ts).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire, register } from 'node:module'
import { TRUSTED_TYPES_DEFAULT_POLICY, TRUSTED_TYPES_DEFAULT_POLICY_SCRIPT } from '../lib/trustedTypesDefault'
import { INLINE_SCRIPTS } from '../lib/security/inlineScripts'
import { TAG_PREPAINT_SCRIPT } from '../lib/tagFilter'
import { monoFallbackFontFaces } from '../lib/monoFallback'
import { serializeJsonLd } from '../lib/schema'

// node:test runs TypeScript but not JSX: transpile the component this file imports.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      import { readFileSync } from 'node:fs'
      import { fileURLToPath } from 'node:url'
      import { createRequire } from 'node:module'
      const require = createRequire(${JSON.stringify(new URL('../package.json', import.meta.url).href)})
      const ts = require('typescript')
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
const { emailOffHtml } = await import('../components/Common/EmailText')

const ROOT = path.join(import.meta.dirname, '..')
const { TRUSTED_TYPES_POLICIES, buildReportOnlyCsp } = createRequire(import.meta.url)('../lib/csp.js') as {
  TRUSTED_TYPES_POLICIES: string[]
  buildReportOnlyCsp: () => string
}

type Rules = {
  createHTML: (s: unknown) => string | null
  createScript: (s: unknown) => string | null
  createScriptURL: (s: unknown) => string | null
}

/** Run the inline script against a fake `window.trustedTypes`; returns the policy it created. */
function loadPolicy(origin = 'https://lucian-dev.com'): { name: string; rules: Rules } {
  const created: { name: string; rules: Rules }[] = []
  const window = {
    trustedTypes: {
      createPolicy(name: string, rules: Rules) {
        created.push({ name, rules })
        return rules
      },
    },
  }
  vm.runInNewContext(TRUSTED_TYPES_DEFAULT_POLICY_SCRIPT, {
    window,
    location: { origin, href: `${origin}/blog/x` },
    document: { baseURI: `${origin}/blog/x` },
    URL,
  })
  assert.equal(created.length, 1, 'exactly one policy')
  return created[0]
}

test('the default policy is created under the name the report-only policy allows', () => {
  const { name } = loadPolicy()
  assert.equal(name, TRUSTED_TYPES_DEFAULT_POLICY)
  assert.ok(TRUSTED_TYPES_POLICIES.includes(TRUSTED_TYPES_DEFAULT_POLICY))
  assert.match(buildReportOnlyCsp(), /trusted-types default nextjs nextjs#bundler;/)
  // It is an inline script: hashed for the CSP, rendered first in <body>.
  assert.equal(INLINE_SCRIPTS[0].source, TRUSTED_TYPES_DEFAULT_POLICY_SCRIPT)
  const doc = fs.readFileSync(path.join(ROOT, 'pages/_document.tsx'), 'utf8')
  const body = doc.slice(doc.indexOf('<body>'))
  assert.ok(body.indexOf('TRUSTED_TYPES_DEFAULT_POLICY_SCRIPT') < body.indexOf('THEME_PREPAINT_SCRIPT'), 'before the other scripts')
  assert.ok(body.indexOf('TRUSTED_TYPES_DEFAULT_POLICY_SCRIPT') < body.indexOf('<NextScript'), 'before any Next.js script')
})

test('createHTML: text without markup, the e-mail markers and React’s inert script only', () => {
  const { createHTML } = loadPolicy().rules
  for (const ok of [
    'plain text &amp; entities',
    '@font-face{font-family:"Geist Mono Fallback";src:local("Arial")}',
    '[{"@context":"https://schema.org","@type":"Person","name":"Example \\u003cPerson\\u003e"}]',
    '',
    emailOffHtml('someone@example.com'),
    emailOffHtml('+1 555 0100 <script>'), // escaped by EmailText: no markup left
    '<script></script>',
    TAG_PREPAINT_SCRIPT, // React re-renders the tag filter's <script> after a client-side navigation
  ]) {
    assert.equal(createHTML(ok), ok, ok)
  }
  for (const bad of [
    '<b>bold</b>',
    '<img src=x onerror=alert(1)>',
    '<svg viewBox="0 0 1 1"><path d="M0 0h1"/></svg>',
    '<!--email_off--><img src=x onerror=alert(1)><!--/email_off-->',
    '<!--email_off-->a@example.com<!--/email_off--><b>',
    '<!-- comment -->',
    '<script>alert(1)</script>',
    '<script src="/x.js"></script>',
    'text then <iframe srcdoc="x">',
  ]) {
    assert.equal(createHTML(bad), null, bad)
  }
  assert.equal(createHTML({ toString: () => 'plain' }), 'plain', 'non-strings are stringified first')
})

test('createScript: JSON only (side-effect free as a script)', () => {
  const { createScript } = loadPolicy().rules
  for (const ok of ['{"@context":"https://schema.org"}', '[1,2,3]', '"text"', 'null']) assert.equal(createScript(ok), ok)
  for (const bad of ['alert(1)', '', '{"a":1};alert(1)', 'window.x=1', '({})']) assert.equal(createScript(bad), null, bad)
})

test('createScriptURL: this origin’s /_next/static/ files only', () => {
  const { createScriptURL } = loadPolicy().rules
  for (const ok of [
    '/_next/static/chunks/8983-7d76194858bd67aa.js',
    '/_next/static/chunks/pages/blog-7917f8e0aa.js?dpl=abc',
    'https://lucian-dev.com/_next/static/chunks/main.js',
    '/_next/static/yRRIBkzE_zShsDgChZGry/_buildManifest.js',
  ]) {
    assert.equal(createScriptURL(ok), ok, ok)
  }
  for (const bad of [
    'https://evil.example/_next/static/chunks/a.js',
    '//evil.example/_next/static/chunks/a.js',
    'http://lucian-dev.com/_next/static/chunks/a.js', // another origin (scheme)
    '/api/e',
    '/uploads/a.js',
    '/_next/static/../../api/x.js',
    '/_next/image?url=x',
    'javascript:alert(1)',
    'data:text/javascript,alert(1)',
    'blob:https://lucian-dev.com/1234',
  ]) {
    assert.equal(createScriptURL(bad), null, bad)
  }
})

test('harmless without Trusted Types, or when a default policy already exists', () => {
  const run = (window: unknown) =>
    vm.runInNewContext(TRUSTED_TYPES_DEFAULT_POLICY_SCRIPT, { window, location: { origin: 'https://x.test' }, document: {}, URL })
  assert.doesNotThrow(() => run({}))
  assert.doesNotThrow(() => run({ trustedTypes: {} }))
  assert.doesNotThrow(() =>
    run({
      trustedTypes: {
        createPolicy() {
          throw new TypeError('Policy with name "default" already exists.')
        },
      },
    }),
  )
})

test('no inline script contains "<" (safe to inline, and it passes createHTML when React re-renders it)', () => {
  for (const s of INLINE_SCRIPTS) assert.ok(!s.source.includes('<'), s.id)
})

test('dangerouslySetInnerHTML only where the value passes the default policy', () => {
  // file → why its value is approved (markup-free, or a hashed inline script).
  const allowed = new Map<string, RegExp>([
    ['pages/_document.tsx', /__html: (TRUSTED_TYPES_DEFAULT_POLICY_SCRIPT|THEME_PREPAINT_SCRIPT|THEME_COLOR_PREPAINT_SCRIPT) /],
    ['pages/_app.tsx', /__html: FONT_VARIABLES_CSS /], // CSS custom properties, no markup
    ['components/General-UI/CustomHead.tsx', /__html: serializeJsonLd\(jsonLd\) /], // JSON with < escaped (lib/schema.ts)
    ['components/Article/TagFilter.tsx', /__html: TAG_PREPAINT_SCRIPT /],
    ['components/Common/EmailText.tsx', /__html: emailOffHtml\(value\) /],
  ])
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) walk(rel)
      else if (/\.tsx?$/.test(e.name)) files.push(rel)
    }
  }
  for (const d of ['pages', 'components', 'layout']) if (fs.existsSync(path.join(ROOT, d))) walk(d)
  const seen = new Set<string>()
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8')
    for (const m of code.matchAll(/dangerouslySetInnerHTML=\{\{([^}]*)\}\}/g)) {
      const rule = allowed.get(f)
      assert.ok(rule && rule.test(`${m[1].trim()} `), `${f}: dangerouslySetInnerHTML={{${m[1]}}} — render elements instead, or make sure the value passes lib/trustedTypesDefault.ts and list it here`)
      seen.add(f)
    }
  }
  assert.deepEqual([...seen].sort(), [...allowed.keys()].sort(), 'every listed use still exists')
  // The approved values really pass: the font CSS (its generated part) and escaped JSON-LD.
  const { createHTML } = loadPolicy().rules
  const fontCss = monoFallbackFontFaces()
  assert.equal(createHTML(fontCss), fontCss)
  const jsonLd = serializeJsonLd({ '@context': 'https://schema.org', name: '</script><img src=x onerror=alert(1)>' })
  assert.equal(createHTML(jsonLd), jsonLd)
})
