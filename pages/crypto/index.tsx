import { useSession } from 'next-auth/react'
import React, { useEffect, useState } from 'react'
import type { GetStaticProps } from 'next'
import {
  Box,
  Flex,
  Heading,
  Text,
  useColorModeValue,
  useMediaQuery,
} from '@chakra-ui/react'

import HeaderFooter from '../../layout/HeaderFooter'
import CryptoPriceTracker from '../../components/Crypto/CoinStock'
import CustomHead from '../../components/General-UI/CustomHead'
import SectionLabel from '../../components/General-UI/SectionLabel'

/**
 * /crypto — Binance 24h ticker page.
 *
 * Underlying CryptoPriceTracker (CoinStock.tsx) is unchanged — it owns the
 * WebSocket lifecycle, data filtering, the converter widget, sorting, etc.
 *
 * v6 changes here:
 *   - Section label + display heading frame
 *   - Disclaimer rendered as a single mono caption (replaces v5's two
 *     gray Text nodes)
 *   - Constrained to container width like the rest of the site
 */

const Crypto = (props: { host?: string; builtAt?: string }) => {
  useSession()
  const [, setIsHostCV] = useState<boolean>(false)
  const [isMobile] = useMediaQuery('(max-width: 767px)')

  useEffect(() => {
    if (props.host && props.host === 'cv.hiko.dev') setIsHostCV(true)
  }, [props.host])

  const dim = useColorModeValue('gray.500', 'gray.500')
  const monoFont = 'var(--font-geist-mono), monospace'

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
        <Box maxW="var(--container-content)" mx="auto" px={[4, 6, 8]} py={[6, 10]}>
          <SectionLabel n={3} mb={4}>
            Crypto Live
          </SectionLabel>

          <Heading
            fontSize={['28px', '40px', '52px']}
            fontWeight={500}
            letterSpacing="-0.025em"
            lineHeight="1.05"
            mb={3}
          >
            24-hour Binance ticker.
          </Heading>
          <Text color={dim} maxW="600px" mb={6} fontSize="14px">
            Spot prices stream over WebSocket. Use the search to filter or the
            built-in converter to compute a swap value at the latest tick.
          </Text>

          <Flex
            wrap="wrap"
            gap={3}
            fontFamily={monoFont}
            fontSize="11px"
            color={dim}
            letterSpacing="0.04em"
            mb={8}
            pb={4}
            borderBottom="1px solid"
            borderColor="page.border"
          >
            <Text as="span">Source · Binance 24hr ticker</Text>
            <Text as="span" opacity={0.5}>·</Text>
            <Text as="span">Initial build · {props.builtAt?.slice(0, 10)}</Text>
            <Text as="span" opacity={0.5}>·</Text>
            <Text as="span">ISR ~60s</Text>
            <Text as="span" opacity={0.5}>·</Text>
            <Text as="span" color="orange.400">Not financial advice</Text>
          </Flex>

          <CryptoPriceTracker />
        </Box>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default Crypto

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {
      builtAt: new Date().toISOString(),
      host: process.env.NEXT_PUBLIC_SITE_HOST || 'hiko.dev',
    },
    revalidate: 60,
  }
}
