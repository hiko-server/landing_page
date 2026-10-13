import { element, isElement, type HastElement, type HastNode } from './hast'

/**
 * rehype plugin: GitHub-style alerts become callouts.
 *
 *   > [!NOTE]
 *   > Useful information the reader should know, even when skimming.
 *
 * A blockquote whose first paragraph starts with `[!NOTE]`, `[!TIP]`,
 * `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` (any case) becomes
 *
 *   <div class="callout callout-note" role="note" data-callout="note"
 *        data-callout-label="Note"> …the quote's content… </div>
 *
 * rendered by components/MDX/Callout.tsx with an icon and the label in the
 * article's language (备注 / 提示 / 重要 / 警告 / 注意 in Chinese articles).
 * The marker is removed; text after it on the same line stays as body text.
 * The visual editor writes the marker escaped (`\[!NOTE\]`) and may join
 * the lines — both parse to the same text, so a callout survives the
 * round trip. Any other blockquote stays a quote. The feeds render a
 * callout as a quote that starts with its label (lib/feedHtml.ts).
 */

export const CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const
export type CalloutType = (typeof CALLOUT_TYPES)[number]

const LABELS: Record<'en' | 'zh-hans' | 'zh-hant', Record<CalloutType, string>> = {
  en: { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' },
  'zh-hans': { note: '备注', tip: '提示', important: '重要', warning: '警告', caution: '注意' },
  'zh-hant': { note: '備註', tip: '提示', important: '重要', warning: '警告', caution: '注意' },
}

/** The label of a callout type in an article language (BCP-47). */
export function calloutLabel(type: CalloutType, lang?: string): string {
  const tag = String(lang || '').toLowerCase()
  if (!/^zh(-|$)/.test(tag)) return LABELS.en[type]
  return /^zh-(hant|tw|hk|mo)(-|$)/.test(tag) ? LABELS['zh-hant'][type] : LABELS['zh-hans'][type]
}

const MARKER_RE = /^\s*\[!(note|tip|important|warning|caution)\]/i

const isBlank = (node: HastNode) => node.type === 'text' && !(node.value ?? '').trim()

/** Remove leading whitespace text and line breaks from a paragraph's children. */
function trimStart(children: HastNode[]): HastNode[] {
  const out = [...children]
  while (out.length) {
    const first = out[0]
    if (isElement(first, 'br') || isBlank(first)) {
      out.shift()
      continue
    }
    if (first.type === 'text') out[0] = { ...first, value: (first.value ?? '').replace(/^\s+/, '') }
    break
  }
  return out
}

/** The callout a blockquote turns into, or null when it is an ordinary quote. */
export function calloutFor(quote: HastElement, lang?: string): HastElement | null {
  const firstIndex = quote.children.findIndex((c) => !isBlank(c))
  const first = quote.children[firstIndex]
  if (!isElement(first, 'p')) return null
  const lead = first.children[0]
  if (!lead || lead.type !== 'text') return null
  const m = MARKER_RE.exec(lead.value ?? '')
  if (!m) return null
  const type = m[1].toLowerCase() as CalloutType
  const rest = trimStart([{ ...lead, value: (lead.value ?? '').slice(m[0].length) }, ...first.children.slice(1)])
  const body = [...quote.children.slice(0, firstIndex), ...(rest.length ? [element('p', first.properties, rest)] : []), ...quote.children.slice(firstIndex + 1)]
  return element(
    'div',
    { className: ['callout', `callout-${type}`], role: 'note', dataCallout: type, dataCalloutLabel: calloutLabel(type, lang) },
    body,
  )
}

function transform(parent: HastNode, lang?: string): void {
  const kids = parent.children
  if (!kids) return
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i]
    if (isElement(child, 'blockquote')) {
      const callout = calloutFor(child, lang)
      if (callout) kids[i] = callout
    }
    transform(kids[i], lang)
  }
}

export default function rehypeAlerts(options: { lang?: string } = {}) {
  return (tree: HastNode) => {
    transform(tree, options.lang)
  }
}
