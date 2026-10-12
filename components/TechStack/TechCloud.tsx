import React from 'react'
import { Box, Flex, Skeleton, Text } from '@chakra-ui/react'
import { motion, useReducedMotion } from 'framer-motion'

import { useFetchJson } from '../Common/useFetchJson'
import WidgetNotice from '../Common/WidgetNotice'

type Item = { name: string; version?: string }
type Group = { label: string; items: Item[] }

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'
const MotionSpan = motion(Box)

/**
 * The site's own stack, grouped (Framework / Interface / Content / Data /
 * Platform / Infrastructure). Data comes from /api/stack, which derives it
 * from package.json so it never goes stale.
 *
 * Small labels and versions use page.fg-secondary (≥ 7:1 on both themes);
 * the loading skeleton has the same row rhythm as the loaded list.
 */
export default function TechCloud() {
  const reduce = useReducedMotion()
  const { data, error, retry } = useFetchJson<{ groups?: Group[] }>('/api/stack')
  const groups = data ? (Array.isArray(data.groups) ? data.groups.filter((g) => g?.items?.length) : []) : null

  if (error) {
    return (
      <WidgetNotice kind="error" onRetry={retry}>
        The stack list couldn’t be loaded.
      </WidgetNotice>
    )
  }

  if (!groups) {
    return (
      <Box w="100%" maxW="1100px" mx="auto" aria-busy="true" aria-label="Loading tech stack">
        {Array.from({ length: 5 }, (_, i) => (
          <Flex key={i} direction={{ base: 'column', sm: 'row' }} gap={{ base: 2, sm: 6 }} py={3} borderTop={i ? '1px solid' : undefined} borderColor="page.border">
            <Skeleton h="12px" w="96px" mt={{ sm: 2 }} borderRadius="sm" startColor="page.bg-elevated" endColor="page.bg-overlay" />
            <Flex wrap="wrap" gap={2} flex="1">
              {Array.from({ length: 3 + (i % 2) }, (_, j) => (
                <Skeleton key={j} h="28px" w={`${72 + ((i + j) % 3) * 24}px`} borderRadius="md" startColor="page.bg-elevated" endColor="page.bg-overlay" />
              ))}
            </Flex>
          </Flex>
        ))}
      </Box>
    )
  }

  if (!groups.length) {
    return <WidgetNotice kind="empty">No stack entries to show.</WidgetNotice>
  }

  return (
    <Box as="dl" w="100%" maxW="1100px" mx="auto">
      {groups.map((g, gi) => (
        <Flex
          key={g.label}
          direction={{ base: 'column', sm: 'row' }}
          align={{ base: 'flex-start', sm: 'baseline' }}
          gap={{ base: 2, sm: 6 }}
          py={3}
          borderTop={gi === 0 ? undefined : '1px solid'}
          borderColor="page.border"
        >
          <Text
            as="dt"
            fontFamily={monoFont}
            fontSize="11px"
            letterSpacing="0.14em"
            textTransform="uppercase"
            color="page.fg-secondary"
            w={{ sm: '120px' }}
            flexShrink={0}
          >
            {g.label}
          </Text>
          <Flex as="dd" wrap="wrap" gap={2} m={0}>
            {g.items.map((it, i) => (
              <MotionSpan
                as="span"
                key={it.name}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.3, delay: gi * 0.04 + i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                display="inline-flex"
                alignItems="baseline"
                gap={1.5}
                px={2.5}
                py={1}
                border="1px solid"
                borderColor="page.border"
                borderRadius="md"
                fontSize="13px"
                color="page.fg"
                _hover={{ borderColor: 'page.border-strong' }}
                sx={{ transitionProperty: 'border-color', transitionDuration: '160ms' }}
              >
                {it.name}
                {it.version ? (
                  <Text as="span" fontFamily={monoFont} fontSize="10px" color="page.fg-secondary">
                    {it.version}
                  </Text>
                ) : null}
              </MotionSpan>
            ))}
          </Flex>
        </Flex>
      ))}
    </Box>
  )
}
