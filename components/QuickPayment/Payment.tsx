import {
  Box,
  Grid,
  GridItem,
  Text,
  useClipboard,
  useDisclosure,
  Image,
  Tooltip,
  useMediaQuery,
} from '@chakra-ui/react'
import { motion } from 'framer-motion'
import { useState } from 'react'

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
  const [isLargerThan768] = useMediaQuery("(min-width: 768px)")
  const handlePaymentClick = (address: string) => {
    setSelectedPayment(address)
    onOpen()
  }
  const isCrypto = (address: string) => {
    return !address.startsWith('http')
  }
  return (
    <Box mt={6} p={4} borderWidth="1px" borderRadius="lg" boxShadow="lg" >
      <Text
        fontSize="2xl"
        fontWeight="bold"
        mb={4}
        as={motion.div}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: '1s' }}
      >
        Quick Payment
      </Text>
      <Grid
        templateColumns={isLargerThan768 ? 'repeat(5, 1fr)' : 'repeat(2, 1fr)'}
        gap={6}
      >
        {PAYMENT_OPTIONS.map(({ name, qrCode, address }) => (
          <Tooltip label={name} key={name} hasArrow>
            <GridItem
              textAlign="center"
              cursor="pointer"
              onClick={() => handlePaymentClick(address)}
              border={selectedPayment === address ? '2px solid blue' : '1px solid gray'}
              p={2}
              borderRadius="md"
              _hover={{
                boxShadow: 'md',
              }}
              as={motion.div}
              whileHover={{ scale: 1.05 }}
              layout
              // width="150px"
              // height="200px"
            >
              <Image src={qrCode} alt={name} borderRadius="md" objectFit="cover" />
              <Text mt={2} fontWeight="medium">{name}</Text>
            </GridItem>
          </Tooltip>
        ))}
      </Grid>
      {selectedPayment && isCrypto(selectedPayment) && (
        <Box mt={4} textAlign="center">
          <Box
            fontSize="md"
            fontWeight="medium"
            maxWidth="100%"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
          >
            {selectedPayment.slice(0, 10)}...{selectedPayment.slice(-10)}
          </Box>
          <Text
            mt={2}
            color="blue.500"
            cursor="pointer"
            onClick={onCopy}
            _hover={{ textDecoration: 'underline' }}
          >
            {hasCopied ? 'Copied!' : 'Copy Address'}
          </Text>
        </Box>
      )}
    </Box>
  )
}

export default Payment
