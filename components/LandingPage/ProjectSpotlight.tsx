import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Box, Flex, IconButton, Text } from '@chakra-ui/react'
import NextLink from 'next/link'
import { ArrowLeftIcon, ArrowRightIcon } from '../Icons/ui/content'

import Collapse from '../General-UI/Collapse'
import { useSpotlight } from '../General-UI/useSpotlight'
import { fillUi } from '../../lib/uiStrings'
import { entryRange, field, list } from '../CVViewerPage/fields'
import type { CvSectionLike } from '../../lib/cvVisibility'
import { useReferenceMonth } from '../../lib/clock'
import { chipList, matchCaseStudy, type WorkIndexItem } from './projectMatch'
import { useHomeUi, useOwnLang } from './homeUi'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

type Card = {
  key: string
  title: string
  description: string
  period: string
  location: string
  features: string[]
  study: WorkIndexItem | null
  tech: string[]
}


/**
 * Selected projects — horizontal, snap-scrolling cards built from the
 * public CV's project section.
 *
 *   - A project that has a /work case study (the owner's `caseStudy` slug,
 *     else a strict title match) links to it ("Read case study →"), shows
 *     that study's tech as chips, and its title morphs into the case-study
 *     page's (data-vt-morph, lib/viewTransition.ts).
 *   - The whole card is the hit area of its primary action (a stretched
 *     link: the case study, else the "More" disclosure); other controls sit
 *     above it. Cards have cursor-lit borders (useSpotlight + `.spotlight`).
 *   - The scroller is a focusable, labelled region (arrow keys / shift+wheel /
 *     swipe) with prev / next buttons ≥ md and a visible focus ring.
 *   - "More" is a real disclosure: the highlights are always in the DOM,
 *     inside a <Collapse>, and the button always names its panel.
 */
export default function ProjectSpotlight({ cvEn, work }: { cvEn?: CvSectionLike[]; work?: WorkIndexItem[] }) {
  const { t, cvLang } = useHomeUi()
  const month = useReferenceMonth()
  const cards: Card[] = useMemo(() => {
    const section = Array.isArray(cvEn) ? cvEn.find((s) => s?.sessionName === 'project') : undefined
    return list(section, 'projectExperience')
      .map((p: any, i: number): Card | null => {
        const title = field(p, 'title')
        const description = field(p, 'description')
        if (!title && !description) return null
        const study = matchCaseStudy({ title, caseStudy: field(p, 'caseStudy') }, work)
        return {
          key: `${i}-${title}`,
          title: title || description,
          description: title ? description : '',
          period: entryRange(p, cvLang, { futureEndAsPresent: true, now: month }),
          location: field(p, 'projectLocation'),
          features: list(p, 'features')
            .map((f: any) => field(f, 'description'))
            .filter(Boolean),
          study,
          tech: chipList(study?.tech),
        }
      })
      .filter((c): c is Card => c !== null)
      .slice(0, 6)
  }, [cvEn, work, month, cvLang])

  const scrollerRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })
  useSpotlight(scrollerRef)

  const syncEdges = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const start = el.scrollLeft <= 4
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])

  useEffect(() => {
    syncEdges()
    window.addEventListener('resize', syncEdges)
    return () => window.removeEventListener('resize', syncEdges)
  }, [syncEdges, cards.length])

  const page = (dir: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('[data-card]')
    const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.8
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: dir * step, behavior: reduce ? 'auto' : 'smooth' })
  }

  if (!cards.length) return null
  const showAll = Array.isArray(work) && work.length > 0

  return (
    <Box w="100%" maxW="1100px">
      <Flex justify="space-between" align="center" mb={4} gap={4}>
        <Text fontFamily={monoFont} fontSize="11px" letterSpacing="0.04em" color="page.fg-secondary">
          {fillUi(cards.length === 1 ? t.projects.countOne : t.projects.countMany, { n: cards.length })}
        </Text>
        <Flex gap={2} display={{ base: 'none', md: 'flex' }}>
          <IconButton
            aria-label={t.projects.scrollLeft}
            icon={<ArrowLeftIcon size="sm" />}
            size="sm"
            variant="outline"
            borderColor="page.border-strong"
            color="page.fg"
            isDisabled={edges.start}
            onClick={() => page(-1)}
            _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
          />
          <IconButton
            aria-label={t.projects.scrollRight}
            icon={<ArrowRightIcon size="sm" />}
            size="sm"
            variant="outline"
            borderColor="page.border-strong"
            color="page.fg"
            isDisabled={edges.end}
            onClick={() => page(1)}
            _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
          />
        </Flex>
      </Flex>

      <Box
        ref={scrollerRef}
        role="region"
        aria-label={t.projects.region}
        tabIndex={0}
        onScroll={syncEdges}
        // Containing block for anything absolutely positioned inside, so it
        // stays within the scroll clip instead of widening the page.
        position="relative"
        overflowX="auto"
        overflowY="hidden"
        // Room for card focus rings, which overflow clipping would otherwise cut.
        p="3px"
        m="-3px"
        borderRadius="lg"
        outline="none"
        _focusVisible={{ boxShadow: '0 0 0 2px var(--accent)' }}
        sx={{
          scrollSnapType: 'x mandatory',
          scrollPaddingInline: '3px',
          overscrollBehaviorX: 'contain',
          scrollbarWidth: 'thin',
          // Soft right edge while more cards remain.
          maskImage: edges.end ? 'none' : 'linear-gradient(to right, black calc(100% - 40px), transparent)',
          WebkitMaskImage: edges.end ? 'none' : 'linear-gradient(to right, black calc(100% - 40px), transparent)',
        }}
      >
        <Flex as="ul" listStyleType="none" gap={4} pb={3} w="max-content" align="flex-start">
          {cards.map((c) => (
            <Box as="li" key={c.key} display="flex">
              <ProjectCard card={c} />
            </Box>
          ))}
          {showAll && (
            <Box as="li" display="flex">
              <Flex
                as={NextLink}
                href="/work"
                data-card
                direction="column"
                justify="flex-end"
                w={{ base: '180px', md: '200px' }}
                p={5}
                border="1px dashed"
                borderColor="page.border-strong"
                borderRadius="lg"
                color="page.fg-secondary"
                fontFamily={monoFont}
                fontSize="12px"
                letterSpacing="0.04em"
                sx={{ scrollSnapAlign: 'start', transition: 'border-color 200ms var(--ease-out-quart), color 200ms var(--ease-out-quart)' }}
                _hover={{ borderColor: 'var(--accent)', color: 'accent.text' }}
                _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
              >
                <span>
                  All case studies <span className="nudge" aria-hidden>→</span>
                </span>
              </Flex>
            </Box>
          )}
        </Flex>
      </Box>
    </Box>
  )
}

function ProjectCard({ card }: { card: Card }) {
  const { t } = useHomeUi()
  const ownLang = useOwnLang()
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const href = card.study ? `/work/${card.study.slug}` : ''
  const status = card.study?.status ? t.projects.status[card.study.status as keyof typeof t.projects.status] || '' : ''
  const hasMore = card.features.length > 0
  // The primary action owns the stretched hit area; everything else sits above it.
  const moreIsPrimary = !href && hasMore

  return (
    <Flex
      as="article"
      data-card
      data-spotlight
      data-vt-morph={href || undefined}
      className="spotlight pressable"
      direction="column"
      position="relative"
      w={{ base: 'min(82vw, 320px)', sm: '320px', md: '340px' }}
      p={5}
      border="1px solid"
      borderColor="page.border"
      borderRadius="lg"
      bg="page.surface"
      sx={{
        scrollSnapAlign: 'start',
        transition: 'border-color 220ms var(--ease-out-quart)',
        '&:hover': { borderColor: 'page.border-strong' },
        // Card-wide focus ring when its primary action is focused.
        '&:has(.stretched-link:focus-visible)': { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' },
        '& .stretched-link:focus-visible': { outline: 'none' },
        // The whole card is the link: nudge its "Read case study →" arrow too.
        '@media (hover: hover)': { '&:has(a.stretched-link):hover .nudge': { transform: 'translateX(3px)' } },
      }}
    >
      <Flex
        justify="space-between"
        align="baseline"
        gap={3}
        mb={3}
        fontFamily={monoFont}
        fontSize="11px"
        letterSpacing="0.04em"
        color="page.fg-secondary"
      >
        <Text as="span" className="tnum">
          {card.period}
        </Text>
        {status && (
          <Text as="span" px={1.5} border="1px solid" borderColor="page.border-strong" borderRadius="4px" textTransform="uppercase" fontSize="10px">
            {status}
          </Text>
        )}
      </Flex>

      <Text
        as="h3"
        fontWeight={500}
        fontSize="17px"
        lineHeight="1.3"
        color="page.fg"
        mb={2}
        letterSpacing="-0.01em"
        lang={ownLang(card.title)}
        data-vt-part={href ? 'title' : undefined}
      >
        {href ? (
          <NextLink href={href} className="stretched-link">
            {card.title}
            <span className="sr-only">{t.projects.readCaseStudy}</span>
          </NextLink>
        ) : (
          card.title
        )}
      </Text>

      {card.description && (
        <Text fontSize="13px" color="page.fg-secondary" noOfLines={3} lineHeight="1.65" lang={ownLang(card.description)}>
          {card.description}
        </Text>
      )}

      {hasMore && (
        <Collapse open={expanded} id={panelId}>
          <Box as="ul" listStyleType="none" mt={4} pt={3} borderTop="1px solid" borderColor="page.border">
            {card.features.slice(0, 4).map((f, i) => (
              <Text
                as="li"
                key={i}
                fontSize="12px"
                color="page.fg-secondary"
                pl={3}
                borderLeft="2px solid"
                borderColor="var(--accent)"
                mb={2}
                lineHeight="1.55"
                lang={ownLang(f)}
              >
                {f}
              </Text>
            ))}
          </Box>
        </Collapse>
      )}

      {card.tech.length > 0 && (
        <Flex as="ul" listStyleType="none" wrap="wrap" gap={1.5} mt={4} aria-label={t.projects.tech}>
          {card.tech.map((t) => (
            <Text
              as="li"
              key={t}
              px={2}
              py="2px"
              fontFamily={monoFont}
              fontSize="10px"
              letterSpacing="0.04em"
              color="page.fg-secondary"
              border="1px solid"
              borderColor="page.border"
              borderRadius="4px"
            >
              {t}
            </Text>
          ))}
        </Flex>
      )}

      <Flex align="center" justify="space-between" gap={3} mt={4} pt={3} borderTop="1px solid" borderColor="page.border" fontFamily={monoFont} fontSize="11px" letterSpacing="0.04em">
        {card.location ? (
          <Text as="span" color="page.fg-secondary" noOfLines={1} lang={ownLang(card.location)}>
            {card.location}
          </Text>
        ) : (
          <span />
        )}
        <Flex align="center" gap={3} flexShrink={0}>
          {hasMore && (
            <Box
              as="button"
              type="button"
              className={moreIsPrimary ? 'stretched-link' : undefined}
              position={moreIsPrimary ? undefined : 'relative'}
              zIndex={moreIsPrimary ? undefined : 1}
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setExpanded((v) => !v)}
              color="page.fg-secondary"
              minH="24px"
              minW="24px"
              px={2}
              py={1.5}
              borderRadius="sm"
              _hover={{ color: 'page.fg' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
            >
              {expanded ? t.projects.less : t.projects.more}
              <span className="sr-only"> about {card.title}</span>
            </Box>
          )}
          {href && (
            <Text as="span" aria-hidden color="accent.text">
              Read case study <span className="nudge">→</span>
            </Text>
          )}
        </Flex>
      </Flex>
    </Flex>
  )
}
