import React from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import { ExtraSkill } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cleanList, cvLabels } from '../../lib/cvFormat'
import CVSectionShell from './_CVSectionShell'

/**
 * Extra one-line points (stored as `extraSkill.points`) — on this site that is
 * spoken-language proficiency ("English: Professional working proficiency").
 * "Label: detail" lines are split into a two-column row; anything else is
 * shown as a plain line.
 */
const ExtraSkillSection = ({
  index,
  data,
  lang = 'en',
}: {
  index?: number
  data: ExtraSkill
  lang?: CvLang
}) => {
  // Semantic tokens (first-paint correct in both modes, see _CVSectionShell).
  const divider = 'page.border'
  const subColor = 'page.fg-secondary'
  const points = cleanList(data?.points)
  if (!points.length) return null
  return (
    <CVSectionShell
      index={index}
      label={data?.headerName || 'Languages'}
      count={points.length}
      countSuffix={cvLabels(lang).items}
    >
      <Flex direction="column" gap={2}>
        {points.map((p, i) => {
          const m = p.match(/^([^:：]{1,40})[:：]\s*(.+)$/)
          return (
            <Flex
              key={i}
              justify="space-between"
              align="baseline"
              gap={4}
              pb={2}
              borderBottom={i === points.length - 1 ? undefined : '1px solid'}
              borderColor={divider}
            >
              <Text fontSize="14px" fontWeight={500}>
                {m ? m[1] : p}
              </Text>
              {m ? (
                <Box as="span" fontFamily="mono" fontSize="11px" color={subColor} letterSpacing="0.04em" textAlign="right">
                  {m[2]}
                </Box>
              ) : null}
            </Flex>
          )
        })}
      </Flex>
    </CVSectionShell>
  )
}

export default ExtraSkillSection
