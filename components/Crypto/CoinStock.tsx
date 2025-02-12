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
  Input,
  Select,
  Button,
  Flex,
  useToast,
  useMediaQuery,
} from '@chakra-ui/react'
import { motion } from 'framer-motion'

// Define the ticker data type and API response format
interface TickerData {
  symbol: string
  price: number
  priceChangePercent: number | null
  symbols: { symbol: string; icon: string }[]
}

const BASE_URL = 'https://api.binance.com/api/v3/ticker/price'
const BASE_24H_URL = 'https://api.binance.com/api/v3/ticker/24hr'
const SYMBOLS_URL = 'https://api.binance.com/api/v3/ticker/24hr'

const CryptoPriceTracker: React.FC = () => {
  const [tickers, setTickers] = useState<TickerData[]>([])
  const [lastPrices, setLastPrices] = useState<Map<string, number>>(new Map())
  const [, setUpCount] = useState<number>(0) // Track the number of price increases
  const [, setDownCount] = useState<number>(0) // Track the number of price decreases
  const [currentTime, setCurrentTime] = useState<string>('')

  const [amount, setAmount] = useState<number>(0)
  const [fromCurrency, setFromCurrency] = useState<string>('USD')
  const [toCurrency, setToCurrency] = useState<string>('BTC')
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null)
  const [toUSDT, setToUSDT] = useState<boolean>(false)
  const toast = useToast()
  const [isMobile] = useMediaQuery('(max-width: 768px)')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [symbols, setSymbols] = useState<{ symbol: string; icon: string }[]>([])
  const [visibleCount, setVisibleCount] = useState<number>(10) // Number of tickers to display initially
  const [lastFetchTime, setLastFetchTime] = useState<number>(0)

  // Fetch all available symbols
  const fetchSymbols = async () => {
    try {
      const response = await fetch(SYMBOLS_URL)
      const data = await response.json()
      const filteredSymbols = data
        .filter((item: any) => item.symbol.endsWith('USDT'))
        .map((item: any) => ({
          symbol: item.symbol,
          icon: `https://s2.coinmarketcap.com/static/img/coins/64x64/${item.symbol.replace('USDT', '')}.png`,
        }))
      setSymbols(filteredSymbols)
    } catch (error) {
      console.error('Error fetching symbols:', error)
    }
  }

  // Fetch price data
  const fetchPrices = async (): Promise<Map<string, number>> => {
    const priceMap = new Map<string, number>()
    try {
      const responses = await Promise.all(
        symbols.map(({ symbol }) =>
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
        if (symbols.some(({ symbol }) => symbol === item.symbol)) {
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
    const currentTime = Date.now()
    if (currentTime - lastFetchTime < 1000) {
      return // Prevent excessive requests
    }
    setLastFetchTime(currentTime)

    const prices = await fetchPrices()
    const changes = await fetch24hChanges()

    // Track the number of price increases and decreases
    let up = 0
    let down = 0

    const updatedTickers: TickerData[] = symbols.map(({ symbol }) => {
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
        symbols: symbols.filter(s => s.symbol === symbol),
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
    fetchSymbols() // Fetch all available symbols
    updatePrices() // Initialize data
    const priceInterval = setInterval(updatePrices, 1000) // Update prices every second
    const timeInterval = setInterval(updateTime, 1000) // Update time every second
    return () => {
      clearInterval(priceInterval)
      clearInterval(timeInterval)
    } // Clear intervals
  }, [amount, fromCurrency, toCurrency, toUSDT, symbols]) // Add dependencies to re-run effect on changes

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

  const handleShowMore = () => {
    setVisibleCount((prevCount) => prevCount + 10)
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
      <Input
        placeholder="Search Cryptocurrency"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        mb={4}
        as={motion.input}
        whileFocus={{ scale: 1.05 }}
      />
      <CryptoPriceTable tickers={tickers} lastPrices={lastPrices} searchQuery={searchQuery} symbols={symbols} visibleCount={searchQuery ? tickers.length : visibleCount} />
      {!searchQuery && visibleCount < tickers.length && (
        <Button
          onClick={handleShowMore}
          colorScheme="blue"
          mt={4}
          as={motion.button}
          whileHover={{ scale: 1.1 }}
        >
          Show More
        </Button>
      )}

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
            {symbols.map(({ symbol }) => (
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
            {symbols.map(({ symbol }) => (
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
                    symbols.find(
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
  searchQuery: string
  symbols: { symbol: string; icon: string }[]
  visibleCount: number
}

export const CryptoPriceTable: React.FC<CryptoPriceTableProps> = ({
  tickers,
  lastPrices,
  searchQuery,
  symbols,
  visibleCount,
}) => {
  const filteredTickers = tickers
    .filter(({ symbol }) => symbol.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice(0, visibleCount)

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
        {filteredTickers.map(({ symbol, price, priceChangePercent }) => {
          const lastPrice = lastPrices.get(symbol)
          let color = 'gray.400'
          let arrow = ''
          const icon: string | undefined = symbols.find((s: { symbol: string }) => s.symbol === symbol)?.icon

          if (lastPrice && priceChangePercent !== null) {
            if (priceChangePercent > 0) {
              color = 'green.500'
              arrow = '↑'
            } else if (priceChangePercent < 0) {
              color = 'red.500'
              arrow = '↓'
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
          )
        })}
      </Tbody>
    </Table>
  )
}

export default CryptoPriceTracker