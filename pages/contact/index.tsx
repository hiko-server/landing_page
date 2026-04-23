
import { Badge, Flex, Heading, Stack, Text, useColorModeValue, useMediaQuery } from '@chakra-ui/react'

import ContactPro from '../../components/Contact/ContactPro'
import HeaderFooter from '../../layout/HeaderFooter'
import CustomHead from '../../components/General-UI/CustomHead'
import { getDefaultSeoImage, getSiteUrl } from '../../lib/seo'

const ContactPage = (props: any) => {
  const [isMobile] = useMediaQuery('(max-width: 767px)')
  const mutedText = useColorModeValue('gray.600', 'gray.300')
  const siteUrl = getSiteUrl(props.host)

  return (
    <React.Fragment>
      <CustomHead
        title="Contact"
        description="Get in touch with Hiko. Protected by hCaptcha."
        url={`${siteUrl}/contact`}
        image={getDefaultSeoImage(props.host)}
        imageAlt="Contact Hiko preview"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'ContactPage',
            name: 'Contact Hiko',
            url: `${siteUrl}/contact`,
            description: 'Contact page for project inquiries, hiring, consulting, and collaboration requests.',
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: 'Li Yanpei (Hiko)',
            url: siteUrl,
            email: props.home?.hero?.email ? `mailto:${props.home.hero.email}` : undefined,
            sameAs: [
              props.home?.socials?.github,
              props.home?.socials?.gitlab,
              props.home?.socials?.linkedin,
              props.home?.socials?.whatsapp,
            ].filter(Boolean),
            jobTitle: 'Full-stack Engineer',
          },
        ]}
      />
      <HeaderFooter isMobile={isMobile}>
        <Flex
          direction="column"
          alignItems="center"
          justifyContent="center"
          px={['20px', '32px', '40px']}
          py={['24px', '32px', '44px']}
          gap={['20px', '28px']}
        >
          <Stack spacing={4} alignItems="center" textAlign="center" maxW="3xl">
            <Badge colorScheme="teal" px={3} py={1} borderRadius="full">
              Contact and collaboration
            </Badge>
            <Heading size={isMobile ? 'lg' : 'xl'}>Start the conversation with the right context</Heading>
            <Text color={mutedText} fontSize={['md', 'lg']}>
              Share what you are building, what kind of help you need, and any important timing
              details. The form below keeps a local draft, includes captcha protection, and gives
              clear feedback after submission.
            </Text>
          </Stack>
          <ContactPro home={props.home || undefined} />
        </Flex>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default ContactPage

export async function getServerSideProps(context: any) {
  const host = context.req.headers.host || 'hiko.dev'
  let home = null
  try {
    const mod = await import('../../lib/home')
    home = mod.readHome()
  } catch {}
  return { props: { host, home } }
}
