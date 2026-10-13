import { useEffect, useState } from 'react'
import NextLink from 'next/link'
import { Box, Button, Flex, Kbd, Link, Text, chakra } from '@chakra-ui/react'
import { parseSearchIndex } from '../Article/fuzzyMatch'
import { HIDE_ON_COARSE_POINTER, isApplePlatform, paletteShortcutLabel } from '../Chrome/platform'
import { openCommandPalette } from '../Chrome/paletteEvents'
import { STATIC_CANDIDATES, candidatesFrom, queryFromPath, suggestPages, type Suggestion } from '../../lib/notFoundSuggest'

/**
 * The 404 page's way back: Home, a search field that opens the ⌘K palette
 * already searching for the words of the missing address, and up to four
 * "Did you mean" pages (lib/notFoundSuggest.ts).
 *
 * Everything that depends on the address runs after mount (the 404 page is
 * static): the fixed pages are ranked at once, the posts, case studies and
 * CV entries once /api/search-index answers (same origin, public data; the
 * address is never sent anywhere or logged). The list is the last thing on
 * the page and the page reserves the viewport, so nothing visible moves
 * when it appears. The search field's shortcut hint names the visitor's
 * platform (⌘K / Ctrl K) and is hidden on touch screens.
 */

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

const KIND_LABEL: Record<Suggestion['kind'], string> = { page: 'Page', post: 'Post', work: 'Case study', cv: 'CV' }

export default function NotFoundRecovery() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [apple, setApple] = useState<boolean | null>(null)

  useEffect(() => {
    const path = window.location.pathname
    setQuery(queryFromPath(path))
    setApple(isApplePlatform(navigator as Navigator & { userAgentData?: { platform?: string } }))
    setSuggestions(suggestPages(path, STATIC_CANDIDATES))
    const ctrl = new AbortController()
    fetch('/api/search-index', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body) => setSuggestions(suggestPages(path, candidatesFrom(parseSearchIndex(body).docs))))
      .catch(() => {
        // The fixed pages are still ranked; content suggestions are a bonus.
      })
    return () => ctrl.abort()
  }, [])

  const searchLabel = query ? `Search for “${query}”` : 'Search the site'

  return (
    <>
      <Flex direction={{ base: 'column', sm: 'row' }} align={{ base: 'stretch', sm: 'center' }} gap={3} maxW="640px">
        <Button
          as={NextLink}
          href="/"
          h="44px"
          px={5}
          flexShrink={0}
          bg="accent.solid"
          color="accent.fg"
          fontSize="14px"
          fontWeight={500}
          _hover={{ bg: 'accent.solid-hover' }}
          _active={{ bg: 'accent.solid-active' }}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
        >
          <span aria-hidden>←&nbsp;</span>Home
        </Button>
        <chakra.button
          type="button"
          onClick={() => openCommandPalette(query)}
          aria-haspopup="dialog"
          display="flex"
          alignItems="center"
          gap={3}
          flex={1}
          minW={0}
          h="44px"
          px={3.5}
          border="1px solid"
          borderColor="page.border-strong"
          borderRadius="md"
          bg="page.surface"
          color="page.fg-secondary"
          fontSize="14px"
          textAlign="left"
          transition="border-color 150ms, color 150ms"
          _hover={{ borderColor: 'page.fg-secondary', color: 'page.fg' }}
          _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '3px' }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </g>
          </svg>
          <Text as="span" flex={1} minW={0} noOfLines={1}>
            {searchLabel}
          </Text>
          {/* Fixed slot: the platform is known only after mount, so the hint never shifts the label. */}
          <Box as="span" minW="44px" textAlign="right" sx={HIDE_ON_COARSE_POINTER} aria-hidden>
            {apple !== null && (
              <Kbd fontFamily={MONO} fontSize="10px" bg="transparent" border="1px solid" borderColor="page.border" color="page.fg-subtle">
                {paletteShortcutLabel(apple)}
              </Kbd>
            )}
          </Box>
        </chakra.button>
      </Flex>

      {suggestions && suggestions.length > 0 && (
        <Box as="section" aria-labelledby="not-found-suggestions" mt={{ base: 12, md: 16 }} maxW="720px">
          <Text
            as="h2"
            id="not-found-suggestions"
            className="section-label-rule"
            fontFamily={MONO}
            fontSize="11px"
            fontWeight={500}
            letterSpacing="0.12em"
            textTransform="uppercase"
            color="page.fg-subtle"
            mb={3}
          >
            Did you mean
          </Text>
          <Box as="ul" className="hover-list" listStyleType="none" m={0} p={0} borderTop="1px solid" borderColor="page.border">
            {suggestions.map((s) => (
              <Box as="li" key={s.href} className="hover-item" borderBottom="1px solid" borderColor="page.border">
                <Link
                  as={NextLink}
                  href={s.href}
                  data-group=""
                  display="flex"
                  alignItems="baseline"
                  justifyContent="space-between"
                  gap={4}
                  minH="56px"
                  py={4}
                  _hover={{ textDecoration: 'none' }}
                  _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
                >
                  <Box minW={0}>
                    <Text as="span" display="block" fontSize="16px" fontWeight={500} color="page.fg" lang={s.lang} noOfLines={2}>
                      {s.title}
                    </Text>
                    <Text as="span" display="block" fontFamily={MONO} fontSize="12px" color="page.fg-secondary" mt={0.5} noOfLines={1}>
                      {s.href}
                    </Text>
                  </Box>
                  <Flex as="span" align="center" gap={2} flexShrink={0} fontFamily={MONO} fontSize="10px" letterSpacing="0.1em" textTransform="uppercase" color="page.fg-secondary">
                    {KIND_LABEL[s.kind]}
                    <span aria-hidden className="nudge">
                      →
                    </span>
                  </Flex>
                </Link>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </>
  )
}
