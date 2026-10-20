import React, { useId } from 'react'
import NextLink from 'next/link'
import { Badge, Box, Button, Flex, HStack, Link, SimpleGrid, Text } from '@chakra-ui/react'
import { ExternalLinkIcon } from '@chakra-ui/icons'
import { MONO, Eyebrow, Panel } from '../shell/ui'
import { formatBucket, formatCount, formatVital, ratingLabel } from '../../../lib/analytics/format'
import { formatRate } from '../../../lib/analytics/goalsFormat'
import type { PageDetail } from '../../../lib/analytics/explore'
import type { Kpi, VitalP75, VitalRating } from '../../../lib/analytics/shared'

/**
 * One page, measured (H10): shown when the view is filtered to a single
 * page — what readers did there (read to the end, e-mail and outbound
 * clicks, CV prints) next to its visitors and its real-user Web Vitals.
 * Everything over the same window and filters as the rest of the view.
 */

const KIND_LABEL: Record<PageDetail['kind'], string> = { post: 'Post', 'case-study': 'Case study', page: 'Page' }

const RATING_COLOR: Record<VitalRating, { light: string; dark: string }> = {
  good: { light: 'green.700', dark: 'green.300' },
  'needs-improvement': { light: 'orange.700', dark: 'orange.300' },
  poor: { light: 'red.600', dark: 'red.300' },
}

function Stat({ label, value, sub, testId }: { label: string; value: string; sub?: React.ReactNode; testId?: string }) {
  return (
    <Box minW={0} data-testid={testId}>
      <Eyebrow>{label}</Eyebrow>
      <Text className="tnum" fontSize="xl" fontWeight={600} letterSpacing="-0.02em" mt={1}>
        {value}
      </Text>
      {sub ? (
        <Text fontSize="xs" color="page.fg-secondary" mt={0.5} className="tnum">
          {sub}
        </Text>
      ) : null}
    </Box>
  )
}

export default function PageDetailCard({
  page,
  visitors,
  vitals,
  windowLabel,
}: {
  page: PageDetail
  /** The page's visitors in the window (the view's KPI). */
  visitors: Kpi
  /** The 28-day Web Vitals of this page (already scoped to it). */
  vitals: VitalP75[]
  /** "Sep 22 – Oct 21" */
  windowLabel: string
}) {
  const headingId = useId()
  const core = vitals.filter((v) => v.name === 'LCP' || v.name === 'INP' || v.name === 'CLS')
  return (
    <Panel as="section" aria-labelledby={headingId} mb={4} data-page-detail="">
      <Flex justify="space-between" align="flex-start" gap={3} flexWrap="wrap" mb={4}>
        <Box minW={0} flex="1 1 280px">
          <HStack spacing={2} mb={1}>
            <Badge variant="subtle" colorScheme="purple" fontSize="10px">
              {KIND_LABEL[page.kind]}
            </Badge>
            {page.publishedOn ? (
              <Text fontSize="xs" color="page.fg-secondary">
                Published {formatBucket(page.publishedOn)}, {page.publishedOn.slice(0, 4)}
              </Text>
            ) : null}
          </HStack>
          <Text as="h3" id={headingId} fontSize="md" fontWeight={600} letterSpacing="-0.01em" overflowWrap="anywhere">
            {page.title ?? page.path}
          </Text>
          <Text fontFamily={MONO} fontSize="xs" color="page.fg-secondary" overflowWrap="anywhere">
            {page.path}
          </Text>
        </Box>
        <HStack spacing={2} flexShrink={0}>
          <Button as="a" href={page.path} target="_blank" rel="noopener" size="sm" variant="ghost" rightIcon={<ExternalLinkIcon aria-hidden />} color="page.fg-secondary">
            View page
          </Button>
          {page.editHref ? (
            <Button as={NextLink} href={page.editHref} size="sm" variant="outline" borderColor="page.border-strong">
              Edit
            </Button>
          ) : null}
        </HStack>
      </Flex>

      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={{ base: 4, md: 6 }}>
        {page.readThrough ? (
          <Stat
            label="Read to the end"
            value={formatCount(page.readThrough.visitors)}
            sub={`${formatRate(page.readThrough.rate)} of its visitors`}
            testId="page-read-through"
          />
        ) : page.cvPrints ? (
          <Stat label="Printed" value={formatCount(page.cvPrints.visitors)} sub={`${formatRate(visitors.value ? page.cvPrints.visitors / visitors.value : null)} of its visitors`} />
        ) : null}
        <Stat label="E-mail link clicks" value={formatCount(page.emailClicks.visitors)} sub={`${formatCount(page.emailClicks.events)} click${page.emailClicks.events === 1 ? '' : 's'}`} />
        <Box gridColumn={{ base: 'span 2', md: page.readThrough || page.cvPrints ? 'span 1' : 'span 2' }} minW={0} data-testid="page-outbound">
          <Eyebrow>Outbound clicks</Eyebrow>
          <Text className="tnum" fontSize="xl" fontWeight={600} letterSpacing="-0.02em" mt={1}>
            {formatCount(page.outbound.visitors)}
          </Text>
          {page.outbound.hosts.length ? (
            <Box as="ul" listStyleType="none" m={0} p={0} mt={1}>
              {page.outbound.hosts.map((h) => (
                <Flex as="li" key={h.key} justify="space-between" gap={3} fontSize="xs" py={0.5}>
                  <Text fontFamily={MONO} overflowWrap="anywhere">
                    {h.key}
                  </Text>
                  <Text color="page.fg-secondary" className="tnum" flexShrink={0}>
                    {formatCount(h.visitors)}
                  </Text>
                </Flex>
              ))}
            </Box>
          ) : (
            <Text fontSize="xs" color="page.fg-secondary" mt={0.5}>
              None from this page
            </Text>
          )}
        </Box>
        <Box gridColumn={{ base: 'span 2', md: 'span 1' }} minW={0}>
          <Eyebrow>Web Vitals · p75, 28 days</Eyebrow>
          {core.length ? (
            <HStack spacing={4} mt={1.5} flexWrap="wrap" rowGap={1}>
              {core.map((v) => {
                const c = RATING_COLOR[v.rating]
                return (
                  <Box key={v.name} title={`${v.samples} sample${v.samples === 1 ? '' : 's'}`}>
                    <Text fontSize="xs" color="page.fg-secondary">
                      {v.name}
                    </Text>
                    <Text className="tnum" fontWeight={600} fontSize="md">
                      {formatVital(v.name, v.p75)}
                    </Text>
                    <Text fontSize="11px" color={c.light} _dark={{ color: c.dark }}>
                      {ratingLabel(v.rating)}
                    </Text>
                  </Box>
                )
              })}
            </HStack>
          ) : (
            <Text fontSize="xs" color="page.fg-secondary" mt={1}>
              No measurements of this page in the last 28 days.
            </Text>
          )}
        </Box>
      </SimpleGrid>
      <Text fontSize="xs" color="page.fg-secondary" mt={4} maxW="72ch">
        {windowLabel}. Its visitors and views are in the chart below. Read to the end and e-mail clicks are counted on this page; an outbound click
        counts here when this was the page viewed last before it that day (a click stores only the site it went to).{' '}
        <Link href="#vitals" color="accent.text">
          All Web Vitals
        </Link>
      </Text>
    </Panel>
  )
}
