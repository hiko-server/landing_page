import type { ElementContent } from 'hast'
import type { Options as RemarkRehypeOptions } from 'remark-rehype'
import { fillUi, uiText } from '../uiStrings'
import { COMPILE_UI } from '../uiStrings/compile'

/**
 * GFM footnotes in the article's language (remark-rehype options).
 *
 * remark-rehype renders the endnotes as `<section data-footnotes>` with a
 * visually hidden `<h2 id="footnote-label">` (the accessible description of
 * every reference) and a back link per reference. Its defaults are English
 * ("Footnotes", "Back to reference 1"), so a Chinese article announced its
 * notes in English; the words come from lib/uiStrings/compile. The
 * back link's arrow carries U+FE0E (text presentation): iOS otherwise draws
 * ↩ as a colour emoji.
 *
 * The label heading is never part of the outline (lib/rehype/headings.ts).
 */
export type FootnoteOptions = Pick<RemarkRehypeOptions, 'footnoteLabel' | 'footnoteBackLabel' | 'footnoteBackContent'>

/** "1", or "1-2" for the second back link of a note referenced twice (remark-rehype's numbering). */
const refNumber = (referenceIndex: number, rereferenceIndex: number) =>
  `${referenceIndex + 1}${rereferenceIndex > 1 ? `-${rereferenceIndex}` : ''}`

/** The footnote label for an article language (BCP-47, e.g. "zh-Hans"). */
export function footnoteLabel(lang?: string): string {
  return uiText(COMPILE_UI, lang).footnotes
}

export function footnoteOptions(lang?: string): FootnoteOptions {
  const copy = uiText(COMPILE_UI, lang)
  return {
    footnoteLabel: copy.footnotes,
    footnoteBackLabel: (referenceIndex: number, rereferenceIndex: number) => fillUi(copy.backToReference, { ref: refNumber(referenceIndex, rereferenceIndex) }),
    footnoteBackContent: (_referenceIndex: number, rereferenceIndex: number): ElementContent[] => {
      const content: ElementContent[] = [{ type: 'text', value: '↩︎' }]
      if (rereferenceIndex > 1) {
        content.push({ type: 'element', tagName: 'sup', properties: {}, children: [{ type: 'text', value: String(rereferenceIndex) }] })
      }
      return content
    },
  }
}
