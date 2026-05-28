'use client'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Flex,
  Input,
  Modal,
  ModalContent,
  ModalOverlay,
  Text,
  Kbd,
  useColorMode,
  useColorModeValue,
  useToast,
  Spinner,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'

/**
 * v6 ⌘K Command Palette.
 *
 * Triggered globally with Cmd/Ctrl + K. Renders inside a Chakra Modal with
 * a single Input, results grouped into three sections (Pages / Actions /
 * Content), keyboard-navigable, fuzzy-filtered.
 *
 * No external dep (cmdk is fine but Chakra Modal + a small matcher is enough).
 *
 * Dynamic content (recent blog posts + case studies) is fetched once when the
 * palette first opens, then memoised for the rest of the session.
 */

type Item = {
  group: 'Pages' | 'Actions' | 'Writing' | 'Work'
  label: string
  hint?: string
  shortcut?: string
  href?: string
  external?: boolean
  action?: () => void
  keywords?: string
}

type DynamicLists = {
  posts: { slug: string; title: string; permalink: string }[]
  work: { slug: string; title: string; permalink: string }[]
}

const HIKO_EMAIL = 'hi@hiko.dev'

function matches(item: Item, q: string): boolean {
  if (!q) return true
  const hay = `${item.label} ${item.group} ${item.keywords || ''}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((tok) => hay.includes(tok))
}

export default function CommandPalette({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const { colorMode, toggleColorMode } = useColorMode()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [dyn, setDyn] = useState<DynamicLists | null>(null)
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const dynLoaded = useRef(false)

  // Theme tokens
  const bg = useColorModeValue('white', 'gray.900')
  const border = useColorModeValue('rgba(0,0,0,0.10)', 'rgba(255,255,255,0.12)')
  const dim = useColorModeValue('gray.500', 'gray.500')
  const fg = useColorModeValue('gray.800', 'gray.100')
  const activeBg = useColorModeValue('rgba(99,102,241,0.10)', 'rgba(99,102,241,0.18)')

  // Reset state when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setActiveIdx(0)
    }
  }, [isOpen])

  // Fetch dynamic lists once when first opened (then cache for the session)
  useEffect(() => {
    if (!isOpen || dynLoaded.current) return
    setLoading(true)
    Promise.all([
      fetch('/api/blog/list').then((r) => (r.ok ? r.json() : { items: [] })),
      fetch('/api/work/list').then((r) => (r.ok ? r.json() : { items: [] })),
    ])
      .then(([blog, work]) => {
        setDyn({ posts: blog.items || [], work: work.items || [] })
        dynLoaded.current = true
      })
      .catch(() => setDyn({ posts: [], work: [] }))
      .finally(() => setLoading(false))
  }, [isOpen])

  // Compose static + dynamic items
  const items: Item[] = useMemo(() => {
    const list: Item[] = [
      // Pages
      { group: 'Pages', label: 'Home', shortcut: 'G H', href: '/' },
      { group: 'Pages', label: 'About', shortcut: 'G A', href: '/about', keywords: 'bio profile' },
      { group: 'Pages', label: 'Work', shortcut: 'G W', href: '/work', keywords: 'case studies projects' },
      { group: 'Pages', label: 'Writing', shortcut: 'G B', href: '/blog', keywords: 'blog posts essays' },
      { group: 'Pages', label: 'CV', shortcut: 'G C', href: '/cv', keywords: 'resume curriculum' },
      { group: 'Pages', label: 'Now', shortcut: 'G N', href: '/now', keywords: 'status current focus' },
      { group: 'Pages', label: 'Uses', shortcut: 'G U', href: '/uses', keywords: 'tools gear setup' },
      { group: 'Pages', label: 'Contact', href: '/contact', keywords: 'email message' },
      // Actions
      {
        group: 'Actions',
        label: colorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        shortcut: '⌘ T',
        action: toggleColorMode,
        keywords: 'theme toggle appearance',
      },
      {
        group: 'Actions',
        label: 'Copy email address',
        hint: HIKO_EMAIL,
        shortcut: '⌘ E',
        action: async () => {
          try {
            await navigator.clipboard.writeText(HIKO_EMAIL)
            toast({ status: 'success', title: 'Email copied', description: HIKO_EMAIL })
          } catch {
            toast({ status: 'error', title: 'Copy failed' })
          }
        },
        keywords: 'contact mail',
      },
      {
        group: 'Actions',
        label: 'View source on GitHub',
        href: 'https://github.com/HikoPLi/landing_page',
        external: true,
        keywords: 'repo source code',
      },
      {
        group: 'Actions',
        label: 'View RSS feed',
        href: '/api/rss.xml',
        external: true,
        keywords: 'subscribe feed',
      },
      {
        group: 'Actions',
        label: 'Admin login',
        href: '/admin/login',
        keywords: 'sign in dashboard',
      },
    ]

    // Dynamic: blog posts + work case studies
    if (dyn) {
      for (const p of dyn.posts.slice(0, 10)) {
        list.push({
          group: 'Writing',
          label: p.title || p.slug,
          hint: p.slug,
          href: p.permalink,
          keywords: 'post blog',
        })
      }
      for (const w of dyn.work.slice(0, 10)) {
        list.push({
          group: 'Work',
          label: w.title || w.slug,
          hint: w.slug,
          href: w.permalink,
          keywords: 'project case study',
        })
      }
    }
    return list
  }, [dyn, colorMode, toggleColorMode, toast])

  const filtered = useMemo(() => items.filter((i) => matches(i, query)), [items, query])

  // Group filtered items, preserving the group order from `items`
  const grouped = useMemo(() => {
    const order: Item['group'][] = ['Pages', 'Actions', 'Writing', 'Work']
    return order
      .map((g) => [g, filtered.filter((i) => i.group === g)] as const)
      .filter(([, list]) => list.length > 0)
  }, [filtered])

  // Reset cursor when filter changes
  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  // Scroll active row into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const runItem = (it: Item | undefined) => {
    if (!it) return
    onClose()
    // Defer so the modal closes first, then navigate / fire action
    setTimeout(() => {
      if (it.action) it.action()
      else if (it.href) {
        if (it.external) window.open(it.href, '_blank')
        else router.push(it.href)
      }
    }, 60)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runItem(filtered[activeIdx])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      motionPreset="slideInBottom"
      isCentered={false}
      initialFocusRef={undefined}
    >
      <ModalOverlay backdropFilter="blur(12px)" bg="rgba(0,0,0,0.45)" />
      <ModalContent
        bg={bg}
        border="1px solid"
        borderColor={border}
        borderRadius="xl"
        mt={['10vh', '15vh']}
        mx={4}
        boxShadow="0 24px 60px rgba(0,0,0,0.35)"
        overflow="hidden"
      >
        {/* Search input */}
        <Flex
          borderBottom="1px solid"
          borderColor={border}
          px={4}
          h="56px"
          alignItems="center"
          gap={3}
        >
          <Text
            as="span"
            color={dim}
            fontFamily="var(--font-geist-mono), monospace"
            fontSize="13px"
            lineHeight={1}
            transform="translateY(1px)"
          >
            ›
          </Text>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search pages, actions, posts, projects…"
            variant="unstyled"
            fontSize="15px"
            color={fg}
            _placeholder={{ color: dim }}
            autoFocus
            flex={1}
          />
          {loading && <Spinner size="xs" color={dim} />}
          <Kbd
            fontFamily="var(--font-geist-mono), monospace"
            fontSize="10px"
            bg="transparent"
            border="1px solid"
            borderColor={border}
            color={dim}
          >
            ESC
          </Kbd>
        </Flex>

        {/* Results */}
        <Box ref={listRef} maxH="60vh" overflowY="auto" p={2}>
          {grouped.length === 0 ? (
            <Flex
              direction="column"
              align="center"
              justify="center"
              py={10}
              color={dim}
              fontFamily="var(--font-geist-mono), monospace"
              fontSize="12px"
              gap={1}
            >
              <Text>no matches</Text>
              <Text opacity={0.6}>try a different query</Text>
            </Flex>
          ) : (
            grouped.map(([group, list]) => (
              <Box key={group} mb={2}>
                <Text
                  px={3}
                  pt={3}
                  pb={1.5}
                  fontFamily="var(--font-geist-mono), monospace"
                  fontSize="10px"
                  letterSpacing="0.16em"
                  textTransform="uppercase"
                  color={dim}
                >
                  {group}
                </Text>
                {list.map((it) => {
                  const idx = filtered.indexOf(it)
                  const active = idx === activeIdx
                  return (
                    <Flex
                      key={`${it.group}-${it.label}-${it.href ?? ''}`}
                      data-idx={idx}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => runItem(it)}
                      px={3}
                      py={2}
                      borderRadius="md"
                      cursor="pointer"
                      bg={active ? activeBg : 'transparent'}
                      alignItems="center"
                      justifyContent="space-between"
                      gap={3}
                      role="button"
                    >
                      <Flex alignItems="baseline" gap={2} minW={0}>
                        <Text fontSize="14px" color={fg} noOfLines={1}>
                          {it.label}
                        </Text>
                        {it.hint && (
                          <Text
                            fontFamily="var(--font-geist-mono), monospace"
                            fontSize="11px"
                            color={dim}
                            noOfLines={1}
                          >
                            {it.hint}
                          </Text>
                        )}
                      </Flex>
                      {it.shortcut && (
                        <Kbd
                          fontFamily="var(--font-geist-mono), monospace"
                          fontSize="10px"
                          bg="transparent"
                          border="1px solid"
                          borderColor={border}
                          color={dim}
                        >
                          {it.shortcut}
                        </Kbd>
                      )}
                    </Flex>
                  )
                })}
              </Box>
            ))
          )}
        </Box>

        {/* Footer hints */}
        <Flex
          borderTop="1px solid"
          borderColor={border}
          px={3}
          h="36px"
          alignItems="center"
          justifyContent="space-between"
          fontFamily="var(--font-geist-mono), monospace"
          fontSize="10px"
          color={dim}
        >
          <Flex gap={3} alignItems="center">
            <Flex gap={1} alignItems="center">
              <Kbd
                fontSize="10px"
                bg="transparent"
                border="1px solid"
                borderColor={border}
              >
                ↑
              </Kbd>
              <Kbd
                fontSize="10px"
                bg="transparent"
                border="1px solid"
                borderColor={border}
              >
                ↓
              </Kbd>
              <Text>navigate</Text>
            </Flex>
            <Flex gap={1} alignItems="center">
              <Kbd
                fontSize="10px"
                bg="transparent"
                border="1px solid"
                borderColor={border}
              >
                ↵
              </Kbd>
              <Text>open</Text>
            </Flex>
          </Flex>
          <Text>{filtered.length} result{filtered.length === 1 ? '' : 's'}</Text>
        </Flex>
      </ModalContent>
    </Modal>
  )
}
