/**
 * Data of the statically generated /contact page (G1) and of its Chinese
 * page /zh/contact (F3). SERVER-ONLY (content store); pages/contact and
 * pages/zh/contact getStaticProps return loadContactPage(lang) as is.
 *
 * Nothing here depends on the request: the public home view (contact copy,
 * reasons and their kinds, e-mail / phone, socials, availability), a QR code
 * of the vCard URL and the contact-message retention period. Every home
 * write regenerates both pages on demand (pages/api/home HOME_STATIC_PATHS,
 * versions, storage pull, Mongo restore); CONTACT_REVALIDATE_SECONDS bounds
 * staleness if one of those ever fails. `next build` runs without the
 * content store (the Docker image is built without data/), so that copy
 * asks to be regenerated after 1 s — scripts/warm-isr.mjs does it at boot.
 *
 * /zh/contact exists only while the owner has written the Chinese contact
 * copy — a heading or a blurb (lib/zhSite hasZhContactCopy) — and shows only
 * the owner's Chinese words: the Chinese heading, blurb and eyebrow (a blank
 * one falls back to the page's built-in Chinese wording, never to the
 * English copy), each custom reason's Chinese name (its English one, marked
 * so, where none is written) with the kind of the English reason, and the
 * Chinese availability lines (AvailabilityCard). The interface is in
 * Chinese (lib/uiStrings/contact).
 */

import type { GetStaticPropsResult } from 'next'
import type { HomeData } from './homeShape'
import { absUrl } from './schema'
import { contactRetentionDays } from './retention'
import { revalidateAfter } from './isr'
import { DEFAULT_REASONS, DEFAULT_REASON_INTENTS, hasCustomReasons, intentOf, reasonsOf, type InquiryIntent } from './inquiry'
import { contactUiFor, type ContactUi } from './uiStrings/contact'
import { ownerNameZh, pairLanguageProps, type PageLanguageProps } from './pageLanguage'
import { hasZhContactCopy } from './zhSite'
import { ZH_LANG } from './zhRoutes'

export type ContactHome = {
  hero: { email?: string; phone?: string; brand?: string }
  socials: { github?: string; gitlab?: string; linkedin?: string; whatsapp?: string }
  contact: { heading?: string; blurb?: string; eyebrow?: string; reasons?: string[]; intents?: Record<string, string> }
}

/** A reason of the form in the page's language (components/Contact/ContactPro ReasonOption). */
export type ContactReason = { label: string; intent: InquiryIntent; lang?: string }

export type ContactPageProps = PageLanguageProps & {
  home: ContactHome | null
  availability: NonNullable<HomeData['availability']> | null
  /** QR code (inline SVG) of the vCard URL; null when it could not be generated. */
  vcardQr: string | null
  /** CONTACT_RETENTION_DAYS as the privacy notice states it (0 = no automatic expiry). */
  retentionDays: number
  chromeSocials?: HomeData['socials'] | null
  /** Whether /publications exists (lib/publicationsData), for the chrome's nav link. */
  chromePublications?: boolean
  /** The page's words on a page in another language than English (lib/uiStrings/contact); null on /contact. */
  ui: ContactUi | null
  /** The form's reasons on a Chinese page (null on /contact: the form reads home.contact). */
  reasonOptions: ContactReason[] | null
  /** The owner's Chinese name (title suffix of a Chinese page); '' on /contact. */
  nameZh: string
}

export const CONTACT_REVALIDATE_SECONDS = 300
export const VCARD_PATH = '/api/vcard'

/** Strip undefined values (static props must be JSON-serialisable). */
function defined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/**
 * The form's reasons in Chinese: each custom reason's Chinese name
 * (`reasons_zh`, keyed by the English reason) with that reason's kind — a
 * built-in reason kept in the list has its built-in Chinese name — or the
 * English name, marked, when none is written; without a custom list, the
 * built-in reasons' Chinese names (lib/uiStrings/contact).
 */
export function zhReasonOptions(contact: HomeData['contact'] | null | undefined, names: Readonly<Record<string, string>>): ContactReason[] {
  if (!hasCustomReasons(contact)) {
    return DEFAULT_REASONS.map((r) => ({ label: names[r] || r, intent: DEFAULT_REASON_INTENTS[r] ?? 'other', ...(names[r] ? {} : { lang: 'en' }) }))
  }
  const own = Array.isArray(contact?.reasons) ? contact.reasons.map(text) : []
  const map = contact?.reasons_zh
  const zh: Readonly<Record<string, unknown>> = map && typeof map === 'object' && !Array.isArray(map) ? map : {}
  const seen = new Set<string>()
  const out: ContactReason[] = []
  for (const reason of own) {
    if (!reason) continue
    // The owner's Chinese name, else the built-in one when the reason is a built-in reason.
    const name = (Object.hasOwn(zh, reason) ? text(zh[reason]) : '') || (Object.hasOwn(names, reason) ? names[reason] : '')
    const label = name || reason
    if (seen.has(label)) continue
    seen.add(label)
    out.push({ label, intent: intentOf(reason, contact), ...(name ? {} : { lang: 'en' }) })
  }
  // reasonsOf de-duplicates the English list the same way; an empty list cannot happen here.
  return out.length ? out : reasonsOf(contact).map((r) => ({ label: r, intent: intentOf(r, contact), lang: 'en' }))
}

type Loaded = { props: ContactPageProps; revalidate: number }

/** /contact always renders; /zh/contact answers 404 without the owner's Chinese copy. */
export async function loadContactPage(lang?: 'en'): Promise<Loaded>
export async function loadContactPage(lang: typeof ZH_LANG): Promise<GetStaticPropsResult<ContactPageProps>>
export async function loadContactPage(lang: 'en' | typeof ZH_LANG = 'en'): Promise<GetStaticPropsResult<ContactPageProps>> {
  const zh = lang !== 'en'
  let home: ContactHome | null = null
  let availability: ContactPageProps['availability'] = null
  let chromeSocials: HomeData['socials'] | null | undefined
  let reasonOptions: ContactReason[] | null = null
  const ui = zh ? contactUiFor(lang) : null
  try {
    const { readPublicHome } = await import('./home')
    const h = readPublicHome()
    if (zh && !hasZhContactCopy(h)) return { notFound: true, revalidate: revalidateAfter(CONTACT_REVALIDATE_SECONDS) }
    chromeSocials = h?.socials ?? null
    // Only what the contact page renders — not the whole home document.
    if (h) {
      const c = h.contact || {}
      home = {
        hero: defined({ email: h.hero?.email, phone: h.hero?.phone, brand: h.hero?.brand }),
        socials: defined({ ...h.socials }),
        // The Chinese page shows only the owner's Chinese copy (the form gets its reasons separately).
        contact: zh ? defined({ heading: text(c.heading_zh) || undefined, blurb: text(c.blurb_zh) || undefined, eyebrow: text(c.eyebrow_zh) || undefined }) : stripZh(c),
      }
      availability = h.availability?.status ? defined({ ...h.availability }) : null
      if (zh && ui) reasonOptions = zhReasonOptions(c, ui.t.reasons)
    }
  } catch {
    // No store: /contact renders with built-in defaults; /zh/contact cannot know its copy.
    if (zh) return { notFound: true, revalidate: revalidateAfter(CONTACT_REVALIDATE_SECONDS) }
  }
  let vcardQr: string | null = null
  try {
    const { qrSvg } = await import('./qr')
    vcardQr = await qrSvg(absUrl(VCARD_PATH))
  } catch {
    /* the panel keeps the .vcf link without the QR code */
  }
  return {
    props: {
      home,
      availability,
      vcardQr,
      retentionDays: contactRetentionDays(),
      ui,
      reasonOptions,
      nameZh: zh ? await ownerNameZh() : '',
      ...pairLanguageProps('/contact', lang),
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
      // Whether /publications exists, for the nav link (lib/publicationsData).
      ...(await import('./publicationsData')).chromePublicationsProp(),
    },
    revalidate: revalidateAfter(CONTACT_REVALIDATE_SECONDS),
  }
}

/** The English page's contact block without the Chinese copy (it never ships what it does not show). */
function stripZh(c: NonNullable<HomeData['contact']>): ContactHome['contact'] {
  const out = { ...c } as Record<string, unknown>
  for (const key of ['heading_zh', 'blurb_zh', 'eyebrow_zh', 'reasons_zh']) delete out[key]
  return defined(out) as ContactHome['contact']
}
