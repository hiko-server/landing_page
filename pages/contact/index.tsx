import React from 'react'
import type { GetServerSideProps } from 'next'
import { Box } from '@chakra-ui/react'

import ContactPro from '../../components/Contact/ContactPro'
import AvailabilityCard from '../../components/Contact/AvailabilityCard'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import PageHeader from '../../components/General-UI/PageHeader'
import { absUrl, breadcrumb, PERSON_ID } from '../../lib/schema'
import { ogPresetUrl } from '../../lib/og/presets'
import type { HomeData } from '../../lib/homeShape'

type ContactHome = {
  hero: { email?: string; phone?: string; brand?: string }
  socials: { github?: string; gitlab?: string; linkedin?: string; whatsapp?: string }
  contact: { heading?: string; blurb?: string; eyebrow?: string; reasons?: string[] }
}

type Props = {
  home: ContactHome | null
  availability: NonNullable<HomeData['availability']> | null
  /** QR code (inline SVG) of the vCard URL; null when it could not be generated. */
  vcardQr: string | null
  chromeSocials?: HomeData['socials'] | null
}

const FALLBACK_LEDE = 'Questions, roles or collaborations: send a note.'
const VCARD_PATH = '/api/vcard'

/**
 * /contact — page header, the owner's availability (when set in the Home
 * editor), the reach-me panel (copyable e-mail / phone, vCard download and
 * QR) and the message form. Server-rendered on every request so edits to the
 * home document show immediately; the form's human-check nonce is fetched
 * client side.
 */
const Contact = ({ home, availability, vcardQr }: Props) => {
  const lede = (home?.contact?.blurb ?? '').trim() || FALLBACK_LEDE

  return (
    <React.Fragment>
      <CustomHead
        title="Contact"
        description="Get in touch with Li Yanpei (Lucian), a software engineer in Hong Kong: send a message, write an e-mail or save the contact card."
        url={absUrl('/contact')}
        image={ogPresetUrl('contact')}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'ContactPage',
            name: 'Contact — Li Yanpei (Lucian)',
            url: absUrl('/contact'),
            about: { '@id': PERSON_ID },
          },
          breadcrumb([
            { name: 'Home', path: '/' },
            { name: 'Contact', path: '/contact' },
          ]),
        ]}
      />
      <HeaderFooter>
        <Box maxW="var(--container-content)" mx="auto" w="100%" px={[4, 6, 8]} py={[12, 16]}>
          <PageHeader eyebrow="Contact" title="Get in touch" lede={lede} />
          <AvailabilityCard availability={availability} />
          <ContactPro
            home={home || undefined}
            hideBlurb
            vcard={{ href: VCARD_PATH, qrSvg: vcardQr }}
          />
        </Box>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default Contact

/** Strip undefined values (getServerSideProps props must be JSON-serialisable). */
function defined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  let home: ContactHome | null = null
  let availability: Props['availability'] = null
  let chromeSocials: HomeData['socials'] | null | undefined
  try {
    const { readPublicHome } = await import('../../lib/home')
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
    const { qrSvg } = await import('../../lib/qr')
    vcardQr = await qrSvg(absUrl(VCARD_PATH))
  } catch {
    /* the panel keeps the .vcf link without the QR code */
  }
  return {
    props: {
      home,
      availability,
      vcardQr,
      ...(chromeSocials !== undefined ? { chromeSocials } : {}),
    },
  }
}
