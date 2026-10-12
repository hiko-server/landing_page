import React from 'react'
import type { GetServerSideProps } from 'next'
import { Flex } from '@chakra-ui/react'

import ContactPro from '../../components/Contact/ContactPro'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { absUrl, breadcrumb, PERSON_ID } from '../../lib/schema'

type ContactHome = {
  hero: { email?: string; phone?: string; brand?: string }
  socials: { github?: string; gitlab?: string; linkedin?: string; whatsapp?: string }
  contact: { heading?: string; blurb?: string; eyebrow?: string; reasons?: string[] }
}

type Props = { home: ContactHome | null }

const Contact = ({ home }: Props) => {

  return (
    <React.Fragment>
      <CustomHead
        title="Contact"
        description="Get in touch with Li Yanpei (Lucian) — a software engineer in Hong Kong. Reach out via LinkedIn, GitHub, or the contact form for work and collaboration."
        url={absUrl('/contact')}
        image={absUrl('/api/og?title=Contact&kind=page&subtitle=Let%27s%20get%20in%20touch')}
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
        <Flex direction="column" alignItems="center" justifyContent="center" px={{ base: 4, md: 10 }} py={{ base: 8, md: 12 }}>
          <ContactPro home={home || undefined} headingAs="h1" />
        </Flex>
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
  try {
    const { readPublicHome } = await import('../../lib/home')
    const h = readPublicHome()
    // Only what the contact panel renders — not the whole home document.
    if (h) {
      home = {
        hero: defined({ email: h.hero?.email, phone: h.hero?.phone, brand: h.hero?.brand }),
        socials: defined({ ...h.socials }),
        contact: defined({ ...h.contact }),
      }
    }
  } catch {
    /* best effort — render with what we have */
  }
  return { props: { home } }
}
