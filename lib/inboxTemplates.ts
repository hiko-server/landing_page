import { getKv, putKv } from './contentStore'

/**
 * The owner's reply templates for the admin Inbox (SERVER-ONLY), one per
 * language. They are the owner's own words, so they live in the content
 * store (kv row `inbox-templates`): packed into every backup and mirrored to
 * R2 like the rest of the content, unlike the Inbox's per-server state file.
 *
 * Without a saved template the composer uses the built-in skeleton
 * (lib/inboxReply BUILTIN_TEMPLATES). Placeholders: {name} {firstName}
 * {subject} {me}.
 */

export const TEMPLATES_KEY = 'inbox-templates'
export const MAX_TEMPLATE_CHARS = 4000

export type ReplyTemplates = { en?: string; zh?: string }

/** Defensive read of a stored value (only non-blank strings, capped). */
export function cleanTemplates(raw: unknown): ReplyTemplates {
  const out: ReplyTemplates = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const o = raw as Record<string, unknown>
  for (const lang of ['en', 'zh'] as const) {
    const v = o[lang]
    if (typeof v === 'string' && v.trim()) out[lang] = v.replace(/\r\n?/g, '\n').slice(0, MAX_TEMPLATE_CHARS)
  }
  return out
}

/** The saved templates (empty when none, or when the store cannot be read). */
export function readReplyTemplates(): ReplyTemplates {
  try {
    return cleanTemplates(getKv(TEMPLATES_KEY))
  } catch {
    return {}
  }
}

export type TemplateWrite = { ok: true; templates: ReplyTemplates; r2Warning?: string } | { ok: false; error: string }

/**
 * Save (or, with blank text, remove) the template of one language; the other
 * language is kept.
 */
export async function writeReplyTemplate(lang: 'en' | 'zh', text: string): Promise<TemplateWrite> {
  const next: ReplyTemplates = { ...readReplyTemplates() }
  const value = String(text || '')
    .replace(/\r\n?/g, '\n')
    .slice(0, MAX_TEMPLATE_CHARS)
  if (value.trim()) next[lang] = value
  else delete next[lang]
  const result = await putKv(TEMPLATES_KEY, next)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, templates: next, ...(result.r2Warning ? { r2Warning: result.r2Warning } : {}) }
}
