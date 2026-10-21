import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * HEADER-ADMIN (review round 3): the structure the e2e checks
 * (e2e/review-r3-header.spec.ts) rest on.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|(^|[^:])\/\/.*$/gm, '$1')

test('the owner\'s controls are one lazily loaded menu beside the wordmark, not buttons in the right-hand group', () => {
  const header = code('components/Header/Header.tsx')
  // Only a type import: the menu's code is its own chunk, fetched with the session check.
  assert.match(header, /^import type AdminMenu from '\.\/AdminMenu'$/m)
  assert.doesNotMatch(header, /^import AdminMenu\b/m)
  assert.match(header, /const loadAdminMenu = \(\) => import\('\.\/AdminMenu'\)/)
  assert.doesNotMatch(header, /href="\/admin\/dashboard"/, 'no Dashboard button in the header row')
  assert.doesNotMatch(header, /t\.logoutTitle|t\.dashboard/)
  // Beside the wordmark, before the live status, which waits for the session answer.
  const left = header.slice(header.indexOf('data-script="latin"'), header.indexOf('as="nav"'))
  assert.match(left, /\{isAdmin && OwnerMenu \? <OwnerMenu onLogout=\{logout\} \/> : null\}\s*\{visitorKnown && <LiveStatus \/>\}/)
  // The language switch's place is kept whoever is signed in.
  assert.match(header, /<LanguageSwitch links=\{langLinks\} reserveFor=\{uiLang === 'en' \? ZH_LANG : 'en'\} \/>/)
  assert.doesNotMatch(header, /reserveFor=\{isAdmin/)
  // The trigger keys are not imported by the menu (that would split them out of the shared chunk).
  const menu = code('components/Header/AdminMenu.tsx')
  assert.doesNotMatch(menu, /import \{[^}]*triggerKeyFocus/)
  assert.match(menu, /aria-haspopup="menu"/)
  assert.match(menu, /role="menuitem"/)
  assert.match(menu, /display=\{\{ base: 'none', lg: 'inline-flex' \}\}/)
})

test('a ninth nav link (Publications) tightens the links and drops the ⌘K word, in CSS', () => {
  const css = read('styles/globals.css')
  assert.match(css, /\.site-header nav:has\(> a:nth-of-type\(9\)\) \{\s*--nav-item-px: 7px;\s*gap: 2px;\s*\}/)
  assert.match(css, /\.site-header:has\(nav > a:nth-of-type\(9\)\) \[data-search-label\] \{\s*display: none;\s*\}/)
  const header = code('components/Header/Header.tsx')
  assert.match(header, /px="var\(--nav-item-px, 10px\)"/)
  assert.match(header, /left="var\(--nav-item-px, 10px\)"\s*right="var\(--nav-item-px, 10px\)"/)
  assert.match(header, /data-search-label=""/)
})
