/**
 * Web Vitals attribution (G6): which element and which phase made a page
 * slow, in a form that names no visitor.
 *
 * The browser (lib/analytics/client.ts) loads web-vitals' attribution build
 * after the page has loaded and turns each LCP / INP / CLS report into a
 * small object built ONLY from numbers, fixed enumerations and a CSS
 * selector of the site's own markup (reduced by `reduceSelector`: tag, id
 * and class names, never text, never an attribute value, at most 120
 * characters). The ingest endpoint validates it again with
 * `parseAttribution` and stores it with the measurement (vitals.attr); the
 * admin's Web Vitals panel aggregates it per page and element
 * (lib/analytics/query.ts).
 *
 * Pure: no DOM or Node APIs, shared by the beacon, the endpoint and tests.
 */

export const ATTRIBUTED_VITALS = ['LCP', 'INP', 'CLS'] as const
export type AttributedVital = (typeof ATTRIBUTED_VITALS)[number]

export const LOAD_STATES = ['loading', 'dom-interactive', 'dom-content-loaded', 'complete'] as const
export type LoadState = (typeof LOAD_STATES)[number]

/** LCP: the element, whether it is an image, and the four sub-parts (ms) that add up to the LCP time. */
export type LcpAttribution = {
  el: string | null
  kind: 'image' | 'text'
  ttfb: number
  loadDelay: number
  loadTime: number
  renderDelay: number
}

/** INP: the element interacted with, how, the three phases (ms) and the page's load state at the time. */
export type InpAttribution = {
  el: string | null
  type: 'pointer' | 'keyboard' | null
  inputDelay: number
  processing: number
  presentation: number
  state: LoadState | null
}

/** CLS: the element that moved most in the largest burst of shifts, the burst's largest shift and the load state. */
export type ClsAttribution = {
  el: string | null
  shift: number
  state: LoadState | null
}

export type VitalAttribution = LcpAttribution | InpAttribution | ClsAttribution

export const SELECTOR_MAX = 120
/** Selector parts kept, counted from the element itself. */
const SELECTOR_PARTS = 3
/** Class names kept per selector part. */
const CLASSES_PER_PART = 2
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/
const TAG_RE = /^[a-z][a-z0-9-]{0,31}$/
/** emotion's generated class names (css-1x2y3z): noise, and they change with every style edit. */
const GENERATED_CLASS_RE = /^css-[a-z0-9]+$/
/** What a stored selector may contain. */
export const SELECTOR_RE = /^[A-Za-z0-9#._>-]{1,120}$/

/** One `tag#id.class` part of a web-vitals selector, cleaned; null when nothing meaningful is left. */
function reducePart(raw: string): string | null {
  const m = /^([A-Za-z][A-Za-z0-9-]*)?(?:#([^.#]+))?((?:\.[^.#]+)*)$/.exec(raw.trim())
  if (!m) return null
  const tag = (m[1] || '').toLowerCase()
  const id = m[2] && NAME_RE.test(m[2]) ? m[2] : ''
  const classes = (m[3] || '')
    .split('.')
    .filter((c) => c && NAME_RE.test(c) && !GENERATED_CLASS_RE.test(c))
    .slice(0, CLASSES_PER_PART)
  const head = tag && TAG_RE.test(tag) ? tag : ''
  if (!head && !id && !classes.length) return null
  return `${head}${id ? `#${id}` : ''}${classes.map((c) => `.${c}`).join('')}`
}

/**
 * A web-vitals selector (`html>body>div#__next>main#main>img.hero-photo`)
 * reduced to its last three meaningful parts (`main#main>img.hero-photo`):
 * tag, id and at most two class names each; generated class names, ids
 * with unusual characters (React's `:r1:`) and text nodes are dropped.
 * At most SELECTOR_MAX characters (the leading parts go first); null when
 * nothing is left.
 */
export function reduceSelector(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const parts = raw
    .slice(0, 1000)
    .split('>')
    .map(reducePart)
    .filter((p): p is string => !!p && p !== 'text')
  let kept = parts.slice(-SELECTOR_PARTS)
  while (kept.length > 1 && kept.join('>').length > SELECTOR_MAX) kept = kept.slice(1)
  const out = kept.join('>').slice(0, SELECTOR_MAX)
  return out && SELECTOR_RE.test(out) ? out : null
}

const ms = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 60_000 ? Math.round(v) : null)
const loadState = (v: unknown): LoadState | null => (typeof v === 'string' && (LOAD_STATES as readonly string[]).includes(v) ? (v as LoadState) : null)

/** The fields of web-vitals' (v4) attribution objects this module reads. */
type RawAttribution = Record<string, unknown>

/**
 * The attribution of one web-vitals report, or null (FCP / TTFB, a report
 * without attribution, or one whose numbers are unusable).
 */
export function buildAttribution(name: string, raw: unknown): VitalAttribution | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as RawAttribution
  if (name === 'LCP') {
    const parts = [ms(a.timeToFirstByte), ms(a.resourceLoadDelay), ms(a.resourceLoadDuration ?? a.resourceLoadTime), ms(a.elementRenderDelay)]
    if (parts.some((p) => p === null)) return null
    const [ttfb, loadDelay, loadTime, renderDelay] = parts as number[]
    return { el: reduceSelector(a.element), kind: typeof a.url === 'string' && a.url ? 'image' : 'text', ttfb, loadDelay, loadTime, renderDelay }
  }
  if (name === 'INP') {
    const parts = [ms(a.inputDelay), ms(a.processingDuration), ms(a.presentationDelay)]
    if (parts.some((p) => p === null)) return null
    const [inputDelay, processing, presentation] = parts as number[]
    const type = a.interactionType === 'pointer' || a.interactionType === 'keyboard' ? a.interactionType : null
    return { el: reduceSelector(a.interactionTarget ?? a.eventTarget), type, inputDelay, processing, presentation, state: loadState(a.loadState) }
  }
  if (name === 'CLS') {
    const shift = typeof a.largestShiftValue === 'number' && Number.isFinite(a.largestShiftValue) ? a.largestShiftValue : 0
    if (shift < 0 || shift > 10) return null
    return { el: reduceSelector(a.largestShiftTarget), shift: Math.round(shift * 10_000) / 10_000, state: loadState(a.loadState) }
  }
  return null
}

const selectorOrNull = (v: unknown): string | null | undefined => {
  if (v === null || v === undefined) return null
  return typeof v === 'string' && SELECTOR_RE.test(v) ? v : undefined
}

/**
 * Server-side check of a beacon's `a` field for a vital called `name`:
 * exactly the shape buildAttribution produces (unknown keys dropped,
 * selectors re-validated, numbers range-checked and rounded), or null.
 */
export function parseAttribution(name: string, raw: unknown): VitalAttribution | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const a = raw as Record<string, unknown>
  const el = selectorOrNull(a.el)
  if (el === undefined) return null
  if (name === 'LCP') {
    const parts = [ms(a.ttfb), ms(a.loadDelay), ms(a.loadTime), ms(a.renderDelay)]
    if (parts.some((p) => p === null) || (a.kind !== 'image' && a.kind !== 'text')) return null
    const [ttfb, loadDelay, loadTime, renderDelay] = parts as number[]
    return { el, kind: a.kind, ttfb, loadDelay, loadTime, renderDelay }
  }
  if (name === 'INP') {
    const parts = [ms(a.inputDelay), ms(a.processing), ms(a.presentation)]
    if (parts.some((p) => p === null)) return null
    const [inputDelay, processing, presentation] = parts as number[]
    const type = a.type === 'pointer' || a.type === 'keyboard' ? a.type : null
    return { el, type, inputDelay, processing, presentation, state: loadState(a.state) }
  }
  if (name === 'CLS') {
    if (typeof a.shift !== 'number' || !Number.isFinite(a.shift) || a.shift < 0 || a.shift > 10) return null
    return { el, shift: Math.round(a.shift * 10_000) / 10_000, state: loadState(a.state) }
  }
  return null
}

// ── Report (GET /api/admin/analytics) ─────────────────────────────────────

/** One page × element group of LCP / INP / CLS samples that carried attribution. */
export type VitalAttributionRow = {
  name: AttributedVital
  route: string
  /** The reduced selector, or null when the browser could not name the element. */
  el: string | null
  samples: number
  /** 75th percentile of the metric over the group. */
  p75: number
  /** Samples rated poor. */
  poor: number
  /** LCP: share of samples whose element was an image (0–1). */
  imageShare?: number
  /** p75 of each phase (ms): LCP ttfb / loadDelay / loadTime / renderDelay, INP inputDelay / processing / presentation. */
  phases?: Record<string, number>
  /** INP: the most frequent interaction type. */
  type?: 'pointer' | 'keyboard' | null
  /** INP / CLS: the most frequent load state. */
  state?: LoadState | null
}

/** Phase keys per metric, in the order they happen. */
export const ATTRIBUTION_PHASES: Record<'LCP' | 'INP', readonly string[]> = {
  LCP: ['ttfb', 'loadDelay', 'loadTime', 'renderDelay'],
  INP: ['inputDelay', 'processing', 'presentation'],
}

export const PHASE_LABEL: Record<string, string> = {
  ttfb: 'Server response',
  loadDelay: 'Load delay',
  loadTime: 'Load time',
  renderDelay: 'Render delay',
  inputDelay: 'Input delay',
  processing: 'Processing',
  presentation: 'Presentation',
}

export const LOAD_STATE_LABEL: Record<LoadState, string> = {
  loading: 'while loading',
  'dom-interactive': 'before DOMContentLoaded',
  'dom-content-loaded': 'before load',
  complete: 'after load',
}

// ── Admin view (components/Admin/VitalsAttribution.tsx) ───────────────────

/** One phase of a row's breakdown: its p75 (ms) and its share of the phases' sum (0–1). */
export type PhaseSegment = { key: string; label: string; ms: number; share: number }

/**
 * The phases of an LCP / INP row in the order they happen, each with its
 * share of their sum (the bar's segments; the p75s of the phases do not add
 * up to the metric's p75, so the bar shows composition, the text the
 * values). Empty for CLS or a row without phases.
 */
export function phaseSegments(row: Pick<VitalAttributionRow, 'name' | 'phases'>): PhaseSegment[] {
  if (row.name === 'CLS' || !row.phases) return []
  const keys = ATTRIBUTION_PHASES[row.name]
  const values = keys.map((k) => {
    const v = row.phases?.[k]
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
  })
  const total = values.reduce((s, v) => s + v, 0)
  return keys.map((key, i) => ({ key, label: PHASE_LABEL[key] || key, ms: values[i], share: total > 0 ? values[i] / total : 0 }))
}

/** The phase that takes the most time ("Load time"), or null when there is none. */
export function dominantPhase(row: Pick<VitalAttributionRow, 'name' | 'phases'>): PhaseSegment | null {
  const segments = phaseSegments(row).filter((s) => s.ms > 0)
  if (!segments.length) return null
  return segments.reduce((best, s) => (s.ms > best.ms ? s : best))
}

/** LCP: "image", "text" or "image or text" from the share of image samples. */
export function lcpKindLabel(imageShare: number | undefined): string | null {
  if (typeof imageShare !== 'number' || !Number.isFinite(imageShare)) return null
  if (imageShare >= 0.8) return 'image'
  if (imageShare <= 0.2) return 'text'
  return 'image or text'
}
