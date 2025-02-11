import React, { useEffect, useState } from 'react'
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  Image,
  useClipboard,
  useDisclosure,
  Input,
  Select,
  Button,
  Flex,
  Grid,
  GridItem,
  useToast,
  useMediaQuery,
} from '@chakra-ui/react'
import { motion } from 'framer-motion'

// Define the ticker data type and API response format
interface TickerData {
  symbol: string
  price: number
  priceChangePercent: number | null
}

const SYMBOLS = [
  {
    symbol: 'BTCUSDT',
    icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1.png',
  },
  {
    symbol: 'ETHUSDT',
    icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png',
  },
  {
    symbol: 'DOGEUSDT',
    icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/74.png',
  },
  {
    symbol: 'SOLUSDT',
    icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png',
  },
  {
    symbol: 'XRPUSDT',
    icon: 'https://s2.coinmarketcap.com/static/img/coins/64x64/52.png',
  },
]

const BASE_URL = 'https://api.binance.com/api/v3/ticker/price'
const BASE_24H_URL = 'https://api.binance.com/api/v3/ticker/24hr'

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

const CryptoPriceTracker: React.FC = () => {
  const [tickers, setTickers] = useState<TickerData[]>([])
  const [lastPrices, setLastPrices] = useState<Map<string, number>>(new Map())
  const [, setUpCount] = useState<number>(0) // Track the number of price increases
  const [, setDownCount] = useState<number>(0) // Track the number of price decreases
  const [currentTime, setCurrentTime] = useState<string>('')
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null)
  const { onCopy, hasCopied } = useClipboard(selectedPayment || '')
  const { onOpen } = useDisclosure()

  const [amount, setAmount] = useState<number>(0)
  const [fromCurrency, setFromCurrency] = useState<string>('USD')
  const [toCurrency, setToCurrency] = useState<string>('BTC')
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null)
  const [toUSDT, setToUSDT] = useState<boolean>(false)
  const toast = useToast()
  const [isMobile] = useMediaQuery('(max-width: 768px)')

  // Fetch price data
  const fetchPrices = async (): Promise<Map<string, number>> => {
    const priceMap = new Map<string, number>()
    try {
      const responses = await Promise.all(
        SYMBOLS.map(({ symbol }) =>
          fetch(`${BASE_URL}?symbol=${symbol}`).then((res) => res.json())
        )
      )
      responses.forEach((data) => {
        priceMap.set(data.symbol, parseFloat(data.price))
      })
    } catch (error) {
      console.error('Error fetching prices:', error)
    }
    return priceMap
  }

  // Fetch 24-hour price changes
  const fetch24hChanges = async (): Promise<Map<string, number>> => {
    const changeMap = new Map<string, number>()
    try {
      const response = await fetch(BASE_24H_URL)
      const data = await response.json()
      data.forEach((item: any) => {
        if (SYMBOLS.some(({ symbol }) => symbol === item.symbol)) {
          changeMap.set(item.symbol, parseFloat(item.priceChangePercent))
        }
      })
    } catch (error) {
      console.error('Error fetching 24h changes:', error)
    }
    return changeMap
  }

  // Update prices and price changes
  const updatePrices = async () => {
    const prices = await fetchPrices()
    const changes = await fetch24hChanges()

    // Track the number of price increases and decreases
    let up = 0
    let down = 0

    const updatedTickers: TickerData[] = SYMBOLS.map(({ symbol }) => {
      const currentPrice = prices.get(symbol) || 0
      const lastPrice = lastPrices.get(symbol)
      const priceChangePercent = changes.get(symbol) || null

      // Determine price changes
      if (lastPrice !== undefined) {
        if (currentPrice > lastPrice) up++
        else if (currentPrice < lastPrice) down++
      }

      return {
        symbol,
        price: currentPrice,
        priceChangePercent,
      }
    })

    setTickers(updatedTickers)
    setLastPrices(new Map(prices))
    setUpCount(up)
    setDownCount(down)
  }

  // Update the current time
  const updateTime = () => {
    const now = new Date()
    const formattedTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    setCurrentTime(formattedTime)
  }

  // Initialize data and set up polling
  useEffect(() => {
    updatePrices() // Initialize data
    const priceInterval = setInterval(updatePrices, 1000) // Update prices every second
    const timeInterval = setInterval(updateTime, 1000) // Update time every second
    return () => {
      clearInterval(priceInterval)
      clearInterval(timeInterval)
    } // Clear intervals
  }, [amount, fromCurrency, toCurrency, toUSDT]) // Add dependencies to re-run effect on changes

  const handleConvert = () => {
    // Ensure tickers are available and currency symbols are uppercase
    if (!tickers || tickers.length === 0) {
      toast({
        title: 'Conversion Failed',
        description: 'Price data is not available. Please try again later.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      return
    }

    const fromSymbol = `${fromCurrency.toUpperCase()}USDT`
    const toSymbol = toUSDT ? 'USDT' : `${toCurrency.toUpperCase()}USDT`

    const toPrice = tickers.find((t) => t.symbol === fromSymbol)?.price || 0
    const fromPrice = tickers.find((t) => t.symbol === toSymbol)?.price || 0

    const converted = (amount / fromPrice) * toPrice

    setConvertedAmount(converted)
    toast({
      title: 'Conversion Complete',
      description: `${amount} ${fromCurrency} = ${converted.toFixed(8)} ${
        toUSDT ? 'USDT' : toCurrency
      }`,
      status: 'success',
      duration: 5000,
      isClosable: true,
    })
  }

  const handlePaymentClick = (address: string) => {
    setSelectedPayment(address)
    // setSelectedQrCode(qrCode)
    onOpen()
  }

  return (
    <Box p={6} minH="50vh" color="black">
      <Box mb={4}>
        <Text
          fontSize="lg"
          mb={4}
          as={motion.div}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: '1s' }}
        >
          Current Time: {currentTime}
        </Text>
      </Box>
      <CryptoPriceTable tickers={tickers} lastPrices={lastPrices} />
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
            <Text fontSize="md">
              Selected Payment Address: {selectedPayment}
            </Text>
            <Text mt={2} color="blue.500" cursor="pointer" onClick={onCopy}>
              {hasCopied ? 'Copied!' : 'Copy Address'}
            </Text>
          </Box>
        )}
      </Box>

      <Box mt={6}>
        <Text
          fontSize="lg"
          mb={4}
          as={motion.div}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: '1s' }}
        >
          Currency Converter
        </Text>
        <Flex
          align="center"
          justify="center"
          gap={4}
          direction={isMobile ? 'column' : 'row'}
        >
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value))}
            placeholder="Amount"
            width="200px"
            as={motion.input}
            whileFocus={{ scale: 1.05 }}
          />
          <Select
            value={fromCurrency}
            onChange={(e) => setFromCurrency(e.target.value)}
            width="150px"
            title="Select From Currency"
            as={motion.select}
            whileFocus={{ scale: 1.05 }}
          >
            {SYMBOLS.map(({ symbol }) => (
              <option key={symbol} value={symbol.replace('USDT', '')}>
                {symbol.replace('USDT', '')}
              </option>
            ))}
          </Select>
          <Select
            value={toCurrency}
            onChange={(e) => setToCurrency(e.target.value)}
            width="150px"
            title="Select To Currency"
            isDisabled={toUSDT}
            as={motion.select}
            whileFocus={{ scale: 1.05 }}
          >
            {SYMBOLS.map(({ symbol }) => (
              <option key={symbol} value={symbol.replace('USDT', '')}>
                {symbol.replace('USDT', '')}
              </option>
            ))}
          </Select>
          <Button
            onClick={() => setToUSDT(!toUSDT)}
            colorScheme="blue"
            as={motion.button}
            whileHover={{ scale: 1.1 }}
          >
            {toUSDT ? 'Convert to Currency' : 'Convert to USDT'}
          </Button>
          <Button
            onClick={handleConvert}
            colorScheme="blue"
            as={motion.button}
            whileHover={{ scale: 1.1 }}
          >
            Convert
          </Button>
        </Flex>
        {convertedAmount !== null && (
          <Text
            mt={4}
            textAlign="center"
            fontSize="lg"
            as={motion.div}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: '1s' }}
          >
            {amount} {fromCurrency} = {convertedAmount.toFixed(8)}{' '}
            {toUSDT ? (
              'USDT'
            ) : (
              <>
                <Image
                  src={
                    SYMBOLS.find(
                      (s) => s.symbol === `${toCurrency.toUpperCase()}USDT`
                    )?.icon
                  }
                  alt={toCurrency}
                  boxSize="20px"
                  display="inline"
                  mr={2}
                />
                {toCurrency}
              </>
            )}
          </Text>
        )}
      </Box>
    </Box>
  )
}

interface CryptoPriceTableProps {
  tickers: TickerData[]
  lastPrices: Map<string, number>
}

export const CryptoPriceTable: React.FC<CryptoPriceTableProps> = ({
  tickers,
  lastPrices,
}) => {
  return (
    <Table
      variant="simple"
      colorScheme="gray"
      as={motion.table}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: '1s' }}
    >
      <Thead>
        <Tr>
          <Th>Symbol</Th>
          <Th>Price (USDT)</Th>
          <Th>24h Change (%)</Th>
        </Tr>
      </Thead>
      <Tbody>
              { tickers.map(({ symbol, price, priceChangePercent }) => {
          const lastPrice = lastPrices.get(symbol);
          let color = 'gray.400';
          let arrow = '';
          const icon = SYMBOLS.find((s) => s.symbol === symbol)?.icon;

          if (lastPrice && priceChangePercent !== null) {
            if (priceChangePercent > 0) {
              color = 'green.500';
              arrow = '↑';
            } else if (priceChangePercent < 0) {
              color = 'red.500';
              arrow = '↓';
            }
          }

          return (
            <Tr key={symbol} as={motion.tr} whileHover={{ scale: 1.05 }}>
              <Td>
                {icon && (
                  <Image src={icon} alt={symbol} boxSize="20px" mr={2} />
                )}
                {symbol}
              </Td>
              <Td color="black">{price.toFixed(4)}</Td>
              <Td color={color}>
                {priceChangePercent !== null
                  ? `${priceChangePercent.toFixed(2)}% ${arrow}`
                  : 'N/A'}
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  )
}
export default CryptoPriceTracker
