import { pageKeyOf, settleWithin } from './viewTransition'

/**
 * Shared-element morphs for route transitions (components/Chrome/
 * RouteTransitions.tsx). Navigation-only code, so it is a chunk of its own,
 * fetched while the browser is idle after load (or on the first press): a
 * navigation that starts before it arrived simply transitions without a
 * morph.
 *
 * A card or list row that stands for a detail page carries that page's
 * pathname in `data-vt-morph`; so does the detail page's own <article>.
 * Inside, `data-vt-part` marks what morphs between the two: the title and,
 * where both sides show the same image, the cover — a large cover as one
 * picture (`cover`), a small one (a logo drawn at its own size on a tinted
 * panel, components/Work/CoverFrame) as its panel (`panel`) and its logo
 * (`logo`), so the logo travels at its own size instead of being scaled up
 * as a bitmap behind the sharp one.
 *
 * Nothing carries a view-transition-name in the markup. A route transition
 * names the parts of exactly one source (the card that was activated, or the
 * page being left) just before the old snapshot, and the matching parts of
 * the incoming page once React has committed it, so a name is never on two
 * elements at once and every other navigation keeps a plain page transition.
 */
export const MORPH_ATTR = 'data-vt-morph'
export const MORPH_PART_ATTR = 'data-vt-part'

export type MorphPart = 'title' | 'cover' | 'panel' | 'logo'

export const MORPH_PARTS: readonly MorphPart[] = ['title', 'cover', 'panel', 'logo']

/** Parts holding an image the update callback waits (briefly) to decode. */
const IMAGE_PARTS: readonly MorphPart[] = ['cover', 'logo']

/**
 * view-transition-name of a part while it morphs. globals.css styles each
 * name: the title is never stretched (each snapshot keeps its own size and
 * the two fade through), the cover scales with its box and the incoming
 * image fades in over the outgoing one, a small cover's panel grows as a box
 * and its logo moves at its own size.
 */
export function morphName(part: MorphPart): string {
  return `vt-morph-${part}`
}

/** Transition type added while parts morph (globals.css gives such a transition more time; RouteTransitions passes it). */
export const MORPH_TYPE = 'morph'

/** The page a morph key names: the pathname, percent-decoded, without a trailing slash. */
export function morphKeyOf(path: string): string {
  const key = pageKeyOf(path)
  let decoded = key
  try {
    decoded = decodeURIComponent(key)
  } catch {
    decoded = key
  }
  return decoded.length > 1 ? decoded.replace(/\/+$/, '') || '/' : decoded
}

/** The collection a detail page belongs to (/blog/a → /blog); null for a top-level page. */
export function parentKeyOf(key: string): string | null {
  const i = key.lastIndexOf('/')
  return i > 0 ? key.slice(0, i) : null
}

type Rect = { top: number; bottom: number; left: number; right: number; width: number; height: number }

type MorphStyle = {
  setProperty(name: string, value: string): void
  removeProperty(name: string): unknown
}

export type MorphElement = {
  style: MorphStyle
  getAttribute(name: string): string | null
  getBoundingClientRect(): Rect
  querySelectorAll(selector: string): ArrayLike<unknown>
  contains(other: unknown): boolean
}

type MorphRoot = { querySelectorAll(selector: string): ArrayLike<unknown> }

export type Viewport = { width: number; height: number }

/** True when a box is at least partly on screen. */
export function inViewport(rect: Rect, viewport: Viewport): boolean {
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < viewport.height && rect.left < viewport.width
}

function elementsOf(root: MorphRoot | MorphElement, selector: string): MorphElement[] {
  try {
    return Array.from(root.querySelectorAll(selector) as ArrayLike<MorphElement>).filter(
      (el) => !!el && typeof el.getAttribute === 'function' && !!el.style,
    )
  } catch {
    return []
  }
}

/**
 * The element on screen that stands for `key`: when several do (a project
 * card and a writing row for the same case study), the one holding
 * `activated` (what the visitor clicked or pressed Enter on), else the first.
 */
export function findMorphElement(root: MorphRoot | null | undefined, key: string, viewport: Viewport, activated: unknown = null): MorphElement | null {
  if (!root || !key) return null
  const onScreen = elementsOf(root, `[${MORPH_ATTR}]`).filter(
    (el) => morphKeyOf(el.getAttribute(MORPH_ATTR) || '') === key && inViewport(el.getBoundingClientRect(), viewport),
  )
  return onScreen.find((el) => !!activated && el.contains(activated)) || onScreen[0] || null
}

/** The parts of `el` that are on screen (the first of each kind). */
export function morphPartsOf(el: MorphElement, viewport: Viewport): Map<MorphPart, MorphElement> {
  const parts = new Map<MorphPart, MorphElement>()
  for (const part of elementsOf(el, `[${MORPH_PART_ATTR}]`)) {
    const kind = part.getAttribute(MORPH_PART_ATTR) as MorphPart
    if (!MORPH_PARTS.includes(kind) || parts.has(kind)) continue
    if (inViewport(part.getBoundingClientRect(), viewport)) parts.set(kind, part)
  }
  return parts
}

export type NamedParts = {
  /** The parts that were named, in MORPH_PARTS order. */
  readonly parts: readonly MorphPart[]
  /** Remove the names again (idempotent). */
  clear(): void
}

/** Gives each part its morph name (restricted to `only` when given). */
export function nameMorphParts(parts: Map<MorphPart, MorphElement>, only?: readonly MorphPart[]): NamedParts {
  const named: Array<[MorphPart, MorphElement]> = []
  for (const kind of MORPH_PARTS) {
    const el = parts.get(kind)
    if (!el || (only && !only.includes(kind))) continue
    el.style.setProperty('view-transition-name', morphName(kind))
    named.push([kind, el])
  }
  let cleared = false
  return {
    parts: named.map(([kind]) => kind),
    clear() {
      if (cleared) return
      cleared = true
      for (const [, el] of named) el.style.removeProperty('view-transition-name')
    },
  }
}

const ORIGINS_MAX = 50

/**
 * Where a detail page flies back to: the page it was opened from by a morph
 * (its list, the home page, /now), else its collection (/blog/a → /blog).
 */
export class MorphOrigins {
  private readonly map = new Map<string, string>()

  record(detailKey: string, originKey: string): void {
    this.map.delete(detailKey)
    this.map.set(detailKey, originKey)
    if (this.map.size > ORIGINS_MAX) this.map.delete(this.map.keys().next().value as string)
  }

  returnTarget(detailKey: string): string | null {
    return this.map.get(detailKey) ?? parentKeyOf(detailKey)
  }
}

export type MorphPlan = {
  /** The detail page's key: both the source and the target element carry it. */
  key: string
  /** 'open': a card grows into its page; 'return': the page flies back into its card. */
  kind: 'open' | 'return'
  source: MorphElement
}

/**
 * Decides, before the old snapshot, whether a navigation from `fromKey` to
 * `toKey` morphs: a card for the destination is on screen ('open'), or the
 * page being left is a detail page going back to where it came from
 * ('return'). Null for every other navigation.
 */
export function planMorph(
  root: MorphRoot | null | undefined,
  fromKey: string | null,
  toKey: string,
  viewport: Viewport,
  origins: MorphOrigins,
  activated: unknown = null,
): MorphPlan | null {
  if (fromKey === toKey) return null
  const card = findMorphElement(root, toKey, viewport, activated)
  if (card) return { key: toKey, kind: 'open', source: card }
  if (fromKey && origins.returnTarget(fromKey) === toKey) {
    const page = findMorphElement(root, fromKey, viewport)
    if (page) return { key: fromKey, kind: 'return', source: page }
  }
  return null
}

/** Resolves once an <img> has decoded (at once for anything else), or after `ms`. Never rejects. */
export function imageReady(el: unknown, ms: number): Promise<void> {
  const img = el as { complete?: boolean; decode?: () => Promise<unknown> }
  if (!img || img.complete !== false || typeof img.decode !== 'function') return Promise.resolve()
  let decoding: Promise<unknown>
  try {
    decoding = img.decode()
  } catch {
    return Promise.resolve()
  }
  return settleWithin(decoding, ms)
}

/** The first <img> inside a part (or the part itself when it has none). */
export function firstImageIn(el: MorphElement): unknown {
  try {
    return (el.querySelectorAll('img') as ArrayLike<unknown>)[0] ?? el
  } catch {
    return el
  }
}

/** How long the update callback waits for an incoming cover to decode (the screen is frozen meanwhile). */
const COVER_DECODE_MS = 120

/**
 * In the update callback, once the incoming page is committed: names the
 * target's parts that match the parts named on the old side, so they pair up.
 * A part the target does not show on screen stays unpaired and simply fades
 * with the page (globals.css, :only-child).
 */
export async function nameMorphTarget(root: MorphRoot | null | undefined, key: string, oldParts: readonly MorphPart[], viewport: Viewport): Promise<NamedParts | null> {
  const target = findMorphElement(root, key, viewport)
  if (!target || !oldParts.length) return null
  const parts = morphPartsOf(target, viewport)
  const named = nameMorphParts(parts, oldParts)
  // The cover part is the image's frame, the logo the image itself; wait for the image.
  const image = IMAGE_PARTS.map((kind) => (named.parts.includes(kind) ? parts.get(kind) : undefined)).find(Boolean)
  if (image) await imageReady(firstImageIn(image), COVER_DECODE_MS)
  return named
}

export type ActiveMorph = {
  /** The old snapshot is taken: the outgoing parts give their names up. */
  snapshotTaken(): void
  /** In the update callback, once the incoming page is committed: name its matching parts. */
  nameTarget(): Promise<void>
  /** The transition settled (or never started): every name goes. Idempotent. */
  done(): void
}

/**
 * Called right before a route transition starts (RouteTransitions): plans
 * the morph for a navigation from the page on screen (`fromPath`, null when
 * unknown) to `toPath`, names the source parts, and remembers where an
 * opened page flies back to. Null when this navigation does not morph; the
 * transition then gets no 'morph' type.
 */
export function startMorph(
  root: MorphRoot | null | undefined,
  fromPath: string | null,
  toPath: string,
  viewport: Viewport,
  origins: MorphOrigins,
  activated: unknown = null,
): ActiveMorph | null {
  const fromKey = fromPath === null ? null : morphKeyOf(fromPath)
  const plan = planMorph(root, fromKey, morphKeyOf(toPath), viewport, origins, activated)
  if (!plan) return null
  const source = nameMorphParts(morphPartsOf(plan.source, viewport))
  if (!source.parts.length) return null
  if (plan.kind === 'open' && fromKey) origins.record(plan.key, fromKey)
  let target: NamedParts | null = null
  return {
    snapshotTaken: () => source.clear(),
    async nameTarget() {
      target = await nameMorphTarget(root, plan.key, source.parts, viewport)
    },
    done() {
      source.clear()
      target?.clear()
    },
  }
}
