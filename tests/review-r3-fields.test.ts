/**
 * Review round 3, fix3-F — the admin's form fields; the running screens are
 * checked in e2e/review-r3-fields.spec.ts.
 *
 *   ERROR-BORDER   Chakra draws a field's focus and invalid rings from its
 *                  `focusBorderColor` / `errorBorderColor` props through its
 *                  own colour parser (theme-tools getColor), which knows the
 *                  palette only: a semantic token ('status.warning') or a
 *                  var() comes out #000000 — the schedule dialog's "that time
 *                  has passed" ring was black, invisible on the dark page.
 *                  Guard: every such prop anywhere in the source is a
 *                  palette token (per colour mode where it matters) that
 *                  resolves to a colour ≥ 3:1 on every admin surface.
 *   FIELD-BORDERS  an admin field's edge is the admin theme's
 *                  --control-border (≥ 3:1), never a hairline set on the
 *                  field itself (page.border-strong was ~1.4:1); the focus
 *                  ring is the accent by default; nothing that holds fields
 *                  is faded by opacity.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { getColor } from '@chakra-ui/theme-tools'

import theme from '../theme/chakra.js'
import { ADMIN_COMPONENT_STYLES, CONTROL_BORDER, FIELD_BOUNDARY, FIELD_RING, withAdminFieldContrast } from '../theme/adminComponents'
import { semanticColors } from '../theme/color'

const ROOT = process.cwd()
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

type AnyTheme = { colors: Record<string, unknown>; components: Record<string, any>; semanticTokens: { colors: Record<string, unknown> } }
const appTheme = theme as unknown as AnyTheme

const MODES = ['light', 'dark'] as const
type Mode = (typeof MODES)[number]

const hexRgb = (hex: string) => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
}
function luminance(hex: string): number {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** Where an admin field sits: the page, cards and dialogs (bg-elevated), menus' active rows and wells (bg-overlay). */
const SURFACES = ['page.bg', 'page.bg-elevated', 'page.bg-overlay'] as const
const surface = (name: (typeof SURFACES)[number], mode: Mode) => semanticColors[name][mode]

// ── The guard ──────────────────────────────────────────────────────────────

/** The Chakra props whose colour goes through theme-tools getColor (Input, Textarea, Select, NumberInput, PinInput). */
const RING_PROPS = new Set(['focusBorderColor', 'errorBorderColor'])

type Leaf = { value: string; modes: readonly Mode[] }
type Site = { file: string; line: number; prop: string; leaves: Leaf[]; problem?: string }

/**
 * The string values a ring prop can take: literals, through ternaries,
 * parentheses, `useColorModeValue(light, dark)` (each argument for its mode)
 * and same-file constants. Anything else cannot be checked, which is itself
 * a failure: write the token where the guard can see it.
 */
function leavesOf(expr: ts.Expression, consts: Map<string, ts.Expression>, modes: readonly Mode[], seen = new Set<string>()): Leaf[] | string {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [{ value: expr.text, modes }]
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr)) return leavesOf(expr.expression, consts, modes, seen)
  if (ts.isConditionalExpression(expr)) {
    const a = leavesOf(expr.whenTrue, consts, modes, seen)
    const b = leavesOf(expr.whenFalse, consts, modes, seen)
    return typeof a === 'string' ? a : typeof b === 'string' ? b : [...a, ...b]
  }
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'useColorModeValue' && expr.arguments.length === 2) {
    const a = leavesOf(expr.arguments[0], consts, ['light'], seen)
    const b = leavesOf(expr.arguments[1], consts, ['dark'], seen)
    return typeof a === 'string' ? a : typeof b === 'string' ? b : [...a, ...b]
  }
  if (ts.isIdentifier(expr) && consts.has(expr.text) && !seen.has(expr.text)) return leavesOf(consts.get(expr.text)!, consts, modes, new Set([...seen, expr.text]))
  // `props.focusBorderColor || FALLBACK`: the incoming prop is checked where it is set; the fallback here.
  if (ts.isBinaryExpression(expr) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(expr.operatorToken.kind)) {
    const passThrough = (e: ts.Expression) => ts.isPropertyAccessExpression(e) && RING_PROPS.has(e.name.text)
    const sides = [expr.left, expr.right].filter((e) => !passThrough(e)).map((e) => leavesOf(e, consts, modes, seen))
    const err = sides.find((x) => typeof x === 'string')
    return err !== undefined ? err : (sides as Leaf[][]).flat()
  }
  // `RING.focus`, a key of a same-file constant object.
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) && consts.has(expr.expression.text)) {
    let obj = consts.get(expr.expression.text)!
    while (ts.isAsExpression(obj) || ts.isParenthesizedExpression(obj)) obj = obj.expression
    const prop = ts.isObjectLiteralExpression(obj) ? obj.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === expr.name.text) : undefined
    if (prop && ts.isPropertyAssignment(prop)) return leavesOf(prop.initializer, consts, modes, seen)
  }
  return `not a checkable value: ${expr.getText()}`
}

/** Every focusBorderColor / errorBorderColor in a source text (JSX attributes and object keys). */
function ringSites(file: string, source: string): Site[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const consts = new Map<string, ts.Expression>()
  const collect = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) consts.set(n.name.text, n.initializer)
    ts.forEachChild(n, collect)
  }
  collect(sf)
  const sites: Site[] = []
  const add = (node: ts.Node, prop: string, value: ts.Expression | undefined) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1
    const leaves = value ? leavesOf(value, consts, MODES) : 'no value'
    sites.push(typeof leaves === 'string' ? { file, line, prop, leaves: [], problem: leaves } : { file, line, prop, leaves })
  }
  const visit = (n: ts.Node) => {
    if (ts.isJsxAttribute(n) && RING_PROPS.has(n.name.getText())) {
      const init = n.initializer
      add(n, n.name.getText(), init && ts.isJsxExpression(init) ? init.expression : (init as ts.Expression | undefined))
    } else if (ts.isPropertyAssignment(n) && RING_PROPS.has(n.name.getText().replace(/['"]/g, ''))) {
      add(n, n.name.getText(), n.initializer)
    } else if (ts.isShorthandPropertyAssignment(n) && RING_PROPS.has(n.name.text)) {
      add(n, n.name.text, n.name)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return sites
}

/** Why a ring value is wrong, or null when Chakra resolves it to a colour ≥ 3:1 on every admin surface of its modes. */
function ringProblem(leaf: Leaf): string | null {
  const v = leaf.value.trim()
  if (/var\(|^--/.test(v)) return `${v}: a CSS variable — Chakra's colour parser turns it into #000000`
  if (v in appTheme.semanticTokens.colors) return `${v}: a semantic token — Chakra's colour parser turns it into #000000`
  const hex = getColor(appTheme, v, null as unknown as string) as string | null
  if (!hex || !/^#[0-9a-f]{3,8}$/i.test(hex)) return `${v}: not a palette colour (Chakra would draw ${hex ?? '#000000'})`
  for (const mode of leaf.modes) {
    for (const s of SURFACES) {
      const r = contrast(hex, surface(s, mode))
      if (r < 3) return `${v} (${hex}) on ${s} in ${mode}: ${r.toFixed(2)} < 3`
    }
  }
  return null
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(rel, out)
    else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(rel)
  }
  return out
}
const SOURCES = ['components', 'pages', 'layout', 'theme', 'lib'].flatMap((d) => sourceFiles(d))

test('ERROR-BORDER: Chakra resolves ring props through its palette only — a semantic token or var() is a black ring', () => {
  // The root cause, as Chakra computes it (theme-tools getColor, used by the Input theme for both rings).
  assert.equal(getColor(appTheme, 'status.warning'), '#000000')
  assert.equal(getColor(appTheme, 'var(--accent)'), '#000000')
  assert.equal(getColor(appTheme, 'page.border-strong'), '#000000')
  assert.equal(getColor(appTheme, 'accent.500'), '#6366f1')
  assert.equal(getColor(appTheme, 'orange.700'), '#9C4221')
  // The Input theme's invalid ring with the old value, and with the palette pair the schedule dialog uses now.
  const outline = appTheme.components.Input.variants.outline
  for (const mode of MODES) {
    assert.equal(outline({ theme, colorMode: mode, errorBorderColor: 'status.warning' }).field._invalid.borderColor, '#000000', mode)
  }
  assert.equal(outline({ theme, colorMode: 'light', errorBorderColor: 'orange.700' }).field._invalid.borderColor, '#9C4221')
  assert.equal(outline({ theme, colorMode: 'dark', errorBorderColor: 'orange.300' }).field._invalid.borderColor, '#F6AD55')
})

test('ERROR-BORDER: the guard catches what broke (semantic tokens, var(), hairlines, unreadable values)', () => {
  const bad = [
    `<Input errorBorderColor="status.warning" />`,
    `<Textarea focusBorderColor="var(--accent)" />`,
    `const p = { isInvalid: true, errorBorderColor: 'status.warning' }`,
    `<Select focusBorderColor={ok ? 'accent.500' : 'page.border-strong'} />`,
    `const c = theme.ring; <Input focusBorderColor={c} />`,
    `<Input errorBorderColor={useColorModeValue('orange.100', 'orange.300')} />`,
    `const RING = { focus: 'var(--accent)' }; const p = { focusBorderColor: props.focusBorderColor || RING.focus }`,
    `<Input focusBorderColor="gray.200" />`,
  ]
  for (const src of bad) {
    const sites = ringSites('probe.tsx', src)
    assert.equal(sites.length, 1, src)
    const failed = sites[0].problem || sites[0].leaves.map(ringProblem).find(Boolean)
    assert.ok(failed, `not caught: ${src}`)
  }
  const good = [
    `<Input focusBorderColor="accent.500" />`,
    `<Textarea focusBorderColor={ok ? 'accent.500' : 'red.500'} />`,
    `export function useWarnFieldProps() { return { errorBorderColor: useColorModeValue('orange.700', 'orange.300') } }`,
    `const RING = { focus: 'accent.500' } as const; const p = { focusBorderColor: props.focusBorderColor || RING.focus }`,
  ]
  for (const src of good) {
    const sites = ringSites('probe.tsx', src)
    assert.equal(sites.length, 1, src)
    assert.equal(sites[0].problem, undefined, src)
    assert.deepEqual(sites[0].leaves.map(ringProblem).filter(Boolean), [], src)
  }
})

test('ERROR-BORDER: every focusBorderColor / errorBorderColor in the source is a palette token ≥ 3:1 on every admin surface of its colour mode', () => {
  const sites = SOURCES.flatMap((file) => {
    const src = read(file)
    return /focusBorderColor|errorBorderColor/.test(src) ? ringSites(file, src) : []
  }).filter((s) => !s.file.startsWith('tests/'))
  const problems = sites.flatMap((s) => (s.problem ? [`${s.file}:${s.line} ${s.prop}: ${s.problem}`] : s.leaves.map(ringProblem).filter(Boolean).map((p) => `${s.file}:${s.line} ${s.prop}: ${p}`)))
  assert.deepEqual(problems, [])
  // Not vacuous: the shared field props, the warning ring and the editors' own fields are all seen.
  const seen = (file: string, prop: string) => sites.some((s) => s.file === file && s.prop === prop)
  assert.ok(seen('components/Admin/shell/ui.tsx', 'focusBorderColor'), 'shell inputProps')
  assert.ok(seen('components/Admin/shell/ui.tsx', 'errorBorderColor'), 'the warning ring')
  assert.ok(seen('components/Admin/cvStudio/fields.tsx', 'focusBorderColor'), 'studio inputProps')
  assert.ok(seen('components/Admin/CVEditor.tsx', 'focusBorderColor'), 'raw JSON editor')
  assert.ok(seen('theme/adminComponents.ts', 'focusBorderColor'), 'the admin theme’s default ring')
  assert.ok(sites.length >= 8, `${sites.length} sites`)
  // The warning ring is the warning text's pair, per mode.
  const warn = sites.find((s) => s.file === 'components/Admin/shell/ui.tsx' && s.prop === 'errorBorderColor')!
  assert.deepEqual(warn.leaves, [
    { value: 'orange.700', modes: ['light'] },
    { value: 'orange.300', modes: ['dark'] },
  ])
  assert.match(read('components/Admin/shell/ui.tsx'), /warnTextProps = \{ color: 'orange\.700', _dark: \{ color: 'orange\.300' \} \}/)
})

test('ERROR-BORDER: the schedule dialog marks a past or missing time with the warning ring, through the shared hook', () => {
  const dialog = read('components/Admin/editor/ScheduleDialog.tsx')
  assert.doesNotMatch(dialog, /errorBorderColor/, 'no ring colour of its own')
  assert.match(dialog, /const warnField = useWarnFieldProps\(\)/)
  assert.match(dialog, /const invalid = problem \? \{ isInvalid: true, 'aria-describedby': msgId\(label\), \.\.\.warnField \} : \{\}/)
})

// ── FIELD-BORDERS: the admin theme ────────────────────────────────────────

const props = (mode: Mode, extra: Record<string, unknown> = {}) => ({ colorMode: mode, theme, ...extra })

test('FIELD-BORDERS: admin fields — the control border on outline and flushed fields, darker on hover, the accent ring by default', () => {
  const configs = {
    Input: [withAdminFieldContrast(appTheme.components.Input, true), true],
    Select: [withAdminFieldContrast(appTheme.components.Select, true), true],
    NumberInput: [withAdminFieldContrast(ADMIN_COMPONENT_STYLES.NumberInput as any, true), true],
    Textarea: [withAdminFieldContrast(appTheme.components.Textarea, false), false],
  } as const
  for (const mode of MODES) {
    for (const [name, [config, parts]] of Object.entries(configs) as Array<[string, readonly [any, boolean]]>) {
      const field = (variant: string, extra?: Record<string, unknown>) => {
        const v = config.variants[variant](props(mode, extra))
        return parts ? v.field : v
      }
      for (const variant of ['outline', 'flushed']) {
        const f = field(variant)
        assert.equal(f.borderColor, FIELD_BOUNDARY.borderColor, `${name} ${variant} ${mode}`)
        assert.equal(f._hover.borderColor, FIELD_BOUNDARY.hover, `${name} ${variant} ${mode}`)
      }
      // The accent ring when a field names none (Chakra's default was blue.500 / blue.300) — in every variant.
      for (const variant of ['outline', 'flushed', 'filled']) {
        assert.equal(field(variant)._focusVisible.borderColor, '#6366f1', `${name} ${variant} ${mode}: focus`)
      }
      assert.match(field('outline')._focusVisible.boxShadow, /#6366f1/)
      // A ring a field names is kept; the invalid ring stays Chakra's (red, by mode).
      assert.equal(field('outline', { focusBorderColor: 'red.500' })._focusVisible.borderColor, '#E53E3E')
      assert.equal(field('outline')._invalid.borderColor, mode === 'light' ? '#E53E3E' : '#FC8181', `${name} ${mode}: invalid`)
      assert.equal(field('outline', { errorBorderColor: 'orange.700' })._invalid.borderColor, '#9C4221')
      // A read-only field (the slug of a saved post) keeps the focus ring: Chakra's `boxShadow: none !important` is gone.
      assert.deepEqual(field('outline')._readOnly, { userSelect: 'all' }, `${name} ${mode}: read-only`)
      // Hover comes before the invalid and focus rings, so they win over it.
      const keys = Object.keys(field('outline'))
      assert.ok(keys.indexOf('_hover') < keys.indexOf('_invalid') && keys.indexOf('_invalid') < keys.indexOf('_focusVisible'), `${name}: rule order`)
    }
  }
  // The unstyled variant (the tag field's input inside its own frame) is Chakra's object, untouched.
  assert.equal((withAdminFieldContrast(appTheme.components.Input, true) as any).variants.unstyled, appTheme.components.Input.variants.unstyled)
  assert.deepEqual(FIELD_RING, { focus: 'accent.500' })
  for (const mode of MODES) {
    for (const s of SURFACES) {
      assert.ok(contrast('#6366f1', surface(s, mode)) >= 3, `accent ring on ${s} (${mode})`)
      assert.ok(contrast(CONTROL_BORDER[mode], surface(s, mode)) >= 3, `control border on ${s} (${mode})`)
    }
    // What the shared inputProps used to draw: page.border-strong (and page.muted on hover) — under 3:1.
    const strong = mode === 'light' ? '#d5d5d5' : '#373737' // rgba(0,0,0,0.16) on paper / rgba(255,255,255,0.20) on ink
    assert.ok(contrast(strong, surface('page.bg', mode)) < 2, `the old hairline (${mode})`)
    assert.ok(contrast(semanticColors['page.muted'][mode], surface('page.bg', mode)) < 3, `the old hover (${mode})`)
  }
  const scope = read('components/Admin/AdminThemeScope.tsx')
  assert.match(scope, /NumberInput: withAdminFieldContrast\(ADMIN_COMPONENT_STYLES\.NumberInput, true\)/)
})

// ── FIELD-BORDERS: the admin's source ──────────────────────────────────────

const FIELD_TAGS = new Set(['Input', 'Textarea', 'Select', 'NumberInput', 'NumberInputField', 'PinInputField', 'AutoTextarea'])
const EDGE_PROPS = /^(border(Top|Right|Bottom|Left)?Color|_hover)$/
const ADMIN_SOURCES = SOURCES.filter((f) => /^(components\/Admin|pages\/admin)\//.test(f) && f.endsWith('.tsx'))

test('FIELD-BORDERS: no admin field sets its own edge colour or hover — the theme’s control border is the edge everywhere', () => {
  const offenders: string[] = []
  for (const file of ADMIN_SOURCES) {
    const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (n: ts.Node) => {
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && FIELD_TAGS.has(n.tagName.getText())) {
        for (const a of n.attributes.properties) {
          if (ts.isJsxAttribute(a) && EDGE_PROPS.test(a.name.getText())) offenders.push(`${file}:${sf.getLineAndCharacterOfPosition(a.getStart()).line + 1} <${n.tagName.getText()} ${a.getText()}>`)
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  assert.deepEqual(offenders, [])
  // The shared field props carry the ring only.
  const ui = read('components/Admin/shell/ui.tsx')
  const shared = ui.slice(ui.indexOf('export const inputProps'), ui.indexOf('} as const', ui.indexOf('export const inputProps')))
  assert.doesNotMatch(shared, /borderColor|_hover/)
  const studio = read('components/Admin/cvStudio/fields.tsx')
  const studioShared = studio.slice(studio.indexOf('export const inputProps'), studio.indexOf('}', studio.indexOf('export const inputProps')))
  assert.doesNotMatch(studioShared, /borderColor|_hover/)
})

test('FIELD-BORDERS: fields and the panels around them are muted by words or colour, never faded by opacity', () => {
  assert.doesNotMatch(read('components/Admin/home/AvailabilitySection.tsx'), /opacity=/)
  assert.doesNotMatch(read('components/Admin/home/SectionsSection.tsx'), /opacity=\{visible/)
  const db = read('pages/admin/db-config.tsx')
  assert.doesNotMatch(db, /opacity=\{opsLocked/)
  assert.doesNotMatch(db, /<Eyebrow color="orange\.400"/)
  // Small text in the raw accent or red.400 / orange.400 fails 4.5:1 on paper.
  assert.doesNotMatch(read('pages/admin/reset.tsx'), /color="accent\.500"/)
  assert.doesNotMatch(read('pages/admin/forgot.tsx'), /color="accent\.500"/)
  const security = read('components/Admin/security/SecurityPanel.tsx')
  assert.doesNotMatch(security, /color="(red|orange)\.400"/)
  const raw = read('components/Admin/CVEditor.tsx')
  assert.doesNotMatch(raw, /'red\.400'|bg=\{dirty && valid \? 'var\(--accent\)'|bg="var\(--accent\)" color="white"/)
  assert.match(raw, /isInvalid=\{!parsed\.ok\}/)
})
