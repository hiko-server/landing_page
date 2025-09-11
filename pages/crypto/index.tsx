import { useSession } from 'next-auth/react'
import React, { useEffect, useState } from 'react'
import type { GetStaticProps } from 'next'
import { Flex, Text, useMediaQuery } from '@chakra-ui/react'

import HeaderFooter from '../../layout/HeaderFooter'
import CryptoPriceTracker from '../../components/Crypto/CoinStock'
import CustomHead from '../../components/General-UI/CustomHead'

const Crypto = (props: { host?: string; builtAt?: string }) => {
  useSession()

  const [, setIsHostCV] = useState<boolean>(false)
  const [isMobile] = useMediaQuery('(max-width: 767px)')

  useEffect(() => {
    if (props.host && props.host === 'cv.hiko.dev') {
      setIsHostCV(true)
    }
  }, [props.host])

  return (
    <React.Fragment>
      <CustomHead
        title="Crypto Prices"
        description="Live cryptocurrency prices and converter. Data from Binance. Updated frequently."
        url={`https://${props.host || 'hiko.dev'}/crypto`}
        image="/images/hikoAvator.png"
        type="website"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Crypto Prices',
          description: 'Live cryptocurrency prices and converter. Data from Binance.',
          dateModified: props.builtAt,
        }}
      />
      <HeaderFooter isMobile={isMobile}>
        <Flex direction="column" alignItems="center" justifyContent="center" p={['20px', '40px']} gap={['10px', '20px']}>
          <Text fontSize="sm" color="gray.600">
            Source: Binance 24hr ticker. This page uses client updates; initial build: {props.builtAt} (ISR ~60s).
          </Text>
          <Text fontSize="xs" color="gray.500">
            Disclaimer: Not financial advice. Data may be delayed or inaccurate.
          </Text>
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
