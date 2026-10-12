import React from 'react'
import { Flex, Text } from '@chakra-ui/react'
import { CompetitionAwards } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cleanList, cvLabels, formatCvDate } from '../../lib/cvFormat'
import CVSectionShell, { CVRow } from './_CVSectionShell'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const CompetitionAwardsSection = ({
  index,
  data,
  lang = 'en',
}: {
  index?: number
  data: CompetitionAwards
  lang?: CvLang
}) => {
  const items = (data?.awards || []).filter((a) => t(a.contestName) || t(a.award))
  if (!items.length) return null
  return (
    <CVSectionShell
      index={index}
      label={data?.headerName || 'Competitions'}
      count={items.length}
      countSuffix={cvLabels(lang).entries}
    >
      <Flex direction="column">
        {items.map((award, i) => {
          const lines = cleanList(award.description)
          return (
            <CVRow
              key={i}
              isFirst={i === 0}
              title={t(award.contestName) || t(award.award)}
              subtitle={t(award.contestName) ? t(award.award) || undefined : undefined}
              meta={t(award.organization) || undefined}
              period={formatCvDate(award.date, lang) || undefined}
              location={t(award.location) || undefined}
            >
              {lines.length ? (
                <Flex direction="column" gap={1.5}>
                  {lines.map((line, j) => (
                    <Text key={j} fontSize="14px" lineHeight="1.55">
                      {line}
                    </Text>
                  ))}
                </Flex>
              ) : null}
            </CVRow>
          )
        })}
      </Flex>
    </CVSectionShell>
  )
}

export default CompetitionAwardsSection
