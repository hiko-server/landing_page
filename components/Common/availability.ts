/**
 * The owner's availability (home.availability) as the site shows it — pure,
 * shared by AvailabilityCard (/contact, /zh/contact, the home page's contact
 * band), /about's identity rail, the author card and the "Ask" index.
 *
 * Its English words are its own small table (lib/uiStrings/availability),
 * so the home page bundles the card without the contact form's words
 * (lib/uiStrings/contact-en); a Chinese page passes its words (`t`, F3).
 */

import { AVAILABILITY_EN, type AvailabilityStrings } from '../../lib/uiStrings/availability'

/** The words the card and its label default come from (a page's `{ availability }` table). */
export type AvailabilityWords = { availability: AvailabilityStrings }

export const AVAILABILITY_WORDS_EN: AvailabilityWords = { availability: AVAILABILITY_EN }

export type AvailabilityStatus = 'open' | 'limited' | 'closed'

/** What AvailabilityCard renders; null renders nothing. */
export type AvailabilityView = {
  status: AvailabilityStatus
  label: string
  roles: string[]
  /** 'YYYY-MM' the availability starts, or '' when not set. */
  from: string
  /** An https booking link, or '' (other schemes are never linked). */
  bookingUrl: string
  /** The owner's right-to-work line, or ''. */
  workStatus: string
  /**
   * On a Chinese page, the language of an owner's line shown in English
   * because it has no Chinese copy ('en'); undefined when it is in the
   * page's language.
   */
  labelLang?: string
  rolesLang?: string
  workStatusLang?: string
}

const isStatus = (v: unknown): v is AvailabilityStatus => v === 'open' || v === 'limited' || v === 'closed'
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function httpsUrl(v: unknown): string {
  const raw = text(v)
  if (!raw) return ''
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' ? u.toString() : ''
  } catch {
    return ''
  }
}

type AvailabilityInput = {
  status?: unknown
  label?: unknown
  roles?: unknown
  from?: unknown
  bookingUrl?: unknown
  workStatus?: unknown
  label_zh?: unknown
  roles_zh?: unknown
  workStatus_zh?: unknown
}

const listOf = (v: unknown): string[] => (Array.isArray(v) ? Array.from(new Set(v.map(text).filter(Boolean))) : [])

/**
 * The owner's availability as shown on /contact and the home page. Only an
 * explicit status (open / limited / closed) produces a card; the label
 * defaults to a plain description of that status (`t`, the page's words).
 * On a Chinese page (`zh`, F3) the owner's Chinese lines are used — the
 * label, roles and right-to-work line — and a line without one is shown as
 * written, marked English (never translated).
 */
export function availabilityView(a: AvailabilityInput | null | undefined, opts: { zh?: boolean; t?: AvailabilityWords } = {}): AvailabilityView | null {
  if (!a || !isStatus(a.status)) return null
  const t = opts.t ?? AVAILABILITY_WORDS_EN
  const from = /^(\d{4}-(0[1-9]|1[0-2]))(-\d{2})?$/.exec(text(a.from))
  const line = (v: unknown) => text(v).replace(/[\r\n]+/g, ' ')
  const base = { status: a.status, from: from ? from[1] : '', bookingUrl: httpsUrl(a.bookingUrl) }
  if (!opts.zh) {
    return { ...base, label: text(a.label) || t.availability[a.status], roles: listOf(a.roles), workStatus: line(a.workStatus) }
  }
  const rolesZh = listOf(a.roles_zh)
  const roles = rolesZh.length ? rolesZh : listOf(a.roles)
  const workZh = line(a.workStatus_zh)
  const workStatus = workZh || line(a.workStatus)
  return {
    ...base,
    // A Chinese label, else the plain Chinese description of the status (never the English label).
    label: text(a.label_zh) || t.availability[a.status],
    roles,
    workStatus,
    ...(roles.length && !rolesZh.length ? { rolesLang: 'en' } : {}),
    ...(workStatus && !workZh ? { workStatusLang: 'en' } : {}),
  }
}
