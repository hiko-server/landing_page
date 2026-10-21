/**
 * vCard 4.0 (RFC 6350) for "Save contact" on /contact (GET /api/vcard).
 *
 * Built only from PUBLIC data: the pruned CV personalInformation section
 * (a hidden field arrives blank and is simply left out — a hidden phone
 * number never reaches the card) and, for TITLE / ORG, a work-experience
 * entry that has no end date. Pure and dependency-light so it is unit-tested.
 *
 *   - Profiles (GitHub / LinkedIn, lib/cvLinks profileLinks — the CV's own
 *     value, else Home → Socials, never for a hidden field) become RFC 9554
 *     SOCIALPROFILE lines, plus Apple's X-SOCIALPROFILE twin, which Apple
 *     Contacts reads. The ORCID iD (profile kind 'orcid') is a
 *     `URL;TYPE=orcid:https://orcid.org/…` line plus `X-ORCID:<iD>`, the
 *     forms research tools look for.
 *   - TEXT values are escaped per RFC 6350 §3.4 (\\ \n \, \;); URIs are not.
 *   - Lines are folded at 75 octets (UTF-8) with CRLF + one space, never
 *     splitting a multi-byte character.
 *   - Lines end with CRLF, as the RFC requires.
 */

import { isRedacted } from './cvVisibilityRead'
import { isFuture, isPresent, type CvNow } from './cvFormat'
import { field, list } from '../components/CVViewerPage/fields'
import { PERSON_NAME, SITE_URL } from './schema'
import { normalizeOrcidId, orcidUrl } from './orcid/id'

export type VcardRole = { title?: string; org?: string }
export type VcardExtras = {
  /** Absolute URL of the profile photo (home avatar); omitted when blank. */
  photoUrl?: string
  /** The site URL for the URL property (defaults to the canonical origin). */
  siteUrl?: string
  /** Public social profiles (label "GitHub" / "LinkedIn", absolute https URL); kind 'orcid' is the ORCID iD link. */
  profiles?: ReadonlyArray<{ label: string; href: string; kind?: string }>
}

/** Parameter-safe service name: letters, digits and "-" only. */
function serviceType(label: string): string {
  return label.replace(/[^A-Za-z0-9-]/g, '')
}

const CRLF = '\r\n'
const FOLD_OCTETS = 75

/** Escape a TEXT value (RFC 6350 §3.4). */
export function escapeVcardText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

const encoder = new TextEncoder()
const octets = (s: string) => encoder.encode(s).length

/** Fold one content line at 75 octets; continuation lines start with a single space. */
export function foldVcardLine(line: string): string {
  if (octets(line) <= FOLD_OCTETS) return line
  const parts: string[] = []
  let current = ''
  let size = 0
  // The first line holds 75 octets; continuation lines 74 plus the leading space.
  let limit = FOLD_OCTETS
  for (const ch of line) {
    const n = octets(ch)
    if (size + n > limit) {
      parts.push(current)
      current = ''
      size = 0
      limit = FOLD_OCTETS - 1
    }
    current += ch
    size += n
  }
  parts.push(current)
  return parts.join(`${CRLF} `)
}

const MEDIA_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
}

function photoMediaType(url: string): string | undefined {
  const ext = url.split(/[?#]/)[0].split('.').pop()?.toLowerCase() || ''
  return MEDIA_TYPES[ext]
}

/**
 * The role for TITLE / ORG: the first visible work-experience entry whose end
 * date is absent or "Present" and which has already started. A hidden end
 * date is not "no end date" — such an entry is never treated as current.
 */
export function currentRoleFrom(
  workExperience: unknown,
  now: CvNow = new Date()
): VcardRole | null {
  for (const e of list(workExperience, 'experiences')) {
    if (isRedacted(e, 'endDate')) continue
    const end = field(e, 'endDate')
    if (end && !isPresent(end)) continue
    const start = field(e, 'startDate')
    if (start && isFuture(start, now)) continue
    const title = field(e, 'jobTitle')
    const org = field(e, 'companyName')
    if (title || org) return { title, org }
  }
  return null
}

const NAME_FIELDS = ['firstName', 'lastName', 'nickName'] as const

/** True when the owner hid at least one name field in CV Studio. */
export function nameIsRedacted(personal: unknown): boolean {
  return NAME_FIELDS.some((f) => isRedacted(personal, f))
}

/** Bare host of a site URL ("lucian-dev.com"); FN must never be empty. */
function siteHostOf(siteUrl: string): string {
  try {
    return new URL(siteUrl).host || siteUrl
  } catch {
    return siteUrl
  }
}

/**
 * Display name from the public name fields: "Li Yanpei (Lucian)".
 *
 * With no visible name, the built-in PERSON_NAME is used only when the CV
 * simply has none. If the owner HID the name fields, the card falls back to
 * the neutral site host instead of re-publishing the hidden name.
 */
export function vcardDisplayName(personal: unknown, siteUrl: string = SITE_URL): string {
  const first = field(personal, 'firstName')
  const last = field(personal, 'lastName')
  const nick = field(personal, 'nickName')
  const base = [last, first].filter(Boolean).join(' ')
  if (!base) return nick || (nameIsRedacted(personal) ? siteHostOf(siteUrl) : PERSON_NAME)
  return nick ? `${base} (${nick})` : base
}

/**
 * Download name for the card: "Li-Yanpei.vcf" from the visible ASCII name
 * parts, else the neutral "contact.vcf" (hidden or non-Latin names).
 */
export function vcardFileName(personal: unknown): string {
  if (!personal) return 'Li-Yanpei.vcf'
  const parts = [field(personal, 'lastName'), field(personal, 'firstName')]
    .map((p) => p.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
  return parts.length ? `${parts.join('-')}.vcf` : 'contact.vcf'
}

/** The vCard text (CRLF line endings, folded). */
export function buildVcard(
  personal: unknown,
  currentRole?: VcardRole | null,
  extras: VcardExtras = {}
): string {
  const first = field(personal, 'firstName')
  const last = field(personal, 'lastName')
  const nick = field(personal, 'nickName')
  const email = field(personal, 'email')
  const phone = field(personal, 'phoneNumber')
  const address = field(personal, 'address')
  const photo = (extras.photoUrl || '').trim()
  const title = (currentRole?.title || '').trim()
  const org = (currentRole?.org || '').trim()

  const lines = [
    'BEGIN:VCARD',
    'VERSION:4.0',
    'KIND:individual',
    `FN:${escapeVcardText(vcardDisplayName(personal, extras.siteUrl || SITE_URL))}`,
  ]
  if (first || last) lines.push(`N:${escapeVcardText(last)};${escapeVcardText(first)};;;`)
  if (nick) lines.push(`NICKNAME:${escapeVcardText(nick)}`)
  if (email) lines.push(`EMAIL;TYPE=work:${escapeVcardText(email)}`)
  if (phone) lines.push(`TEL;TYPE=cell:${escapeVcardText(phone)}`)
  lines.push(`URL:${extras.siteUrl || SITE_URL}`)
  for (const p of extras.profiles || []) {
    const href = typeof p?.href === 'string' ? p.href.trim() : ''
    if (p?.kind === 'orcid') {
      // The researcher identifier: its URI as a typed URL, and the bare iD as X-ORCID.
      const id = normalizeOrcidId(href)
      if (!id) continue
      lines.push(`URL;TYPE=orcid:${orcidUrl(id)}`)
      lines.push(`X-ORCID:${id}`)
      continue
    }
    const service = serviceType(typeof p?.label === 'string' ? p.label : '')
    if (!/^https:\/\/[^\s"<>]+$/i.test(href) || !service) continue
    lines.push(`SOCIALPROFILE;SERVICE-TYPE=${service}:${href}`)
    lines.push(`X-SOCIALPROFILE;TYPE=${service.toLowerCase()}:${href}`)
  }
  if (title) lines.push(`TITLE:${escapeVcardText(title)}`)
  if (org) lines.push(`ORG:${escapeVcardText(org)}`)
  // Free-text location in the street component: clients show it as written.
  if (address) lines.push(`ADR:;;${escapeVcardText(address)};;;;`)
  if (/^https:\/\//i.test(photo)) {
    const type = photoMediaType(photo)
    lines.push(`PHOTO${type ? `;MEDIATYPE=${type}` : ''}:${photo}`)
  }
  lines.push('END:VCARD')
  return lines.map(foldVcardLine).join(CRLF) + CRLF
}
