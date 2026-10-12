import React, { useMemo } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { motion, useReducedMotion } from 'framer-motion'

import { entryRange, field, list } from '../CVViewerPage/fields'
import type { CvSectionLike } from '../../lib/cvVisibility'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

// motion(Box) hands framer's own props (initial / whileInView / transition…)
// to framer and the rest to Chakra — passing them straight to <Box as={motion.div}>
// let Chakra swallow `transition` as a CSS property, so the stagger never ran.
const MotionBox = motion(Box)

type Row = { key: string; title: string; company: string; period: string; location: string; description: string }

/**
 * [06] Experience — flat vertical rail, mono dates, accent milestone dots.
 *
 * Reads the public (pruned) CV: a field the owner hid is simply absent, and
 * the title / company / location line never leaves an orphan separator.
 */
export default function ExperienceTimeline({ cvEn }: { cvEn?: CvSectionLike[] }) {
  const reduce = useReducedMotion()

  const rows: Row[] = useMemo(() => {
    const section = Array.isArray(cvEn) ? cvEn.find((s) => s?.sessionName === 'workExperience') : undefined
    return list(section, 'experiences')
      .map((e: any, i: number) => ({
        key: `${i}-${field(e, 'companyName')}-${field(e, 'jobTitle')}`,
        title: field(e, 'jobTitle'),
        company: field(e, 'companyName'),
        period: entryRange(e, 'en'),
        location: field(e, 'location'),
        description: field(e, 'jobDescription'),
      }))
      .filter((r) => r.title || r.company)
      .slice(0, 6)
  }, [cvEn])

  if (!rows.length) return null

  return (
    <Box as="ol" listStyleType="none" w="100%" maxW="1100px" mx="auto" position="relative" pl={{ base: 6, md: 8 }}>
      {/* Vertical rail (flat, no gradient) */}
      <Box as="span" aria-hidden position="absolute" left={{ base: '10px', md: '12px' }} top="6px" bottom="6px" w="1px" bg="page.border" />

      {rows.map((r, idx) => (
          <MotionBox
            as="li"
            key={r.key}
            position="relative"
            pb={idx === rows.length - 1 ? 0 : 8}
            initial={reduce ? false : { opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Milestone dot, ringed in the page colour so it cuts the rail cleanly */}
            <Box
              as="span"
              aria-hidden
              position="absolute"
              left={{ base: '-17.5px', md: '-23.5px' }}
              top="6px"
              w="8px"
              h="8px"
              borderRadius="full"
              bg="var(--accent)"
              boxShadow="0 0 0 4px var(--chakra-colors-page-bg)"
              zIndex={1}
            />

            {r.period && (
              <Text fontFamily={monoFont} fontSize="11px" color="page.fg-secondary" letterSpacing="0.04em" mb={1.5}>
                {r.period}
              </Text>
            )}

            <Text as="h3" fontWeight={500} fontSize="16px" color="page.fg" letterSpacing="-0.005em" mb={0.5}>
              {r.title || r.company}
              {r.title && r.company && (
                <>
                  <Text as="span" aria-hidden color="page.fg-secondary" mx={2}>
                    ·
                  </Text>
                  <span className="sr-only">, </span>
                  <Text as="span" color="page.fg-secondary" fontWeight={400}>
                    {r.company}
                  </Text>
                </>
              )}
            </Text>

            {(r.location || r.description) && (
              <Flex direction="column" gap={2} pt={2}>
                {r.location && (
                  <Text fontFamily={monoFont} fontSize="11px" color="page.fg-secondary" letterSpacing="0.04em">
                    {r.location}
                  </Text>
                )}
                {r.description && (
                  <Text
                    border="1px solid"
                    borderColor="page.border"
                    borderRadius="md"
                    p={3}
                    fontSize="13px"
                    color="page.fg-secondary"
                    lineHeight="1.6"
                    noOfLines={3}
                  >
                    {r.description}
                  </Text>
                )}
              </Flex>
            )}
          </MotionBox>
      ))}
    </Box>
  )
}
