import type { GetStaticProps } from 'next'
import { Box, Flex, Heading, Text, useMediaQuery } from '@chakra-ui/react'

import HeaderFooter from '../../layout/HeaderFooter'
import CryptoPriceTracker from '../../components/Crypto/CoinStock'
import CustomHead from '../../components/General-UI/CustomHead'
import { getDefaultSeoImage, getSiteUrl } from '../../lib/seo'

const Crypto = (props: { host?: string; builtAt?: string }) => {
  const [isMobile] = useMediaQuery('(max-width: 767px)')
  const siteUrl = getSiteUrl(props.host)

  return (
    <React.Fragment>
      <CustomHead
        title="Crypto Prices"
        description="Live cryptocurrency prices and converter. Data from Binance. Updated frequently."
        url={`${siteUrl}/crypto`}
        image={getDefaultSeoImage(props.host)}
        imageAlt="Crypto prices preview"
        type="website"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Crypto Prices',
          url: `${siteUrl}/crypto`,
          description: 'Live cryptocurrency prices and converter. Data from Binance.',
          dateModified: props.builtAt,
        }}
      />
      <HeaderFooter isMobile={isMobile}>
        <Flex direction="column" alignItems="center" justifyContent="center" p={['20px', '40px']} gap={['16px', '24px']} w="full">
          <Box maxW="4xl" textAlign="center" px={{ base: 2, md: 0 }}>
            <Heading size="lg">Live Crypto Snapshot</Heading>
            <Text mt={3} fontSize="md" color="gray.600">
              Explore frequently updated USDT pairs, search fast, and make quick indicative conversions from the same market reference.
            </Text>
            <Text mt={3} fontSize="sm" color="gray.500">
              Source: Binance 24hr ticker and live stream. Initial build: {props.builtAt} with ISR around 60 seconds.
              {' '}This page is for reference only, not financial advice.
            </Text>
          </Box>
          <CryptoPriceTracker />
        </Flex>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default Crypto

export const getStaticProps: GetStaticProps = async ({}) => {
  return {
    props: { builtAt: new Date().toISOString(), host: process.env.NEXT_PUBLIC_SITE_HOST || 'hiko.dev' },
    revalidate: 60,
  }
}
