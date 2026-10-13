import React, { useMemo } from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { motion, useReducedMotion } from 'framer-motion'

import Hint, { HintGroup } from '../General-UI/Hint'
import { useScrollReveal } from '../General-UI/useScrollReveal'
import type { CvSectionLike } from '../../lib/cvVisibility'
import { revealVariant } from '../../lib/reveal'
import { labelLang } from '../../lib/toc'
import { skillGroups, type Skill } from './projectMatch'

const monoFont = 'var(--font-geist-mono), ui-monospace, monospace'

const chipSx = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 1.5,
  px: 2.5,
  py: 1,
  border: '1px solid',
  borderColor: 'page.border',
  borderRadius: 'md',
  fontSize: '13px',
  color: 'page.fg',
  transitionProperty: 'border-color',
  transitionDuration: '160ms',
  _hover: { borderColor: 'page.border-strong' },
} as const

/**
 * [NN] Skills — the owner's own Skills section from the public CV (never the
 * site's npm dependencies): "Core skills" (skill + proficiency) and each
 * technical group under its own title.
 *
 * A one-word proficiency ("Proficient") is a muted suffix on the chip; a
 * longer note ("Experienced in backend development.") is a Hint on a
 * focusable chip, so chips stay short. One stagger for the whole block,
 * started when it scrolls into view — only when it was below the fold;
 * chips already on screen are there from the first frame (lib/reveal.ts;
 * never hidden under reduced motion).
 * Renders nothing when the section is hidden or empty.
 */
export default function Skills({ cvEn }: { cvEn?: CvSectionLike[] }) {
  const reduce = useReducedMotion()
  const reveal = useScrollReveal<HTMLDivElement>()
  const groups = useMemo(() => {
    const section = Array.isArray(cvEn) ? cvEn.find((s) => s?.sessionName === 'skill') : undefined
    return skillGroups(section)
  }, [cvEn])

  if (!groups.length) return null

  const item = {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: reduce ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
  }
  const stagger = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.03 } } }

  return (
    <HintGroup>
      <motion.div ref={reveal.ref} initial={false} animate={revealVariant(reveal.phase)} variants={stagger}>
        <Box as="dl" w="100%" maxW="1100px" mx="auto">
          {groups.map((g, gi) => (
            <Flex
              key={`${g.label}-${gi}`}
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
                w={{ sm: '168px' }}
                flexShrink={0}
                lang={labelLang(g.label)}
              >
                {g.label}
              </Text>
              <Box as="dd" m={0} minW={0}>
                <motion.ul variants={stagger} style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8, margin: 0, padding: 0 }}>
                  {g.items.map((s) => (
                    <motion.li key={s.name} variants={item}>
                      <SkillChip skill={s} />
                    </motion.li>
                  ))}
                </motion.ul>
              </Box>
            </Flex>
          ))}
        </Box>
      </motion.div>
    </HintGroup>
  )
}

function SkillChip({ skill }: { skill: Skill }) {
  const name = (
    <Text as="span" lang={labelLang(skill.name)}>
      {skill.name}
    </Text>
  )
  if (skill.note) {
    return (
      <Hint label={skill.note}>
        <Box as="span" tabIndex={0} sx={chipSx} cursor="help" _focusVisible={{ outline: '2px solid var(--accent)', outlineOffset: '2px' }}>
          {name}
          <Box as="span" aria-hidden w="4px" h="4px" borderRadius="full" bg="page.fg-subtle" alignSelf="center" />
        </Box>
      </Hint>
    )
  }
  return (
    <Box as="span" sx={chipSx}>
      {name}
      {skill.level ? (
        <Text as="span" fontFamily={monoFont} fontSize="10px" color="page.fg-secondary">
          <span className="sr-only">, </span>
          {skill.level}
        </Text>
      ) : null}
    </Box>
  )
}
