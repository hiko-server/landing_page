/**
 * CORR-1 (wave 2B review) — the site's toast host renders every toast in
 * the one toast frame (components/Common/UnifiedToast, policy lib/notify):
 * an error is announced as an alert and stays until dismissed, a success is
 * a polite status that closes on its own. Before the fix the host drew a
 * private copy of Chakra's frame (role="status" for everything, gone after
 * 5 s) and the frame _app passed as `toastOptions.component` was dropped.
 *
 * The components are .tsx; a test-local loader transpiles them with the
 * project's TypeScript (JSX → react/jsx-runtime) so they run under node:test.
 */
import { register } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChakraProvider, toastStore } from '@chakra-ui/react'

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

const ROOT = path.resolve(import.meta.dirname, '..')

/** The markup of one toast (its .chakra-toast element) whose text includes `text`. */
function toastMarkup(html: string, text: string): string {
  const parts = html.split('<div class="chakra-toast"').slice(1)
  const hit = parts.find((p) => p.includes(text))
  assert.ok(hit, `a toast with "${text}" in ${html}`)
  return hit
}

test('the toast host renders each toast in the unified frame: errors are alerts that stay, successes polite and timed', async () => {
  const { ToastRegions } = await import('../components/Chrome/ToastHost')
  const { default: theme } = await import('../theme/chakra.js')
  // Raised before the host renders (e.g. before its chunk has loaded): the store keeps them.
  toastStore.notify(() => 'Save failed: the server said no', { status: 'error', duration: 5000 })
  toastStore.notify(() => 'Saved', { status: 'success', duration: 1000 })
  toastStore.notify(() => 'Uploading…', { status: 'loading' })
  toastStore.notify(() => 'Undo the archive?', { duration: 6000 })
  const html = renderToStaticMarkup(createElement(ChakraProvider, { theme }, createElement(ToastRegions)))

  assert.match(html, /id="chakra-toast-manager-bottom"[^>]*aria-live="polite"|aria-live="polite"[^>]*id="chakra-toast-manager-bottom"/)
  const error = toastMarkup(html, 'Save failed')
  assert.match(error, /data-toast-status="error"/)
  assert.match(error, /data-toast-persistent=""/, 'an error stays until dismissed, whatever duration the caller asked for')
  assert.match(error, /role="alert"/, 'an error is announced as an alert')
  assert.doesNotMatch(error, /role="status"/)

  const success = toastMarkup(html, 'Saved')
  assert.match(success, /data-toast-status="success"/)
  assert.doesNotMatch(success, /data-toast-persistent/, 'a success closes on its own (at least 4 s)')
  assert.match(success, /role="status"/)

  assert.match(toastMarkup(html, 'Uploading'), /data-toast-persistent=""/, 'a loading toast stays until updated')
  const custom = toastMarkup(html, 'Undo the archive')
  assert.match(custom, /data-toast-status="default"/)
  assert.doesNotMatch(custom, /data-toast-persistent/)
  toastStore.closeAll()
})

test('host and frame load together, outside the first-load JS: _app passes no toast component of its own', () => {
  const app = fs.readFileSync(path.join(ROOT, 'pages/_app.tsx'), 'utf8')
  assert.doesNotMatch(app, /import\(?\s*['"][^'"]*UnifiedToast['"]|import UnifiedToast/, 'no second (dead) copy of the frame in _app')
  assert.doesNotMatch(app, /component:\s*\w+/)
  const host = fs.readFileSync(path.join(ROOT, 'components/Chrome/ToastHost.tsx'), 'utf8')
  assert.match(host, /^import UnifiedToast from '\.\.\/Common\/UnifiedToast'$/m, 'the frame is in the host chunk')
  const provider = fs.readFileSync(path.join(ROOT, 'components/Chrome/AppChakraProvider.tsx'), 'utf8')
  assert.match(provider, /dynamic\(\(\) => import\('\.\/ToastHost'\)/, 'the host stays a chunk of its own')
})

test('the host animates its toasts: it brings LazyMotion and MotionConfig, since it renders outside the app\'s MotionProvider', () => {
  const app = fs.readFileSync(path.join(ROOT, 'pages/_app.tsx'), 'utf8')
  // The host is AppChakraProvider's, and AppChakraProvider wraps MotionProvider — not the other way round.
  assert.ok(app.indexOf('<AppChakraProvider') < app.indexOf('<MotionProvider>'))
  const host = fs.readFileSync(path.join(ROOT, 'components/Chrome/ToastHost.tsx'), 'utf8')
  assert.match(host, /<LazyMotion features=\{loadMotionFeatures\}>\s*<MotionConfig reducedMotion="user">/)
})
