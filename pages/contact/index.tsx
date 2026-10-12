import React from 'react'

import { Flex } from '@chakra-ui/react'

import ContactPro from '../../components/Contact/ContactPro'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { absUrl, breadcrumb, PERSON_ID } from '../../lib/schema'

const About = (props: any) => {

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
        <Flex direction="column" alignItems="center" justifyContent="center" p={['20px', '40px']} gap={['20px', '40px']}>
          <ContactPro home={props.home || undefined} headingAs="h1" />
        </Flex>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default About

export async function getServerSideProps(context: any) {
  const host = context.req.headers.host || 'lucian-dev.com'
  let home = null
  try {
    const mod = await import('../../lib/home')
    home = mod.readHome()
  } catch {
    /* best effort — render with what we have */
  }
  return { props: { host, home } }
}
