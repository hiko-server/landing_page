import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Image,
  Input,
  Select,
  SimpleGrid,
  Skeleton,
  Stat,
  StatLabel,
  StatNumber,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
  useMediaQuery,
  useToast,
} from '@chakra-ui/react'
import { motion } from 'framer-motion'

type BinanceTicker = {
  symbol: string
  c: string
  P: string
}

type BinanceLiveTicker = {
  s: string
  c: string
  P: string
}

type AssetOption = {
  asset: string
  symbol: string
  icon?: string
}

type ConnectionState = 'loading' | 'connecting' | 'live' | 'offline'

interface TickerData {
  asset: string
  symbol: string
  price: number
  priceChangePercent: number | null
  icon?: string
}

const SYMBOLS_URL = 'https://api.binance.com/api/v3/ticker/24hr'
const WEBSOCKET_URL = 'wss://stream.binance.com:9443/ws/!ticker@arr'

const formatClock = (date: Date) =>
  date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

const formatPrice = (price: number) => {
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (price >= 1) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  if (price >= 0.01) return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })
  return price.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 8 })
}

const assetFromPair = (symbol: string) => symbol.replace(/USDT$/, '')

const buildIconUrl = (asset: string) =>
  `https://s2.coinmarketcap.com/static/img/coins/64x64/${asset}.png`

const buildSnapshot = (data: BinanceTicker[]) => {
  const tickers = data
    .filter((item) => item.symbol.endsWith('USDT'))
    .map((item) => {
      const asset = assetFromPair(item.symbol)

      return {
        asset,
        symbol: item.symbol,
        price: parseFloat(item.c),
        priceChangePercent: parseFloat(item.P),
        icon: buildIconUrl(asset),
      } satisfies TickerData
    })

  const assetOptions = tickers.map(({ asset, symbol, icon }) => ({
    asset,
    symbol,
    icon,
  }))

  return { tickers, assetOptions }
}

const CryptoPriceTracker: React.FC = () => {
  const [tickers, setTickers] = useState<TickerData[]>([])
  const [lastPrices, setLastPrices] = useState<Map<string, number>>(new Map())
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState<string>('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [fromCurrency, setFromCurrency] = useState<string>('USDT')
  const [toCurrency, setToCurrency] = useState<string>('BTC')
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null)
  const [toUSDT, setToUSDT] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [assetOptions, setAssetOptions] = useState<AssetOption[]>([])
  const [visibleCount, setVisibleCount] = useState<number>(12)

  const toast = useToast()
  const [isMobile] = useMediaQuery('(max-width: 768px)')
  const panelBg = useColorModeValue('rgba(255, 255, 255, 0.92)', 'rgba(17, 24, 39, 0.9)')
  const borderColor = useColorModeValue('blackAlpha.100', 'whiteAlpha.200')
  const mutedText = useColorModeValue('gray.600', 'gray.300')
  const bodyText = useColorModeValue('gray.800', 'gray.100')
  const cardBg = useColorModeValue('whiteAlpha.900', 'whiteAlpha.120')
  const searchMatches = tickers.filter(({ symbol }) =>
    symbol.toLowerCase().includes(searchQuery.toLowerCase())
  ).length

  const loadMarketSnapshot = useCallback(async () => {
    setConnectionState('loading')
    setLoadError(null)

    try {
      const response = await fetch(SYMBOLS_URL)
      if (!response.ok) {
        throw new Error(`Unable to load market data (${response.status})`)
      }

      const data = (await response.json()) as BinanceTicker[]
      const { tickers: nextTickers, assetOptions: nextAssetOptions } = buildSnapshot(data)

      setTickers(nextTickers)
      setAssetOptions(nextAssetOptions)
      setLastPrices(new Map(nextTickers.map((ticker) => [ticker.symbol, ticker.price])))
      setLastUpdatedAt(formatClock(new Date()))
      setVisibleCount(12)
      setConnectionState('connecting')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load market data right now.')
      setConnectionState('offline')
    }
  }, [])

  const updatePrices = useCallback((data: BinanceLiveTicker[]) => {
    const prices = new Map<string, number>()
    const changes = new Map<string, number>()
    const icons = new Map(assetOptions.map(({ symbol, icon }) => [symbol, icon]))
    const validSymbols = new Set(assetOptions.map(({ symbol }) => symbol))

    data.forEach((item) => {
      if (validSymbols.has(item.s)) {
        prices.set(item.s, parseFloat(item.c))
        changes.set(item.s, parseFloat(item.P))
      }
    })

    setLastPrices((previousPrices) => {
      const updatedTickers: TickerData[] = assetOptions.map(({ asset, symbol, icon }) => ({
        asset,
        symbol,
        icon: icon || icons.get(symbol),
        price: prices.get(symbol) ?? previousPrices.get(symbol) ?? 0,
        priceChangePercent: changes.get(symbol) ?? null,
      }))

      setTickers(updatedTickers)
      return new Map(updatedTickers.map((ticker) => [ticker.symbol, ticker.price]))
    })

    setConnectionState('live')
    setLoadError(null)
    setLastUpdatedAt(formatClock(new Date()))
  }, [assetOptions])

  useEffect(() => {
    loadMarketSnapshot()
  }, [loadMarketSnapshot])

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(formatClock(new Date()))
    }

    updateTime()
    const timeInterval = setInterval(updateTime, 1000)

    return () => {
      clearInterval(timeInterval)
    }
  }, [])

  useEffect(() => {
    if (!assetOptions.length) return

    const availableAssets = new Set(assetOptions.map(({ asset }) => asset))
    setFromCurrency((current) =>
      current === 'USD' || current === 'USDT' || availableAssets.has(current)
        ? current
        : 'USDT'
    )
    setToCurrency((current) => {
      if (current && availableAssets.has(current) && current !== fromCurrency) {
        return current
      }

      return (
        assetOptions.find(({ asset }) => asset !== fromCurrency)?.asset ||
        assetOptions[0]?.asset ||
        'BTC'
      )
    })
  }, [assetOptions, fromCurrency])

  useEffect(() => {
    if (!assetOptions.length) return

    setConnectionState((current) => (current === 'loading' ? 'connecting' : current))

    const ws = new WebSocket(WEBSOCKET_URL)

    ws.onopen = () => {
      setConnectionState('live')
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as BinanceLiveTicker[]
      updatePrices(data)
    }

    ws.onerror = () => {
      setConnectionState('offline')
      setLoadError((current) => current || 'Live updates are temporarily unavailable. Showing the latest snapshot.')
    }

    ws.onclose = () => {
      setConnectionState((current) => (current === 'live' ? 'offline' : current))
    }

    return () => {
      ws.close()
    }
  }, [assetOptions, updatePrices])

  const fromOptions = useMemo(
    () => [
      { asset: 'USD', symbol: 'USD' },
      { asset: 'USDT', symbol: 'USDT' },
      ...assetOptions,
    ],
    [assetOptions]
  )

  const getAssetPriceInUsdt = useCallback((asset: string) => {
    if (asset === 'USD' || asset === 'USDT') return 1
    return tickers.find((ticker) => ticker.asset === asset)?.price ?? null
  }, [tickers])

  const parsedAmount = Number(amount)
  const fromPrice = getAssetPriceInUsdt(fromCurrency)
  const toPrice = toUSDT ? 1 : getAssetPriceInUsdt(toCurrency)
  const canConvert =
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    fromPrice !== null &&
    toPrice !== null

  const handleConvert = () => {
    if (!canConvert || fromPrice === null || toPrice === null) {
      toast({
        title: 'Conversion unavailable',
        description: 'Enter a valid amount and wait for market data to finish loading.',
        status: 'warning',
        duration: 4000,
        isClosable: true,
      })
      return
    }

    const converted = (parsedAmount * fromPrice) / toPrice
    setConvertedAmount(converted)

    toast({
      title: 'Conversion ready',
      description: `${parsedAmount} ${fromCurrency} equals ${converted.toFixed(8)} ${toUSDT ? 'USDT' : toCurrency}.`,
      status: 'success',
      duration: 4000,
      isClosable: true,
    })
  }

  const handleShowMore = () => {
    setVisibleCount((prevCount) => prevCount + 12)
  }

  const statusLabel =
    connectionState === 'live'
      ? 'Live'
      : connectionState === 'connecting'
      ? 'Connecting'
      : connectionState === 'loading'
      ? 'Loading'
      : 'Offline'

  return (
    <Box
      p={{ base: 4, md: 6 }}
      minH="50vh"
      color={bodyText}
      w="100%"
      maxW="1200px"
      bg={panelBg}
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="3xl"
      boxShadow="0 24px 70px rgba(15, 23, 42, 0.18)"
      backdropFilter="blur(14px)"
    >
      <Flex direction="column" gap={6}>
        <Flex
          justify="space-between"
          align={{ base: 'flex-start', md: 'center' }}
          direction={{ base: 'column', md: 'row' }}
          gap={4}
        >
          <Box>
            <Heading size="lg">Crypto Market Monitor</Heading>
            <Text mt={2} color={mutedText}>
              Track selected USDT pairs, search quickly, and convert between assets using the latest available reference price.
            </Text>
          </Box>
          <Button variant="outline" onClick={loadMarketSnapshot}>
            Refresh snapshot
          </Button>
        </Flex>

        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          <Box p={4} borderRadius="2xl" bg={cardBg}>
            <Stat>
              <StatLabel color={mutedText}>Tracked assets</StatLabel>
              <StatNumber>{tickers.length || assetOptions.length || 0}</StatNumber>
            </Stat>
          </Box>
          <Box p={4} borderRadius="2xl" bg={cardBg}>
            <Stat>
              <StatLabel color={mutedText}>Connection</StatLabel>
              <StatNumber>{statusLabel}</StatNumber>
            </Stat>
          </Box>
          <Box p={4} borderRadius="2xl" bg={cardBg}>
            <Stat>
              <StatLabel color={mutedText}>Last update</StatLabel>
              <StatNumber>{lastUpdatedAt || '--:--:--'}</StatNumber>
            </Stat>
          </Box>
        </SimpleGrid>

        <Box>
          <Text fontSize="sm" color={mutedText}>
            Current time: {currentTime || '--:--:--'}.
            {' '}USD is treated as a quick 1:1 reference against USDT in the converter.
          </Text>
        </Box>

        {loadError ? (
          <Alert
            status={tickers.length ? 'warning' : 'error'}
            borderRadius="2xl"
            flexDirection={{ base: 'column', md: 'row' }}
            alignItems={{ base: 'flex-start', md: 'center' }}
            gap={3}
          >
            <AlertIcon />
            <Box flex="1">
              <AlertTitle>{tickers.length ? 'Live updates paused' : 'Market data unavailable'}</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Box>
            <Button size="sm" variant="outline" onClick={loadMarketSnapshot}>
              Retry
            </Button>
          </Alert>
        ) : null}

        <Box>
          <Input
            placeholder="Search by pair, for example BTCUSDT or ETHUSDT"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            as={motion.input}
            whileFocus={{ scale: 1.01 }}
          />
          {searchQuery ? (
            <Text mt={2} fontSize="sm" color={mutedText}>
              {searchMatches} match{searchMatches === 1 ? '' : 'es'} for “{searchQuery}”.
            </Text>
          ) : null}
        </Box>

        <CryptoPriceTable
          tickers={tickers}
          lastPrices={lastPrices}
          searchQuery={searchQuery}
          visibleCount={searchQuery ? tickers.length : visibleCount}
          isLoading={connectionState === 'loading' && tickers.length === 0}
        />

        {!searchQuery && visibleCount < tickers.length && (
          <Button
            alignSelf="center"
            onClick={handleShowMore}
            colorScheme="blue"
            variant="outline"
            as={motion.button}
            whileHover={{ scale: 1.03 }}
          >
            Show 12 more assets
          </Button>
        )}

        <Box pt={2}>
          <Heading size="md">Quick Converter</Heading>
          <Text mt={2} color={mutedText}>
            Convert between assets using the latest USDT reference price. Results are indicative only.
          </Text>

          <Flex
            mt={5}
            align="center"
            justify="center"
            gap={4}
            direction={isMobile ? 'column' : 'row'}
            flexWrap="wrap"
          >
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              width={{ base: '100%', md: '200px' }}
              as={motion.input}
              whileFocus={{ scale: 1.02 }}
            />
            <Select
              value={fromCurrency}
              onChange={(e) => setFromCurrency(e.target.value)}
              width={{ base: '100%', md: '180px' }}
              title="Select From Currency"
              as={motion.select}
              whileFocus={{ scale: 1.02 }}
            >
              {fromOptions.map(({ asset, symbol }) => (
                <option key={symbol} value={asset}>
                  {asset}
                </option>
              ))}
            </Select>
            <Select
              value={toCurrency}
              onChange={(e) => setToCurrency(e.target.value)}
              width={{ base: '100%', md: '180px' }}
              title="Select To Currency"
              isDisabled={toUSDT}
              as={motion.select}
              whileFocus={{ scale: 1.02 }}
            >
              {assetOptions.map(({ asset, symbol }) => (
                <option key={symbol} value={asset}>
                  {asset}
                </option>
              ))}
            </Select>
            <Button
              onClick={() => setToUSDT((current) => !current)}
              colorScheme="blue"
              variant="outline"
              as={motion.button}
              whileHover={{ scale: 1.03 }}
            >
              {toUSDT ? 'Choose target asset' : 'Convert to USDT'}
            </Button>
            <Button
              onClick={handleConvert}
              colorScheme="blue"
              isDisabled={!canConvert}
              as={motion.button}
              whileHover={{ scale: canConvert ? 1.03 : 1 }}
            >
              Convert
            </Button>
          </Flex>

          {convertedAmount !== null && canConvert ? (
            <Box mt={6} p={4} borderRadius="2xl" bg={cardBg}>
              <Text textAlign="center" fontSize="lg" as={motion.div} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {parsedAmount} {fromCurrency} = {convertedAmount.toFixed(8)}{' '}
                {toUSDT ? (
                  'USDT'
                ) : (
                  <HStack as="span" spacing={2} justify="center" display="inline-flex">
                    {assetOptions.find(({ asset }) => asset === toCurrency)?.icon ? (
                      <Image
                        src={assetOptions.find(({ asset }) => asset === toCurrency)?.icon}
                        alt={toCurrency}
                        boxSize="20px"
                      />
                    ) : null}
                    <Text as="span">{toCurrency}</Text>
                  </HStack>
                )}
              </Text>
            </Box>
          ) : null}
        </Box>
      </Flex>
    </Box>
  )
}

interface CryptoPriceTableProps {
  tickers: TickerData[]
  lastPrices: Map<string, number>
  searchQuery: string
  visibleCount: number
  isLoading: boolean
}

export const CryptoPriceTable: React.FC<CryptoPriceTableProps> = ({
  tickers,
  lastPrices,
  searchQuery,
  visibleCount,
  isLoading,
}) => {
  const filteredTickers = tickers
    .filter(({ symbol }) => symbol.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice(0, visibleCount)

  const rowBg = useColorModeValue('whiteAlpha.700', 'whiteAlpha.50')
  const priceText = useColorModeValue('gray.800', 'gray.100')
  const mutedText = useColorModeValue('gray.600', 'gray.300')
  const emptyBg = useColorModeValue('blackAlpha.50', 'whiteAlpha.100')
  const tableBorderColor = useColorModeValue('blackAlpha.100', 'whiteAlpha.200')

  if (isLoading) {
    return (
      <Box>
        <Skeleton height="44px" borderRadius="xl" />
        <Skeleton mt={3} height="280px" borderRadius="2xl" />
      </Box>
    )
  }

  if (!filteredTickers.length) {
    return (
      <Box p={8} borderRadius="2xl" bg={emptyBg} textAlign="center">
        <Heading size="sm">No matching assets</Heading>
        <Text mt={2} color={mutedText}>
          {searchQuery
            ? `Try a different search term. Nothing matched “${searchQuery}”.`
            : 'No market data is available to display yet.'}
        </Text>
      </Box>
    )
  }

  return (
    <TableContainer borderRadius="2xl" borderWidth="1px" borderColor={tableBorderColor}>
      <Table
        variant="simple"
        colorScheme="gray"
        as={motion.table}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <Thead>
          <Tr>
            <Th>Asset</Th>
            <Th isNumeric>Price (USDT)</Th>
            <Th isNumeric>24h Change</Th>
          </Tr>
        </Thead>
        <Tbody>
          {filteredTickers.map(({ asset, symbol, price, priceChangePercent, icon }) => {
            const lastPrice = lastPrices.get(symbol)
            let color = 'gray.400'
            let arrow = ''

            if (lastPrice !== undefined && priceChangePercent !== null) {
              if (priceChangePercent > 0) {
                color = 'green.500'
                arrow = '↑'
              } else if (priceChangePercent < 0) {
                color = 'red.500'
                arrow = '↓'
              }
            }

            return (
              <Tr key={symbol} as={motion.tr} whileHover={{ scale: 1.01 }} bg={rowBg}>
                <Td>
                  <HStack spacing={3}>
                    {icon ? <Image src={icon} alt={asset} boxSize="24px" borderRadius="full" /> : null}
                    <Box>
                      <Text fontWeight="semibold">{asset}</Text>
                      <Text fontSize="xs" color={mutedText}>
                        {symbol}
                      </Text>
                    </Box>
                  </HStack>
                </Td>
                <Td isNumeric color={priceText}>
                  {formatPrice(price)}
                </Td>
                <Td isNumeric color={color}>
                  {priceChangePercent !== null ? `${priceChangePercent.toFixed(2)}% ${arrow}` : 'N/A'}
                </Td>
              </Tr>
            )
          })}
        </Tbody>
      </Table>
    </TableContainer>
  )
}

export default CryptoPriceTracker
