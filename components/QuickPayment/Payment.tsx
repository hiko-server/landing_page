import {
  Box,
  Grid,
  GridItem,
  Text,
  useClipboard,
  Image,
  Tooltip,
  useMediaQuery,
  useColorModeValue,
  Heading,
  Flex,
} from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { useState } from 'react'

/**
 * v6 Quick Payment.
 *
 * All v5 functionality preserved:
 *   - 6 payment methods (BTC / ETH / DOGE / USDT / WeChat Pay / Alipay)
 *   - QR images from public/images/payment/*
 *   - Click a method to set selected; crypto addresses get a copy button
 *   - Responsive grid (5-up on desktop, 2-up on mobile)
 *
 * Visual upgrades:
 *   - Transparent panels with thin border (was heavy boxShadow + lg border)
 *   - Mono section eyebrow + truncated address shown in mono font
 *   - Selected tile gets indigo accent border (was blue)
 *   - Hover lifts subtle 1px instead of scaling
 */
const Payment = () => {
  const PAYMENT_OPTIONS = [
    {
      name: 'Bitcoin',
      qrCode: 'images/payment/btc.jpg',
      address: 'bc1ph0ug5l2h7f3yjlxuvms9td3mtzf6zq8npxgmjsq64lcnh3mws8xq6z9jl2',
    },
    {
      name: 'Ethereum',
      qrCode: 'images/payment/eth.jpg',
      address: '0x69df4486920c48a984758c49b3033e4d89Dc0454',
    },
    {
      name: 'Dogecoin',
      qrCode: 'images/payment/doge.jpg',
      address: 'D7XZZGy2VehXYGmpsAF6Zpf4oWL3L8BXF2',
    },
    {
      name: 'USDT',
      qrCode: 'images/payment/usdt.jpg',
      address: 'TNkurGGhRqWqzccnUnjnC67sxvnZHZjbY9',
    },
    {
      name: 'WeChat Pay',
      qrCode: 'images/payment/wechatpay.jpg',
      address: 'https://pc.weixin.qq.com/',
    },
    {
      name: 'AliPay',
      qrCode: 'images/payment/alipay.jpg',
      address: 'https://global.alipay.com/platform/site/ihome',
    },
  ]

  const [selectedPayment, setSelectedPayment] = useState<string | null>(null)
  const { onCopy, hasCopied } = useClipboard(selectedPayment || '')
  const [isLargerThan768] = useMediaQuery('(min-width: 768px)')

  const border = useColorModeValue('rgba(0,0,0,0.10)', 'rgba(255,255,255,0.12)')
  const borderStrong = useColorModeValue('rgba(0,0,0,0.20)', 'rgba(255,255,255,0.20)')
  const dim = useColorModeValue('gray.500', 'gray.500')
  const fg = useColorModeValue('gray.800', 'gray.100')
  const monoFont = 'var(--font-geist-mono), monospace'

  const isCrypto = (address: string) => !address.startsWith('http')

  return (
    <Box
      w="100%"
      maxW="var(--container-content)"
      borderWidth="1px"
      borderColor={border}
      borderRadius="lg"
      p={[5, 6]}
    >
      <Text
        fontFamily={monoFont}
        fontSize="10px"
        letterSpacing="0.16em"
        textTransform="uppercase"
        color={dim}
        mb={2}
      >
        ▸ Quick Payment
      </Text>

      <Heading
        fontSize={['22px', '28px']}
        fontWeight={500}
        letterSpacing="-0.02em"
        mb={1}
      >
        Send a small amount, fast.
      </Heading>
      <Text fontSize="13px" color={dim} mb={6} maxW="600px">
        Pick a method below. Crypto addresses are click-to-copy; mobile-wallet
        payments open in their native flow via the QR code.
      </Text>

      {/* Selected address summary */}
      {selectedPayment && isCrypto(selectedPayment) && (
        <Flex
          align="center"
          justify="space-between"
          gap={3}
          p={3}
          mb={6}
          border="1px solid"
          borderColor={border}
          borderRadius="md"
          flexWrap="wrap"
        >
          <Box minW={0} flex={1}>
            <Text
              fontFamily={monoFont}
              fontSize="10px"
              letterSpacing="0.04em"
              color={dim}
              mb={1}
            >
              Address
            </Text>
            <Text
              fontFamily={monoFont}
              fontSize="13px"
              color={fg}
              isTruncated
              title={selectedPayment}
            >
              {selectedPayment.slice(0, 10)}…{selectedPayment.slice(-12)}
            </Text>
          </Box>
          <Text
            fontFamily={monoFont}
            fontSize="12px"
            color="var(--accent)"
            cursor="pointer"
            onClick={onCopy}
            _hover={{ textDecoration: 'underline' }}
            flexShrink={0}
          >
            {hasCopied ? '✓ Copied' : 'Copy ↗'}
          </Text>
        </Flex>
      )}

      {/* Method grid */}
      <Grid
        templateColumns={
          isLargerThan768 ? 'repeat(6, 1fr)' : 'repeat(2, 1fr)'
        }
        gap={4}
      >
        {PAYMENT_OPTIONS.map(({ name, qrCode, address }) => {
          const isSelected = selectedPayment === address
          return (
            <Tooltip label={name} key={name} hasArrow placement="top">
              <GridItem
                as={motion.div as any}
                textAlign="center"
                cursor="pointer"
                onClick={() => setSelectedPayment(address)}
                border="1px solid"
                borderColor={isSelected ? 'var(--accent)' : border}
                p={3}
                borderRadius="md"
                whileHover={{ y: -2 }}
                transition={{ duration: 0.18 } as any}
                sx={{
                  '&:hover': {
                    borderColor: isSelected ? 'var(--accent)' : borderStrong,
                  },
                }}
                bg={isSelected ? 'rgba(99,102,241,0.06)' : 'transparent'}
              >
                <Image
                  src={qrCode}
                  alt={name}
                  borderRadius="sm"
                  objectFit="cover"
                  mb={2}
                />
                <Text
                  fontFamily={monoFont}
                  fontSize="11px"
                  letterSpacing="0.04em"
                  color={isSelected ? 'var(--accent)' : dim}
                  textTransform="uppercase"
                >
                  {name}
                </Text>
              </GridItem>
            </Tooltip>
          )
        })}
      </Grid>
    </Box>
  )
}

export default Payment
