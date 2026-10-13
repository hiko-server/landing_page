import type { ElementContent } from 'hast'
import type { Options as RemarkRehypeOptions } from 'remark-rehype'

/**
 * GFM footnotes in the article's language (remark-rehype options).
 *
 * remark-rehype renders the endnotes as `<section data-footnotes>` with a
 * visually hidden `<h2 id="footnote-label">` (the accessible description of
 * every reference) and a back link per reference. Its defaults are English
 * ("Footnotes", "Back to reference 1"), so a Chinese article announced its
 * notes in English. The back link's arrow carries U+FE0E (text presentation):
 * iOS otherwise draws ↩ as a colour emoji.
 *
 * The label heading is never part of the outline (lib/rehype/headings.ts).
 */
export type FootnoteOptions = Pick<RemarkRehypeOptions, 'footnoteLabel' | 'footnoteBackLabel' | 'footnoteBackContent'>

type Copy = { label: string; back: (n: string) => string }

const EN: Copy = { label: 'Footnotes', back: (n) => `Back to reference ${n}` }
const ZH_HANS: Copy = { label: '注释', back: (n) => `返回正文（引用 ${n}）` }
const ZH_HANT: Copy = { label: '註釋', back: (n) => `返回正文（引用 ${n}）` }

function copyFor(lang: string | undefined): Copy {
  const tag = String(lang || '').toLowerCase()
  if (!/^zh(-|$)/.test(tag)) return EN
  return /^zh-(hant|tw|hk|mo)(-|$)/.test(tag) ? ZH_HANT : ZH_HANS
}

/** "1", or "1-2" for the second back link of a note referenced twice (remark-rehype's numbering). */
const refNumber = (referenceIndex: number, rereferenceIndex: number) =>
  `${referenceIndex + 1}${rereferenceIndex > 1 ? `-${rereferenceIndex}` : ''}`

/** The footnote label for an article language (BCP-47, e.g. "zh-Hans"). */
export function footnoteLabel(lang?: string): string {
  return copyFor(lang).label
}

export function footnoteOptions(lang?: string): FootnoteOptions {
  const copy = copyFor(lang)
  return {
    footnoteLabel: copy.label,
    footnoteBackLabel: (referenceIndex: number, rereferenceIndex: number) => copy.back(refNumber(referenceIndex, rereferenceIndex)),
    footnoteBackContent: (_referenceIndex: number, rereferenceIndex: number): ElementContent[] => {
      const content: ElementContent[] = [{ type: 'text', value: '↩︎' }]
      if (rereferenceIndex > 1) {
        content.push({ type: 'element', tagName: 'sup', properties: {}, children: [{ type: 'text', value: String(rereferenceIndex) }] })
      }
      return content
    },
  }
}
