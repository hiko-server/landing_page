import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Box, Flex, IconButton, Text } from '@chakra-ui/react'
import NextLink from 'next/link'
import { GoArrowLeft, GoArrowRight } from 'react-icons/go'

import { entryRange, field, list } from '../CVViewerPage/fields'
import type { CvSectionLike } from '../../lib/cvVisibility'
import { useReferenceMonth } from '../../lib/clock'
import { chipList, matchCaseStudy, type WorkIndexItem } from './projectMatch'

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
  /** Only the first card per case study carries the view-transition name (names must be unique). */
  morph: boolean
}

const STATUS_LABEL: Record<string, string> = {
  live: 'Live',
  archived: 'Archived',
  'case-study': 'Case study',
}

/**
 * [05] Selected projects — horizontal, snap-scrolling cards built from the
 * public CV's project section.
 *
 *   - A project that has a /work case study links to it ("Read case study →"),
 *     shows that study's tech as chips and morphs into its page title via a
 *     shared view-transition name.
 *   - The scroller is a focusable, labelled region (arrow keys / shift+wheel /
 *     swipe) with prev / next buttons ≥ md and a visible focus ring.
 *   - "More" reveals the project's highlights in place.
 */
export default function ProjectSpotlight({ cvEn, work }: { cvEn?: CvSectionLike[]; work?: WorkIndexItem[] }) {
  const month = useReferenceMonth()
  const cards: Card[] = useMemo(() => {
    const section = Array.isArray(cvEn) ? cvEn.find((s) => s?.sessionName === 'project') : undefined
    const seen = new Set<string>()
    return list(section, 'projectExperience')
      .map((p: any, i: number): Card | null => {
        const title = field(p, 'title')
        const description = field(p, 'description')
        if (!title && !description) return null
        const study = title ? matchCaseStudy(title, work) : null
        const morph = !!study && !seen.has(study.slug)
        if (study) seen.add(study.slug)
        return {
          key: `${i}-${title}`,
          title: title || description,
          description: title ? description : '',
          period: entryRange(p, 'en', { futureEndAsPresent: true, now: month }),
          location: field(p, 'projectLocation'),
          features: list(p, 'features')
            .map((f: any) => field(f, 'description'))
            .filter(Boolean),
          study,
          tech: chipList(study?.tech),
          morph,
        }
      })
      .filter((c): c is Card => c !== null)
      .slice(0, 6)
  }, [cvEn, work, month])

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [edges, setEdges] = useState({ start: true, end: false })

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
          {cards.length} {cards.length === 1 ? 'project' : 'projects'} · scroll →
        </Text>
        <Flex gap={2} display={{ base: 'none', md: 'flex' }}>
          <IconButton
            aria-label="Scroll projects left"
            icon={<GoArrowLeft />}
            size="sm"
            variant="outline"
            borderColor="page.border-strong"
            color="page.fg"
            isDisabled={edges.start}
            onClick={() => page(-1)}
            _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
          />
          <IconButton
            aria-label="Scroll projects right"
            icon={<GoArrowRight />}
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
        aria-label="Selected projects (scrolls horizontally)"
        tabIndex={0}
        onScroll={syncEdges}
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
        <Flex as="ul" listStyleType="none" gap={4} pb={3} w="max-content" align="stretch">
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
                All case studies →
              </Flex>
            </Box>
          )}
        </Flex>
      </Box>
    </Box>
  )
}

function ProjectCard({ card }: { card: Card }) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const href = card.study ? `/work/${card.study.slug}` : ''
  const status = card.study?.status ? STATUS_LABEL[card.study.status] : ''

  return (
    <Flex
      as="article"
      data-card
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
        transition: 'border-color 220ms var(--ease-out-quart), transform 220ms var(--ease-out-quart)',
        '&:hover': { borderColor: 'page.border-strong' },
        // Card-wide focus ring when its case-study link is focused.
        '&:has(a[data-stretched]:focus-visible)': { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' },
        '@media (hover: hover) and (prefers-reduced-motion: no-preference)': {
          '&:has(a[data-stretched]):hover': { transform: 'translateY(-2px)' },
        },
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
        <Text as="span">{card.period}</Text>
        {status && (
          <Text as="span" px={1.5} border="1px solid" borderColor="page.border-strong" borderRadius="4px" textTransform="uppercase" fontSize="10px">
            {status}
          </Text>
        )}
      </Flex>

      <Text as="h3" fontWeight={500} fontSize="17px" lineHeight="1.3" color="page.fg" mb={2} letterSpacing="-0.01em">
        {href ? (
          <NextLink
            href={href}
            data-stretched
            style={{
              outline: 'none',
              ...(card.morph && card.study ? { viewTransitionName: `vt-work-${card.study.slug}` } : null),
            }}
          >
            {card.title}
            <span className="sr-only"> — read case study</span>
            {/* Whole card is the click target; the extra controls sit above it. */}
            <Box as="span" aria-hidden position="absolute" inset={0} borderRadius="lg" zIndex={0} />
          </NextLink>
        ) : (
          card.title
        )}
      </Text>

      {card.description && (
        <Text fontSize="13px" color="page.fg-secondary" noOfLines={expanded ? undefined : 3} lineHeight="1.65">
          {card.description}
        </Text>
      )}

      {expanded && card.features.length > 0 && (
        <Box as="ul" id={panelId} listStyleType="none" mt={4} pt={3} borderTop="1px solid" borderColor="page.border">
          {card.features.slice(0, 4).map((f, i) => (
            <Text as="li" key={i} fontSize="12px" color="page.fg-secondary" pl={3} borderLeft="2px solid" borderColor="var(--accent)" mb={2} lineHeight="1.55">
              {f}
            </Text>
          ))}
        </Box>
      )}

      {card.tech.length > 0 && (
        <Flex as="ul" listStyleType="none" wrap="wrap" gap={1.5} mt={4} aria-label="Tech">
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

      <Box flex="1" />

      <Flex align="center" justify="space-between" gap={3} mt={4} pt={3} borderTop="1px solid" borderColor="page.border" fontFamily={monoFont} fontSize="11px" letterSpacing="0.04em">
        {card.location ? (
          <Text as="span" color="page.fg-secondary" noOfLines={1}>
            {card.location}
          </Text>
        ) : (
          <span />
        )}
        <Flex align="center" gap={3} flexShrink={0}>
          {card.features.length > 0 && (
            <Box
              as="button"
              type="button"
              position="relative"
              zIndex={1}
              aria-expanded={expanded}
              aria-controls={expanded ? panelId : undefined}
              onClick={() => setExpanded((v) => !v)}
              color="page.fg-secondary"
              px={1}
              borderRadius="sm"
              _hover={{ color: 'page.fg' }}
              _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
            >
              {expanded ? 'Less' : 'More'}
              <span className="sr-only"> about {card.title}</span>
            </Box>
          )}
          {href && (
            <Text as="span" aria-hidden color="accent.text">
              Read case study →
            </Text>
          )}
        </Flex>
      </Flex>
    </Flex>
  )
}
