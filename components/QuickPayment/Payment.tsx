import {
  Box,
  Grid,
  GridItem,
  Text,
  useClipboard,
  useDisclosure,
  Image,
} from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { isMobile } from 'react-device-detect'

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
  const { onOpen } = useDisclosure()
  const handlePaymentClick = (address: string) => {
    setSelectedPayment(address)
    // setSelectedQrCode(qrCode)
    onOpen()
  }
  return (
    <Box mt={6}>
      <Text
        fontSize="lg"
        mb={4}
        as={motion.div}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: '1s' }}
      >
        Quick Payment
      </Text>
      <Grid
        templateColumns={isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)'}
        gap={6}
      >
        {PAYMENT_OPTIONS.map(({ name, qrCode, address }) => (
          <GridItem
            key={name}
            textAlign="center"
            cursor="pointer"
            onClick={() => handlePaymentClick(address)}
            border={selectedPayment === address ? '2px solid blue' : 'none'}
            p={2}
            borderRadius="md"
            _hover={{
              transform: 'scale(1.05)',
              transition: 'transform 0.2s',
            }}
            as={motion.div}
            whileHover={{ scale: 1.1 }}
          >
            <Image src={qrCode} alt={name} />
            <Text mt={2}>{name}</Text>
          </GridItem>
        ))}
      </Grid>
      {selectedPayment && (
        <Box mt={4} textAlign="center">
          <Text fontSize="md">Selected Payment Address: {selectedPayment}</Text>
          <Text mt={2} color="blue.500" cursor="pointer" onClick={onCopy}>
            {hasCopied ? 'Copied!' : 'Copy Address'}
          </Text>
        </Box>
      )}
    </Box>
  )
}

export default Payment
