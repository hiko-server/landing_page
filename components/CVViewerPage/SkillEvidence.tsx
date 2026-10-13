import React, { useEffect } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import NextLink from 'next/link'
import type { CvLang } from '../../lib/cvVisibility'
import { EVIDENCE_KIND_LABELS, type SkillEvidence as SkillEvidenceRow } from '../../lib/skillEvidence'
import { ANCHOR_SCROLL_MARGIN } from './primitives'

/**
 * "Skill evidence" — below the CV on /cv and /cv/zh (never printed): every
 * skill the CV lists that is evidenced somewhere, as a disclosure row
 * (native <details>, so it works without JavaScript and opens on find-in-
 * page) listing the roles, projects, awards and patents on this page and
 * the case studies and posts that use it (lib/skillEvidence). Skills with
 * no evidence get no row — never a "0".
 *
 * A role's skills on the A4 sheet (inline in its skills line) and every
 * skill in the Reading view link here (#skill-…): following one opens its
 * row and moves focus to it. The sheet's own Skills section stays plain
 * text — paper layout, and its tightly stacked rows would make undersized
 * link targets (WCAG 2.5.8).
 */

const mono = 'var(--font-geist-mono), ui-monospace, monospace'

const COPY = {
  en: {
    title: 'Skill evidence',
    lede: 'Where each skill on this CV is used: roles, projects and awards above, plus case studies and writing.',
    count: (n: number) => (n === 1 ? '1 source' : `${n} sources`),
  },
  zh: {
    title: '技能出处',
    lede: '每项技能用在哪里：上方的职位、项目与奖项，以及案例和文章。',
    count: (n: number) => `${n} 处`,
  },
} as const

/** Open the evidence row a `#skill-…` hash points to and move focus to its summary. */
export function openSkillRow(id: string, focus = true) {
  if (!id.startsWith('skill-')) return
  const el = document.getElementById(id)
  if (!(el instanceof HTMLDetailsElement)) return
  el.open = true
  el.scrollIntoView({ block: 'start' })
  if (focus) el.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true })
}

export default function SkillEvidence({ evidence, lang }: { evidence: SkillEvidenceRow[]; lang: CvLang }) {
  const T = COPY[lang]
  const kinds = EVIDENCE_KIND_LABELS[lang]

  useEffect(() => {
    const fromHash = () => openSkillRow(decodeURIComponent(window.location.hash.slice(1)))
    // A second click on the same skill link changes no hash: open the row on click too.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href^="#skill-"]')
      if (a) openSkillRow(decodeURIComponent((a.getAttribute('href') || '').slice(1)))
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    document.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('hashchange', fromHash)
      document.removeEventListener('click', onClick)
    }
  }, [])

  if (!evidence.length) return null

  return (
    <Box as="section" className="no-print" aria-labelledby="cv-skill-evidence" mt={{ base: 10, md: 16 }} lang={lang === 'zh' ? 'zh-Hans' : 'en'}>
      <Text
        as="h2"
        id="cv-skill-evidence"
        className="section-label-rule"
        fontFamily={mono}
        fontSize="11px"
        letterSpacing="0.12em"
        textTransform="uppercase"
        color="page.fg-subtle"
        m={0}
      >
        {T.title}
      </Text>
      <Text mt={4} maxW="62ch" fontSize="15px" lineHeight="1.6" color="page.fg-secondary">
        {T.lede}
      </Text>
      <Box
        as="ul"
        listStyleType="none"
        m={0}
        mt={6}
        p={0}
        display="grid"
        gridTemplateColumns={{ base: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }}
        columnGap={8}
        alignItems="start"
      >
        {evidence.map((row) => (
          <Box as="li" key={row.id} borderTop="1px solid" borderColor="page.border" minW={0}>
            <Box
              as="details"
              id={row.id}
              data-skill-evidence=""
              sx={{
                scrollMarginTop: ANCHOR_SCROLL_MARGIN,
                '&[open] .cv-evidence-chevron': { transform: 'rotate(90deg)' },
                '&:target > summary .cv-evidence-name': { color: 'accent.text' },
                '& > summary::-webkit-details-marker': { display: 'none' },
              }}
            >
              <Flex
                as="summary"
                align="center"
                gap={3}
                minH="44px"
                py={2}
                cursor="pointer"
                listStyleType="none"
                borderRadius="6px"
                _hover={{ '.cv-evidence-name': { color: 'accent.text' } }}
                _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}
              >
                <Box
                  as="svg"
                  className="cv-evidence-chevron"
                  viewBox="0 0 16 16"
                  w="12px"
                  h="12px"
                  flexShrink={0}
                  color="page.fg-subtle"
                  aria-hidden
                  sx={{ transition: 'transform 160ms ease', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
                >
                  <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </Box>
                <Text as="span" className="cv-evidence-name" flex="1" minW={0} fontSize="15px" fontWeight={500} color="page.fg" sx={{ overflowWrap: 'anywhere' }}>
                  {row.name}
                </Text>
                <Text as="span" fontFamily={mono} fontSize="12px" color="page.fg-subtle" flexShrink={0} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {T.count(row.items.length)}
                </Text>
              </Flex>
              <Box as="ul" listStyleType="none" m={0} p={0} pb={3} pl="24px">
                {row.items.map((item) => (
                  <Flex as="li" key={`${item.kind}-${item.href}`} gap={3} align="baseline" py={1}>
                    <Text
                      as="span"
                      fontFamily={mono}
                      fontSize="10.5px"
                      letterSpacing="0.08em"
                      textTransform="uppercase"
                      color="page.fg-subtle"
                      w={{ base: '72px', sm: '84px' }}
                      flexShrink={0}
                    >
                      {kinds[item.kind]}
                    </Text>
                    <EvidenceLink href={item.href}>{item.label}</EvidenceLink>
                  </Flex>
                ))}
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

const linkSx = {
  fontSize: '14px',
  lineHeight: '1.5',
  color: 'page.fg',
  minW: 0,
  overflowWrap: 'anywhere',
  textDecoration: 'underline',
  textDecorationColor: 'page.border-strong',
  textUnderlineOffset: '3px',
  borderRadius: '2px',
  _hover: { color: 'accent.text', textDecorationColor: 'currentColor' },
  _focusVisible: { outline: '2px solid var(--accent)', outlineOffset: '2px' },
} as const

function EvidenceLink({ href, children }: { href: string; children: React.ReactNode }) {
  // Same-page CV anchors stay plain links (the page scrolls to the visible view); other pages navigate client side.
  if (href.startsWith('#')) {
    return (
      <Box as="a" href={href} sx={linkSx}>
        {children}
      </Box>
    )
  }
  return (
    <Box as={NextLink} href={href} sx={linkSx}>
      {children}
    </Box>
  )
}
