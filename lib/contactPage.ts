/**
 * Data of the statically generated /contact page (G1). SERVER-ONLY (content
 * store); pages/contact getStaticProps returns loadContactPage() as is.
 *
 * Nothing here depends on the request: the public home view (contact copy,
 * reasons and their kinds, e-mail / phone, socials, availability), a QR code
 * of the vCard URL and the contact-message retention period. Every home
 * write regenerates /contact on demand (pages/api/home HOME_STATIC_PATHS,
 * versions, storage pull, Mongo restore); CONTACT_REVALIDATE_SECONDS bounds
 * staleness if one of those ever fails. `next build` runs without the
 * content store (the Docker image is built without data/), so that copy
 * asks to be regenerated after 1 s — scripts/warm-isr.mjs does it at boot.
 */

import type { HomeData } from './homeShape'
import { absUrl } from './schema'
import { contactRetentionDays } from './retention'

export type ContactHome = {
  hero: { email?: string; phone?: string; brand?: string }
  socials: { github?: string; gitlab?: string; linkedin?: string; whatsapp?: string }
  contact: { heading?: string; blurb?: string; eyebrow?: string; reasons?: string[]; intents?: Record<string, string> }
}

export type ContactPageProps = {
  home: ContactHome | null
  availability: NonNullable<HomeData['availability']> | null
  /** QR code (inline SVG) of the vCard URL; null when it could not be generated. */
  vcardQr: string | null
  /** CONTACT_RETENTION_DAYS as the privacy notice states it (0 = no automatic expiry). */
  retentionDays: number
  chromeSocials?: HomeData['socials'] | null
}

export const CONTACT_REVALIDATE_SECONDS = 300
export const VCARD_PATH = '/api/vcard'

/** Strip undefined values (static props must be JSON-serialisable). */
function defined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

export async function loadContactPage(): Promise<{ props: ContactPageProps; revalidate: number }> {
  let home: ContactHome | null = null
  let availability: ContactPageProps['availability'] = null
  let chromeSocials: HomeData['socials'] | null | undefined
  try {
    const { readPublicHome } = await import('./home')
    const h = readPublicHome()
    chromeSocials = h?.socials ?? null
    // Only what the contact page renders — not the whole home document.
    if (h) {
      home = {
        hero: defined({ email: h.hero?.email, phone: h.hero?.phone, brand: h.hero?.brand }),
        socials: defined({ ...h.socials }),
        contact: defined({ ...h.contact }),
      }
      availability = h.availability?.status ? defined({ ...h.availability }) : null
    }
  } catch {
    /* render with built-in defaults; the chrome loads the public home view itself */
  }
  let vcardQr: string | null = null
  try {
    const { qrSvg } = await import('./qr')
    vcardQr = await qrSvg(absUrl(VCARD_PATH))
  } catch {
    /* the panel keeps the .vcf link without the QR code */
  }
  const building = process.env.NEXT_PHASE === 'phase-production-build'
  return {
    props: {
      home,
      availability,
      vcardQr,
      retentionDays: contactRetentionDays(),
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
    },
    revalidate: building ? 1 : CONTACT_REVALIDATE_SECONDS,
  }
}
