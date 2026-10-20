/**
 * "Ask Lucian directly": when "Ask" finds nothing on the site, the visitor's
 * question moves into the contact form's message, so they can send it as is
 * (or edit it) instead of typing it again.
 *
 * Nothing goes into the URL (no query string to end up in logs): the
 * question is merged into the form's own draft in this browser
 * (localStorage, the key components/Contact/ContactPro autosaves to) before
 * /contact opens, and the form restores the draft as it mounts. When the
 * form is already on the page, CONTACT_PREFILL_EVENT fills it directly. An
 * existing draft message is never overwritten. Plain text only, length-capped.
 */

/** The contact form's draft (components/Contact/ContactPro). */
export const CONTACT_DRAFT_KEY = 'contact_draft'

/** Window event the mounted contact form listens to: detail { message }. */
export const CONTACT_PREFILL_EVENT = 'site:contact-prefill'

/** The form's anchor (scroll target). */
export const CONTACT_FORM_ID = 'contact-form'

/** Longest prefilled message (a question, not an essay). */
export const PREFILL_MAX = 280

/** The question as a message: plain text, one line, at most PREFILL_MAX characters. */
export function prefillMessage(question: unknown): string {
  if (typeof question !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  const text = question.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  return Array.from(text).slice(0, PREFILL_MAX).join('').trim()
}

/** The draft with the question as its message (an existing message is kept). */
export function draftWithQuestion(raw: string | null, question: string): Record<string, unknown> | null {
  const message = prefillMessage(question)
  if (!message) return null
  let draft: Record<string, unknown> = {}
  try {
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) draft = parsed as Record<string, unknown>
  } catch {
    /* a malformed draft is replaced */
  }
  if (typeof draft.message === 'string' && draft.message.trim()) return draft
  return { ...draft, message }
}

/**
 * Hand the question to the contact form: store it in the draft and tell a
 * mounted form. Returns false when there was nothing to hand over.
 */
export function stashContactQuestion(question: string): boolean {
  if (typeof window === 'undefined') return false
  const message = prefillMessage(question)
  if (!message) return false
  try {
    const next = draftWithQuestion(window.localStorage.getItem(CONTACT_DRAFT_KEY), message)
    if (next) window.localStorage.setItem(CONTACT_DRAFT_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable: the event below still fills a mounted form */
  }
  window.dispatchEvent(new CustomEvent<{ message: string }>(CONTACT_PREFILL_EVENT, { detail: { message } }))
  return true
}
