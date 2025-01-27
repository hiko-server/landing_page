import React, { useEffect, useState } from 'react'
import { Box, Table, Thead, Tbody, Tr, Th, Td, Text } from '@chakra-ui/react'

// Define the ticker data type and API response format
interface TickerData {
  symbol: string
  price: number
  priceChangePercent: number | null
}

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'DOGEUSDT', 'BNBUSDT']
const BASE_URL = 'https://api.binance.com/api/v3/ticker/price'
const BASE_24H_URL = 'https://api.binance.com/api/v3/ticker/24hr'

const CryptoPriceTracker: React.FC = () => {
  const [tickers, setTickers] = useState<TickerData[]>([])
  const [lastPrices, setLastPrices] = useState<Map<string, number>>(new Map())
  const [upCount, setUpCount] = useState<number>(0) // Track the number of price increases
  const [downCount, setDownCount] = useState<number>(0) // Track the number of price decreases
  const [currentTime, setCurrentTime] = useState<string>('')

  // Fetch price data
  const fetchPrices = async (): Promise<Map<string, number>> => {
    const priceMap = new Map<string, number>()
    try {
      const responses = await Promise.all(
        SYMBOLS.map((symbol) =>
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
        if (SYMBOLS.includes(item.symbol)) {
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

    const updatedTickers: TickerData[] = SYMBOLS.map((symbol) => {
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
  }, [])

  return (
    <Box p={6} minH="100vh" color="black">
      <Box mb={4}>
        <Text fontSize="lg" mb={4}>
          Current Time: {currentTime}
        </Text>
        <Text fontSize="lg">
          24h Change Ratio:{' '}
          <Text as="span" color="green.500">
            Up {upCount}
          </Text>{' '}
          /{' '}
          <Text as="span" color="red.500">
            Down {downCount}
          </Text>
        </Text>
      </Box>
      <CryptoPriceTable tickers={tickers} lastPrices={lastPrices} />
    </Box>
  )
}

interface CryptoPriceTableProps {
  tickers: TickerData[]
  lastPrices: Map<string, number>
}

const CryptoPriceTable: React.FC<CryptoPriceTableProps> = ({
  tickers,
  lastPrices,
}) => {
  return (
    <Table variant="simple" colorScheme="gray">
      <Thead>
        <Tr>
          <Th>Symbol</Th>
          <Th>Price (USDT)</Th>
          <Th>24h Change (%)</Th>
        </Tr>
      </Thead>
      <Tbody>
        {tickers.map(({ symbol, price, priceChangePercent }) => {
          const lastPrice = lastPrices.get(symbol)
          let color = 'gray.400'
          let arrow = ''

          if (lastPrice) {
            if (price > lastPrice) {
              color = 'green.500'
              arrow = '↑'
            } else if (price < lastPrice) {
              color = 'red.500'
              arrow = '↓'
            }
          }

          return (
            <Tr key={symbol}>
              <Td>{symbol}</Td>
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
