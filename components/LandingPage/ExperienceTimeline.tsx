import React, { useId, useMemo, useState } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import NextLink from 'next/link'
import { m, useReducedMotion } from 'framer-motion'

import Collapse from '../General-UI/Collapse'
import { useScrollReveal } from '../General-UI/useScrollReveal'
import { bullets, entryRange, field, list } from '../CVViewerPage/fields'
import type { CvSectionLike } from '../../lib/cvVisibility'
import { revealVariant } from '../../lib/reveal'
import { labelLang } from '../../lib/toc'
import { ChevronRightIcon } from '../Icons/ui/content'
import { chipList, matchCaseStudy, type WorkIndexItem } from './projectMatch'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

type Highlight = { text: string; sub: string[] }

type Row = {
  key: string
  title: string
  company: string
  period: string
  location: string
  summary: string
  highlights: Highlight[]
  skills: string[]
  study: WorkIndexItem | null
}

const RAIL_LEFT = { base: '10px', md: '12px' }

/**
 * Experience — a career rail built from the public (website-pruned) CV.
 *
 * - Unboxed rows with hairline separators: mono dates (a sticky left column
 *   at lg), the role line, then the summary as plain text.
 * - A role with public highlights gets a "Highlights (n)" disclosure that
 *   opens its bullets and related skills (shared <Collapse>); open by
 *   default with `defaultExpanded` (/about).
 * - A role whose company matches a /work case study links to it.
 * - The accent rail fills as the timeline scrolls through the viewport and
 *   each dot lights as its row enters (CSS scroll-driven animations,
 *   styles/globals.css: `.rail-fill` on the `--xp` view timeline, `.rail-dot`);
 *   without support, or with reduced motion, the rail is simply full.
 * - Rows fade in with the section's single stagger when the list scrolls up
 *   from below the fold (already on screen: static from the first frame,
 *   lib/reveal.ts); hovering a row dims the others (`.hover-list`).
 */
export default function ExperienceTimeline({
  cvEn,
  work,
  defaultExpanded = false,
}: {
  cvEn?: CvSectionLike[]
  /** /work case-study index, for "Case study →" links. */
  work?: WorkIndexItem[]
  /** Open every role's highlights initially (/about). */
  defaultExpanded?: boolean
}) {
  const reduce = useReducedMotion()
  const reveal = useScrollReveal<HTMLOListElement>()

  const rows: Row[] = useMemo(() => {
    const section = Array.isArray(cvEn) ? cvEn.find((s) => s?.sessionName === 'workExperience') : undefined
    return list(section, 'experiences')
      .map((e: any, i: number): Row => {
        const title = field(e, 'jobTitle')
        const company = field(e, 'companyName')
        return {
          key: `${i}-${company}-${title}`,
          title,
          company,
          period: entryRange(e, 'en'),
          location: field(e, 'location'),
          summary: field(e, 'jobDescription'),
          highlights: list(e, 'features')
            .map((f: any) => ({ text: field(f, 'description'), sub: bullets(f, 'furtherExplanation') }))
            .filter((h: Highlight) => h.text),
          skills: chipList(bullets(e, 'relatedSkills'), 12),
          study: matchCaseStudy({ title: company }, work) || matchCaseStudy({ title }, work),
        }
      })
      .filter((r) => r.title || r.company)
      .slice(0, 6)
  }, [cvEn, work])

  if (!rows.length) return null

  const row = { hidden: { opacity: 0 }, show: { opacity: 1, transition: reduce ? { duration: 0 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] } } }
  const stagger = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.06 } } }

  return (
    <Box w="100%" maxW="1100px" mx="auto" position="relative" pl={{ base: 6, md: 8 }} style={{ viewTimelineName: '--xp' } as React.CSSProperties}>
      {/* Rail: the hairline, and the accent fill drawn over it as the timeline scrolls by. */}
      <Box as="span" aria-hidden position="absolute" left={RAIL_LEFT} top="6px" bottom="6px" w="1px" bg="page.border" />
      <Box
        as="span"
        aria-hidden
        className="rail-fill"
        position="absolute"
        left={RAIL_LEFT}
        top="6px"
        bottom="6px"
        w="1px"
        bg="var(--accent)"
        transformOrigin="top"
      />

      <m.ol
        ref={reveal.ref}
        data-reveal-list=""
        className="hover-list"
        initial={false}
        animate={revealVariant(reveal.phase)}
        variants={stagger}
        style={{ listStyle: 'none', margin: 0, padding: 0 }}
      >
        {rows.map((r, idx) => (
          <m.li key={r.key} variants={row} data-reveal-item="" style={{ position: 'relative' }}>
            <TimelineRow row={r} first={idx === 0} defaultExpanded={defaultExpanded} />
          </m.li>
        ))}
      </m.ol>
    </Box>
  )
}

function TimelineRow({ row: r, first, defaultExpanded }: { row: Row; first: boolean; defaultExpanded: boolean }) {
  const [open, setOpen] = useState(defaultExpanded)
  const panelId = useId()
  const hasDetails = r.highlights.length > 0 || r.skills.length > 0

  return (
    <Box
      className="hover-item"
      display={{ base: 'block', lg: 'grid' }}
      gridTemplateColumns={{ lg: '152px minmax(0, 1fr)' }}
      columnGap={8}
      pt={first ? 0 : 7}
      pb={7}
      borderTop={first ? undefined : '1px solid'}
      borderColor="page.border"
    >
      {/* Milestone dot, ringed in the page colour so it cuts the rail cleanly */}
      <Box
        as="span"
        aria-hidden
        className="rail-dot"
        position="absolute"
        left={{ base: '-17.5px', md: '-23.5px' }}
        top={first ? '6px' : '34px'}
        w="8px"
        h="8px"
        borderRadius="full"
        bg="var(--accent)"
        boxShadow="0 0 0 4px var(--chakra-colors-page-bg)"
        zIndex={1}
      />

      <Box>
        {r.period && (
          <Text
            fontFamily={monoFont}
            fontSize="11px"
            color="page.fg-secondary"
            letterSpacing="0.04em"
            mb={{ base: 1.5, lg: 0 }}
            className="tnum"
            position={{ lg: 'sticky' }}
            top={{ lg: '96px' }}
            pt={{ lg: '3px' }}
          >
            {r.period}
          </Text>
        )}
      </Box>

      <Box minW={0}>
        <Text as="h3" fontWeight={500} fontSize="16px" color="page.fg" letterSpacing="-0.005em" lineHeight="1.4">
          <span lang={labelLang(r.title || r.company)}>{r.title || r.company}</span>
          {r.title && r.company && (
            <>
              <Text as="span" aria-hidden color="page.fg-secondary" mx={2}>
                ·
              </Text>
              <span className="sr-only">, </span>
              <Text as="span" color="page.fg-secondary" fontWeight={400} lang={labelLang(r.company)}>
                {r.company}
              </Text>
            </>
          )}
        </Text>

        {r.location && (
          <Text mt={1} fontFamily={monoFont} fontSize="11px" color="page.fg-secondary" letterSpacing="0.04em" lang={labelLang(r.location)}>
            {r.location}
          </Text>
        )}

        {r.summary && (
          <Text mt={2.5} fontSize="15px" color="page.fg-secondary" lineHeight="1.65" maxW="68ch" lang={labelLang(r.summary)}>
            {r.summary}
          </Text>
        )}

        {(hasDetails || r.study) && (
          <Flex mt={3} gap={5} align="center" wrap="wrap" fontFamily={monoFont} fontSize="12px" letterSpacing="0.04em">
            {hasDetails && (
              <Box
                as="button"
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((v) => !v)}
                display="inline-flex"
                alignItems="center"
                gap={1.5}
                minH="24px"
                py={1}
                color="page.fg-secondary"
                borderRadius="sm"
                _hover={{ color: 'page.fg' }}
                _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
              >
                <Box
                  as="span"
                  aria-hidden
                  display="inline-flex"
                  transform={open ? 'rotate(90deg)' : 'none'}
                  transition="transform var(--duration-fast) var(--ease-standard)"
                >
                  <ChevronRightIcon size="xs" />
                </Box>
                {r.highlights.length > 0 ? `Highlights (${r.highlights.length})` : `Skills (${r.skills.length})`}
                <span className="sr-only"> — {r.title || r.company}</span>
              </Box>
            )}
            {r.study && (
              <Box
                as={NextLink}
                href={`/work/${r.study.slug}`}
                display="inline-flex"
                alignItems="center"
                gap={1.5}
                minH="24px"
                color="accent.text"
                borderRadius="sm"
                _hover={{ textDecoration: 'underline', textUnderlineOffset: '3px' }}
                _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
              >
                Case study <span className="nudge" aria-hidden>→</span>
                <span className="sr-only">: {r.study.title}</span>
              </Box>
            )}
          </Flex>
        )}

        {hasDetails && (
          <Collapse open={open} id={panelId}>
            <Box pt={3}>
              {r.highlights.length > 0 && (
                <Box as="ul" listStyleType="none" m={0} p={0}>
                  {r.highlights.map((h, i) => (
                    <Box as="li" key={i} pl={3} mb={2.5} borderLeft="2px solid" borderColor="var(--accent)" fontSize="14px" lineHeight="1.6" color="page.fg-secondary">
                      <span lang={labelLang(h.text)}>{h.text}</span>
                      {h.sub.length > 0 && (
                        <Box as="ul" listStyleType="disc" pl={5} mt={1}>
                          {h.sub.map((s, j) => (
                            <li key={j} lang={labelLang(s)}>
                              {s}
                            </li>
                          ))}
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
              {r.skills.length > 0 && (
                <Flex as="ul" listStyleType="none" wrap="wrap" gap={1.5} mt={r.highlights.length ? 3 : 0} aria-label="Related skills">
                  {r.skills.map((s) => (
                    <Text
                      as="li"
                      key={s}
                      px={2}
                      py="2px"
                      fontFamily={monoFont}
                      fontSize="10px"
                      letterSpacing="0.04em"
                      color="page.fg-secondary"
                      border="1px solid"
                      borderColor="page.border"
                      borderRadius="4px"
                      lang={labelLang(s)}
                    >
                      {s}
                    </Text>
                  ))}
                </Flex>
              )}
            </Box>
          </Collapse>
        )}
      </Box>
    </Box>
  )
}
