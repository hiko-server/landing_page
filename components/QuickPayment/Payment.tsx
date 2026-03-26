import { ExternalLinkIcon } from '@chakra-ui/icons'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Button,
  Divider,
  HStack,
  Image,
  ListItem,
  SimpleGrid,
  Stack,
  Text,
  UnorderedList,
  useClipboard,
  useColorModeValue,
} from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { FiCheckCircle, FiCopy, FiShield } from 'react-icons/fi'

type PaymentOption = {
  name: string
  qrCode: string
  address: string
  type: 'crypto' | 'wallet'
  summary: string
  network?: string
  status?: string
  actionLabel?: string
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    name: 'Bitcoin',
    qrCode: '/images/payment/btc.jpg',
    address: 'bc1ph0ug5l2h7f3yjlxuvms9td3mtzf6zq8npxgmjsq64lcnh3mws8xq6z9jl2',
    type: 'crypto',
    network: 'BTC',
    status: 'On-chain payment',
    summary: 'Suitable when you prefer native Bitcoin settlement and can wait for network confirmations.',
  },
  {
    name: 'Ethereum',
    qrCode: '/images/payment/eth.jpg',
    address: '0x69df4486920c48a984758c49b3033e4d89Dc0454',
    type: 'crypto',
    network: 'ERC-20',
    status: 'Higher network fees',
    summary: 'Best for Ethereum-native transfers. Please confirm gas costs before sending a small payment.',
  },
  {
    name: 'Dogecoin',
    qrCode: '/images/payment/doge.jpg',
    address: 'D7XZZGy2VehXYGmpsAF6Zpf4oWL3L8BXF2',
    type: 'crypto',
    network: 'DOGE',
    status: 'Community-friendly',
    summary: 'A simple option for DOGE holders when both sides have already agreed on the amount.',
  },
  {
    name: 'USDT',
    qrCode: '/images/payment/usdt.jpg',
    address: 'TNkurGGhRqWqzccnUnjnC67sxvnZHZjbY9',
    type: 'crypto',
    network: 'TRC-20',
    status: 'Recommended',
    summary: 'Usually the easiest route for stable-value transfers with lower fees and fast confirmation.',
  },
  {
    name: 'WeChat Pay',
    qrCode: '/images/payment/wechatpay.jpg',
    address: 'https://pc.weixin.qq.com/',
    type: 'wallet',
    status: 'Scan to pay',
    actionLabel: 'Open WeChat',
    summary: 'Use the QR code inside WeChat after confirming the recipient and amount in advance.',
  },
  {
    name: 'AliPay',
    qrCode: '/images/payment/alipay.jpg',
    address: 'https://global.alipay.com/platform/site/ihome',
    type: 'wallet',
    status: 'Scan to pay',
    actionLabel: 'Open AliPay',
    summary: 'Useful for wallet-based payments when a QR workflow is more convenient than crypto.',
  },
]

const MotionBox = motion(Box)

const Payment = () => {
  const [selectedPayment, setSelectedPayment] = useState<PaymentOption>(
    PAYMENT_OPTIONS.find((option) => option.name === 'USDT') || PAYMENT_OPTIONS[0]
  )
  const { onCopy, hasCopied } = useClipboard(selectedPayment.address)

  const panelBg = useColorModeValue('whiteAlpha.900', 'blackAlpha.500')
  const cardBg = useColorModeValue('whiteAlpha.760', 'whiteAlpha.80')
  const activeCardBg = useColorModeValue('teal.50', 'teal.900')
  const borderColor = useColorModeValue('blackAlpha.100', 'whiteAlpha.200')
  const activeBorderColor = useColorModeValue('teal.400', 'teal.200')
  const mutedText = useColorModeValue('gray.600', 'gray.300')
  const codeBg = useColorModeValue('gray.50', 'whiteAlpha.100')
  const selectionRing = useColorModeValue('0 16px 42px rgba(49, 151, 149, 0.18)', '0 18px 42px rgba(56, 178, 172, 0.16)')
  const warningBg = useColorModeValue('orange.50', 'orange.900')
  const warningBorderColor = useColorModeValue('orange.200', 'orange.700')

  const isCrypto = selectedPayment.type === 'crypto'

  return (
    <Box
      mt={2}
      p={[5, 6, 8]}
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="3xl"
      boxShadow="xl"
      bg={panelBg}
      w="full"
      maxW="6xl"
      backdropFilter="blur(14px)"
    >
      <Stack spacing={8}>
        <Stack spacing={3}>
          <Badge colorScheme="teal" alignSelf="flex-start" px={3} py={1} borderRadius="full">
            Ready-to-use payment channels
          </Badge>
          <Text
            fontSize={['2xl', '3xl']}
            fontWeight="bold"
            as={motion.div}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Choose a payment method and follow the latest details
          </Text>
          <Text color={mutedText} maxW="3xl">
            Select the payment method you want to use, scan the QR code or copy the address,
            and then share your transfer proof so the payment can be matched quickly.
          </Text>
        </Stack>

        <SimpleGrid columns={[1, 2, 3]} spacing={4}>
          {PAYMENT_OPTIONS.map((option) => {
            const isActive = selectedPayment.name === option.name

            return (
              <MotionBox
                key={option.name}
                as="button"
                type="button"
                textAlign="left"
                p={4}
                borderWidth="1px"
                borderColor={isActive ? activeBorderColor : borderColor}
                borderRadius="2xl"
                bg={isActive ? activeCardBg : cardBg}
                boxShadow={isActive ? selectionRing : 'none'}
                onClick={() => setSelectedPayment(option)}
                aria-pressed={isActive}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.99 }}
              >
                <Stack spacing={3}>
                  <HStack justifyContent="space-between" alignItems="flex-start" spacing={3}>
                    <Box>
                      <Text fontSize="lg" fontWeight="semibold">
                        {option.name}
                      </Text>
                      <Text fontSize="sm" color={mutedText}>
                        {option.summary}
                      </Text>
                    </Box>
                    {option.status && (
                      <Badge
                        colorScheme={option.name === 'USDT' ? 'green' : 'teal'}
                        whiteSpace="nowrap"
                      >
                        {option.status}
                      </Badge>
                    )}
                  </HStack>

                  {option.network && (
                    <Badge alignSelf="flex-start" colorScheme="purple" variant="subtle">
                      Network: {option.network}
                    </Badge>
                  )}

                  {isActive && (
                    <HStack color="teal.500" fontSize="sm" fontWeight="medium">
                      <FiCheckCircle />
                      <Text>Currently selected</Text>
                    </HStack>
                  )}
                </Stack>
              </MotionBox>
            )
          })}
        </SimpleGrid>

        <SimpleGrid columns={[1, 1, 2]} spacing={6} alignItems="stretch">
          <Box
            borderWidth="1px"
            borderColor={borderColor}
            borderRadius="2xl"
            bg={cardBg}
            p={[4, 5]}
          >
            <Stack spacing={4}>
              <HStack justifyContent="space-between" alignItems="center">
                <Box>
                  <Text fontSize="xl" fontWeight="bold">
                    {selectedPayment.name}
                  </Text>
                  <Text color={mutedText}>{selectedPayment.summary}</Text>
                </Box>
                {selectedPayment.status && (
                  <Badge colorScheme={isCrypto ? 'green' : 'blue'}>{selectedPayment.status}</Badge>
                )}
              </HStack>

              <Box
                borderRadius="2xl"
                overflow="hidden"
                borderWidth="1px"
                borderColor={borderColor}
                bg="white"
                alignSelf="flex-start"
              >
                <Image
                  src={selectedPayment.qrCode}
                  alt={`${selectedPayment.name} payment QR code`}
                  objectFit="cover"
                  maxW={['100%', '280px']}
                />
              </Box>

              {isCrypto ? (
                <Stack spacing={3}>
                  <Box>
                    <Text fontWeight="semibold" mb={2}>
                      Wallet address
                    </Text>
                    <Box
                      p={4}
                      borderRadius="xl"
                      bg={codeBg}
                      borderWidth="1px"
                      borderColor={borderColor}
                      wordBreak="break-all"
                      fontSize="sm"
                    >
                      {selectedPayment.address}
                    </Box>
                  </Box>

                  <HStack flexWrap="wrap" spacing={3}>
                    <Button
                      onClick={onCopy}
                      colorScheme="teal"
                      leftIcon={<FiCopy />}
                    >
                      {hasCopied ? 'Address copied' : 'Copy address'}
                    </Button>
                    {selectedPayment.network && (
                      <Badge colorScheme="purple" px={3} py={1} borderRadius="full">
                        Send via {selectedPayment.network}
                      </Badge>
                    )}
                  </HStack>

                  <Text fontSize="sm" color={mutedText}>
                    Double-check the address and network before confirming the transaction.
                    Crypto transfers sent on the wrong chain may not be recoverable.
                  </Text>
                </Stack>
              ) : (
                <Stack spacing={3}>
                  <Text>
                    Scan the QR code in the selected wallet app and confirm the payment details
                    before you approve the transfer.
                  </Text>
                  <Button
                    as="a"
                    href={selectedPayment.address}
                    target="_blank"
                    rel="noopener noreferrer"
                    colorScheme="teal"
                    rightIcon={<ExternalLinkIcon />}
                    alignSelf="flex-start"
                  >
                    {selectedPayment.actionLabel || `Open ${selectedPayment.name}`}
                  </Button>
                  <Text fontSize="sm" color={mutedText}>
                    Wallet payments should be pre-agreed so the transfer can be matched to the
                    right request without delay.
                  </Text>
                </Stack>
              )}
            </Stack>
          </Box>

          <Stack spacing={4}>
            <Box
              borderWidth="1px"
              borderColor={borderColor}
              borderRadius="2xl"
              bg={cardBg}
              p={[4, 5]}
            >
              <Text fontSize="lg" fontWeight="bold" mb={3}>
                How to complete a payment
              </Text>
              <UnorderedList spacing={3} ml={5}>
                <ListItem>Confirm the amount and preferred payment channel before sending.</ListItem>
                <ListItem>
                  Use the latest address or QR code shown here instead of relying on an older
                  screenshot.
                </ListItem>
                <ListItem>
                  After sending, share a screenshot or transaction hash so the payment can be
                  reviewed quickly.
                </ListItem>
              </UnorderedList>
            </Box>

            <Box
              borderWidth="1px"
              borderColor={borderColor}
              borderRadius="2xl"
              bg={cardBg}
              p={[4, 5]}
            >
              <Text fontSize="lg" fontWeight="bold" mb={3}>
                Recommended payment choices
              </Text>
              <Stack spacing={3} color={mutedText}>
                <Text>
                  USDT on TRC-20 is usually the simplest option when you want stable value and
                  lower transfer fees.
                </Text>
                <Divider />
                <Text>
                  Wallet QR methods are convenient for local payments, but they work best when
                  the amount and timing have already been confirmed.
                </Text>
              </Stack>
            </Box>

            <Alert
              status="warning"
              alignItems="flex-start"
              borderRadius="2xl"
              bg={warningBg}
              borderWidth="1px"
              borderColor={warningBorderColor}
            >
              <AlertIcon mt={1} />
              <Box>
                <AlertTitle>Before you pay</AlertTitle>
                <AlertDescription>
                  Do not send to an address or QR code from chat history alone. Use the current
                  details on this page and confirm large or unusual payments first.
                </AlertDescription>
              </Box>
            </Alert>

            <Box
              borderWidth="1px"
              borderColor={borderColor}
              borderRadius="2xl"
              bg={cardBg}
              p={[4, 5]}
            >
              <HStack spacing={3} mb={3}>
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  boxSize="38px"
                  borderRadius="xl"
                  bg="teal.500"
                  color="white"
                >
                  <FiShield />
                </Box>
                <Text fontSize="lg" fontWeight="bold">
                  Verification checklist
                </Text>
              </HStack>
              <UnorderedList spacing={3} ml={5}>
                <ListItem>Amount confirmed with the latest quote or invoice.</ListItem>
                <ListItem>Correct chain selected for crypto payments.</ListItem>
                <ListItem>Proof of payment ready to share after transfer.</ListItem>
              </UnorderedList>
            </Box>
          </Stack>
        </SimpleGrid>
      </Stack>
    </Box>
  )
}

export default Payment
