/**
 * The Ask view's model (pure): which keyboard options the answer offers, in
 * order, and what the palette's live region says. components/Search/AskView
 * renders exactly these options, so ↑ / ↓ / ↵ in the palette and the screen
 * reader's active option always agree with what is on screen.
 *
 *   loading            nothing to choose yet
 *   no question        the suggested questions (only ones this site answers)
 *   vague              the suggested questions
 *   answered/partial   every quote, in reading order, then "Ask Lucian directly"
 *   none               "Ask Lucian directly", then "Search the site instead"
 */

import type { AnswerGroup, AskResult, Quote, Suggestion } from './engine'
import type { AskCopy } from './copy'

export type AskOption =
  | { kind: 'suggestion'; id: string; question: string; lang: 'en' | 'zh' }
  | { kind: 'quote'; id: string; quote: Quote; group: AnswerGroup; groupIndex: number }
  | { kind: 'contact'; id: string }
  | { kind: 'search'; id: string }

export type AskViewState = {
  /** The index has loaded (passages are known). */
  ready: boolean
  /** The index could not be loaded. */
  failed?: boolean
  /** The question the result answers (debounced). */
  question: string
  result: AskResult
  suggestions: readonly Suggestion[]
}

/** The options of the current state, in display order. */
export function askOptions(state: AskViewState): AskOption[] {
  if (!state.ready) return []
  const { status } = state.result
  if (!state.question.trim() || status === 'empty' || status === 'vague') {
    return state.suggestions.map((s, i) => ({ kind: 'suggestion', id: `suggest:${i}`, question: s.question, lang: s.lang }))
  }
  if (status === 'none') return [{ kind: 'contact', id: 'contact' }, { kind: 'search', id: 'search' }]
  const out: AskOption[] = []
  state.result.groups.forEach((group, groupIndex) => {
    for (const quote of group.quotes) out.push({ kind: 'quote', id: `quote:${quote.passage.id}`, quote, group, groupIndex })
  })
  out.push({ kind: 'contact', id: 'contact' })
  return out
}

/** What the palette's live region announces for the current state. */
export function askStatusText(state: AskViewState, copy: AskCopy): string {
  if (state.failed) return copy.status.unavailable
  if (!state.ready) return copy.status.loading
  const { status, count, groups } = state.result
  if (!state.question.trim() || status === 'empty') return copy.status.suggestions(state.suggestions.length)
  if (status === 'vague') return copy.status.vague
  if (status === 'none') return copy.status.none
  if (status === 'partial') return copy.status.partial(count)
  return copy.status.answered(count, groups.length)
}

/**
 * A key that changes only when the answer does: the reveal animation runs
 * once per new answer, not on every keystroke that leaves it unchanged.
 */
export function answerSignature(result: AskResult): string {
  return `${result.status}:${result.groups.map((g) => `${g.source}[${g.quotes.map((q) => q.passage.id).join(',')}]`).join(';')}`
}
