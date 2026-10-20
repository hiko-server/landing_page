import { useEffect, useMemo, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { formatAge } from '../Chrome/chrome'
import { useChromeUi } from '../Chrome/chromeLang'
import { useFetchJson } from '../Common/useFetchJson'

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

type GithubEvents = { events?: { type?: string; created_at?: string }[] }

/**
 * The header's "● Last commit · 2h ago" (md+, components/Header/Header
 * LiveStatus), in the chrome's language ("最近提交 · 2 小时前"). Loaded on
 * demand: it renders nothing on the server or before the age is known.
 */
export default function LiveStatusPill() {
  const { t } = useChromeUi()
  // Shared with the home activity widgets (concurrent requests are deduped).
  const { data } = useFetchJson<GithubEvents>('/api/github/events')
  const created = useMemo(() => {
    const events = data?.events || []
    return (events.find((e) => e.type === 'PushEvent') || events[0])?.created_at || null
  }, [data])

  // The age is computed on the client only (no server/client mismatch) and
  // recomputed when the page is restored from the back/forward cache.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
  }, [created])
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setNow(Date.now())
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const text = created && now ? formatAge(created, now, t) : null
  if (!text) return null

  return (
    <Flex
      // Hidden at lg (1024–1279): the full nav + admin actions leave no room there.
      display={{ base: 'none', md: 'flex', lg: 'none', xl: 'flex' }}
      alignItems="center"
      gap="6px"
      flexShrink={0}
      whiteSpace="nowrap"
      fontFamily={MONO}
      fontSize="11px"
      color="page.fg-subtle"
      letterSpacing="0.02em"
      className="tnum"
      title={`${t.lastCommit} · ${text}`}
    >
      <Box position="relative" w="6px" h="6px" aria-hidden>
        <Box className="pulse-dot" position="absolute" inset={0} borderRadius="full" />
        <Box w="6px" h="6px" borderRadius="full" bg="var(--live-green)" position="relative" />
      </Box>
      <Text as="span">
        <span className="sr-only">{t.lastCommit} </span>
        {/* Beside the full nav (xl+, fixed-width header) only the age fits. */}
        <Text as="span" aria-hidden display={{ base: 'inline', lg: 'none' }}>
          {t.lastCommit} ·{' '}
        </Text>
        {text}
      </Text>
    </Flex>
  )
}
