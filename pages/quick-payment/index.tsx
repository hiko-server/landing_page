import React from 'react'

import {
  Badge,
  Box,
  Flex,
  Heading,
  SimpleGrid,
  Stack,
  Text,
  useColorModeValue,
  useMediaQuery,
} from '@chakra-ui/react'
import { FiClock, FiMessageCircle, FiShield } from 'react-icons/fi'

import HeaderFooter from '../../layout/HeaderFooter'
import Payment from '../../components/QuickPayment/Payment'
import CustomHead from '../../components/General-UI/CustomHead'
import { getDefaultSeoImage, getSiteUrl } from '../../lib/seo'

const QuickPayment = (props: any) => {
  const [isMobile] = useMediaQuery('(max-width: 767px)')
  const panelBg = useColorModeValue('whiteAlpha.880', 'blackAlpha.500')
  const borderColor = useColorModeValue('blackAlpha.100', 'whiteAlpha.200')
  const mutedText = useColorModeValue('gray.600', 'gray.300')
  const siteUrl = getSiteUrl(props.host)

  return (
    <React.Fragment>
      <CustomHead
        title="Quick Payment"
        description="Fast, verified payment instructions with supported crypto and wallet channels, confirmation guidance, and clear safety notes."
        url={`${siteUrl}/quick-payment`}
        image={getDefaultSeoImage(props.host)}
        imageAlt="Quick payment preview"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Quick Payment',
          url: `${siteUrl}/quick-payment`,
          description:
            'Payment instructions with supported crypto and wallet channels, manual verification, and safety guidance.',
          isPartOf: {
            '@type': 'WebSite',
            name: 'HIKO.DEV',
            url: siteUrl,
          },
        }}
      />
      <HeaderFooter isMobile={isMobile}>
        <Flex
          direction="column"
          alignItems="center"
          justifyContent="center"
          px={['20px', '32px', '40px']}
          py={['24px', '32px', '44px']}
          gap={['16px', '24px']}
        >
          <Stack spacing={5} alignItems="center" textAlign="center" maxW="3xl">
            <Badge colorScheme="teal" px={3} py={1} borderRadius="full">
              Secure payment instructions
            </Badge>
            <Heading size={isMobile ? 'lg' : 'xl'}>
              Pay with confidence and confirm every transfer
            </Heading>
            <Text fontSize={['md', 'lg']} color={mutedText}>
              Choose a supported payment channel, copy the correct address or scan the QR
              code, then share your transfer proof for manual confirmation. This page is
              designed for quick payments without losing the safety checks.
            </Text>
          </Stack>

          <SimpleGrid columns={[1, 1, 3]} spacing={4} w="full" maxW="6xl">
            <Box
              bg={panelBg}
              borderWidth="1px"
              borderColor={borderColor}
              borderRadius="2xl"
              p={5}
              backdropFilter="blur(12px)"
            >
              <Badge colorScheme="green" mb={3}>
                Response flow
              </Badge>
              <Heading size="sm" mb={2}>
                Manual review before completion
              </Heading>
              <Text color={mutedText}>
                Every payment is checked against the expected amount and sender details before
                it is marked as received.
              </Text>
            </Box>
            <Box
              bg={panelBg}
              borderWidth="1px"
              borderColor={borderColor}
              borderRadius="2xl"
              p={5}
              backdropFilter="blur(12px)"
            >
              <Badge colorScheme="purple" mb={3}>
                Channels
              </Badge>
              <Heading size="sm" mb={2}>
                Crypto and QR wallet options
              </Heading>
              <Text color={mutedText}>
                USDT, BTC, ETH, DOGE, WeChat Pay, and AliPay are available. Contact first if
                you need a different payment route.
              </Text>
            </Box>
            <Box
              bg={panelBg}
              borderWidth="1px"
              borderColor={borderColor}
              borderRadius="2xl"
              p={5}
              backdropFilter="blur(12px)"
            >
              <Badge colorScheme="orange" mb={3}>
                Safety
              </Badge>
              <Heading size="sm" mb={2}>
                Verify details before sending
              </Heading>
              <Text color={mutedText}>
                Use the latest address shown here, confirm the network, and avoid sending from
                unsupported chains or stale screenshots.
              </Text>
            </Box>
          </SimpleGrid>

          <SimpleGrid columns={[1, 1, 3]} spacing={4} w="full" maxW="6xl">
            {[
              {
                icon: FiClock,
                label: 'Typical confirmation',
                text: 'Most payments can be reviewed quickly once a transfer reference or screenshot is shared.',
              },
              {
                icon: FiShield,
                label: 'Anti-fraud checks',
                text: 'Unexpected amounts, unmatched senders, or wrong networks may require manual follow-up before completion.',
              },
              {
                icon: FiMessageCircle,
                label: 'Need help first?',
                text: 'If you are unsure which channel to use, reach out before sending so the payment can be matched correctly.',
              },
            ].map(({ icon: Icon, label, text }) => (
              <Stack
                key={label}
                direction="row"
                spacing={4}
                alignItems="flex-start"
                bg={panelBg}
                borderWidth="1px"
                borderColor={borderColor}
                borderRadius="2xl"
                p={5}
                w="full"
                backdropFilter="blur(12px)"
              >
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  boxSize="42px"
                  borderRadius="xl"
                  bg="teal.500"
                  color="white"
                  flexShrink={0}
                >
                  <Icon />
                </Box>
                <Box>
                  <Text fontWeight="semibold" mb={1}>
                    {label}
                  </Text>
                  <Text color={mutedText}>{text}</Text>
                </Box>
              </Stack>
            ))}
          </SimpleGrid>

          <Payment />
        </Flex>
      </HeaderFooter>
    </React.Fragment>
  )
}

export default QuickPayment
