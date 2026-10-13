import React from 'react'
import type { GetStaticProps } from 'next'
import { Box } from '@chakra-ui/react'

import ContactPro from '../../components/Contact/ContactPro'
import AvailabilityCard from '../../components/Contact/AvailabilityCard'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import PageHeader from '../../components/General-UI/PageHeader'
import { absUrl, breadcrumb, PERSON_ID } from '../../lib/schema'
import { ogPresetUrl } from '../../lib/og/presets'
import type { ContactPageProps } from '../../lib/contactPage'

const FALLBACK_LEDE = 'Questions, roles or collaborations: send a note.'
const VCARD_PATH = '/api/vcard'

/**
 * /contact — page header, the owner's availability (when set in the Home
 * editor), the reach-me panel (copyable e-mail / phone, vCard download and
 * QR) and the message form with its privacy notice.
 *
 * Statically generated (ISR, lib/contactPage): nothing here depends on the
 * request, so the page is served from the cache (and the CDN) and
 * regenerated when the home document changes. Everything per-visitor stays
 * client side: the form's human-check nonce is fetched when the form comes
 * into view, drafts live in the visitor's browser.
 */
const Contact = ({ home, availability, vcardQr, retentionDays }: ContactPageProps) => {
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
            availability={availability}
            retentionDays={retentionDays}
          />
        </Box>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default Contact

export const getStaticProps: GetStaticProps<ContactPageProps> = async () => {
  const { loadContactPage } = await import('../../lib/contactPage')
  return loadContactPage()
}
