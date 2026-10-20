import React, { useId } from 'react'
import { Box, Flex, FormControl, FormLabel, Select, Text, VisuallyHidden } from '@chakra-ui/react'
import { Panel, MONO, inputProps } from '../shell/ui'
import { formatCount } from '../../../lib/analytics/format'
import { barWidth, formatRate, formatSpan, shareOf } from '../../../lib/analytics/goalsFormat'
import { GOAL_LABEL, NO_REFERRER, PATH_GOALS, type ConversionPaths, type GoalName } from '../../../lib/analytics/eventsShared'
import { EmptyNote, SectionHead } from './ui'

/**
 * Paths to a goal (H10, lib/analytics/goalsQuery conversionPaths): for the
 * visitor-days that reached the chosen goal, where they came from and the
 * pages they opened up to it — the most common sequences, in visitor-days.
 * Raw window only (35 days), like the conversion beside it.
 */

function Step({ children, tone = 'page', title }: { children: React.ReactNode; tone?: 'source' | 'none' | 'page' | 'goal' | 'gap'; title?: string }) {
  const styles = {
    source: { bg: 'page.bg', borderColor: 'page.border-strong', color: 'page.fg', fontFamily: MONO },
    none: { bg: 'page.bg', borderColor: 'page.border-strong', color: 'page.fg-secondary', fontFamily: undefined },
    page: { bg: 'page.bg-elevated', borderColor: 'page.border', color: 'page.fg', fontFamily: MONO },
    goal: { bg: 'var(--accent-soft)', borderColor: 'accent.500', color: 'page.fg', fontFamily: undefined },
    gap: { bg: 'transparent', borderColor: 'transparent', color: 'page.fg-secondary', fontFamily: undefined },
  }[tone]
  return (
    <Box as="li" display="inline-flex" alignItems="center" minW={0} maxW="100%">
      <Box
        as="span"
        px={1.5}
        py={0.5}
        border="1px solid"
        borderRadius="md"
        fontSize="11px"
        lineHeight="18px"
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
        maxW="16rem"
        title={title}
        {...styles}
      >
        {children}
      </Box>
    </Box>
  )
}

/** A goal as the last step of a path (singular, what the visitor did). */
const GOAL_STEP: Record<GoalName, string> = {
  cv_download: 'Downloaded the CV',
  cv_print: 'Printed the CV',
  vcard_save: 'Saved the vCard',
  contact_sent: 'Sent a message',
  email_click: 'Clicked an e-mail link',
  outbound_click: 'Left for another site',
  read_through: 'Read to the end',
  search_empty: 'Searched, found nothing',
}

const Arrow = () => (
  <Box as="li" aria-hidden color="page.fg-secondary" fontSize="11px" px={0.5} listStyleType="none">
    →
  </Box>
)

export default function PathsCard({ paths, onGoal, busy }: { paths: ConversionPaths; onGoal: (goal: GoalName) => void; busy: boolean }) {
  const headingId = useId()
  const selectId = useId()
  const max = paths.paths.reduce((m, p) => Math.max(m, p.visitors), 0)
  return (
    <Panel as="section" aria-labelledby={headingId} minW={0} data-paths="">
      <SectionHead
        id={headingId}
        title="Paths to a goal"
        aside={
          <FormControl w={{ base: '100%', sm: 'auto' }} minW={{ sm: '190px' }}>
            <FormLabel htmlFor={selectId} fontSize="xs" color="page.fg-secondary" mb={1}>
              Goal
            </FormLabel>
            <Select id={selectId} size="sm" {...inputProps} value={paths.goal} onChange={(e) => onGoal(e.target.value as GoalName)}>
              {PATH_GOALS.map((g) => (
                <option key={g} value={g}>
                  {GOAL_LABEL[g]}
                </option>
              ))}
            </Select>
          </FormControl>
        }
      >
        Where the visitor-days that reached the goal came from and the pages they opened before it, in order (repeats merged; a long path keeps its first and
        last two pages). {formatSpan(paths.from, paths.to)}.
      </SectionHead>

      {paths.total === 0 ? (
        <EmptyNote>
          Nobody reached &ldquo;{GOAL_LABEL[paths.goal]}&rdquo; in the last {paths.days} day{paths.days === 1 ? '' : 's'}.
        </EmptyNote>
      ) : (
        <Box as="ol" listStyleType="none" m={0} p={0} aria-busy={busy}>
          {paths.paths.map((p, i) => {
            const label = `${p.source === NO_REFERRER ? 'No referrer' : `From ${p.source}`}, then ${p.pages.join(', ')}, then ${GOAL_STEP[paths.goal].toLowerCase()}: ${p.visitors} visitor-day${p.visitors === 1 ? '' : 's'}`
            return (
              <Box as="li" key={`${p.source}|${p.pages.join('|')}`} py={2.5} borderTop={i ? '1px solid' : 'none'} borderColor="page.border">
                <Flex justify="space-between" align="flex-start" gap={3}>
                  <VisuallyHidden>{label}</VisuallyHidden>
                  <Box as="ol" aria-hidden display="flex" flexWrap="wrap" alignItems="center" gap={1} m={0} p={0} listStyleType="none" minW={0}>
                    <Step tone={p.source === NO_REFERRER ? 'none' : 'source'} title={p.source === NO_REFERRER ? 'No referrer: typed, bookmarked, or an app that sends none' : p.source}>
                      {p.source === NO_REFERRER ? 'No referrer' : p.source}
                    </Step>
                    {p.pages.map((page, j) => (
                      <React.Fragment key={`${j}-${page}`}>
                        <Arrow />
                        <Step tone={page === '…' ? 'gap' : 'page'} title={page === '…' ? 'More pages' : page}>
                          {page}
                        </Step>
                      </React.Fragment>
                    ))}
                    <Arrow />
                    <Step tone="goal">{GOAL_STEP[paths.goal]}</Step>
                  </Box>
                  <Text fontSize="sm" fontWeight={600} className="tnum" flexShrink={0} aria-hidden>
                    {formatCount(p.visitors)}
                  </Text>
                </Flex>
                <Flex align="center" gap={2} mt={1.5} aria-hidden>
                  <Box flex="1" h="4px" borderRadius="full" bg="page.bg-elevated" overflow="hidden">
                    <Box h="100%" w={`${barWidth(p.visitors, max)}%`} bg="var(--accent)" borderRadius="full" sx={{ '@media (forced-colors: active)': { bg: 'CanvasText' } }} />
                  </Box>
                  <Text fontSize="11px" color="page.fg-secondary" className="tnum" w="3.5rem" textAlign="right">
                    {formatRate(shareOf(p.visitors, paths.total))}
                  </Text>
                </Flex>
              </Box>
            )
          })}
        </Box>
      )}
      {paths.other > 0 || paths.noPageView > 0 ? (
        <Text fontSize="xs" color="page.fg-secondary" mt={3} pt={3} borderTop="1px solid" borderColor="page.border">
          {paths.other > 0 ? `${formatCount(paths.other)} visitor-day${paths.other === 1 ? '' : 's'} on other, rarer paths. ` : ''}
          {paths.noPageView > 0
            ? `${formatCount(paths.noPageView)} reached it without viewing a page first that day — a direct link, e.g. to a CV file from a profile or an e-mail.`
            : ''}
        </Text>
      ) : null}
    </Panel>
  )
}
