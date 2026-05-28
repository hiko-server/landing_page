import React from 'react'
import { Flex, Text } from '@chakra-ui/react'
import { DateTime } from 'luxon'
import { CompetitionAwards } from '../../types/cvProps'
import CVSectionShell, { CVRow } from './_CVSectionShell'

const fmt = (iso?: string) => {
  if (!iso) return ''
  const dt = DateTime.fromISO(iso)
  return dt.isValid ? dt.toFormat('LLL yyyy') : iso
}

const CompetitionAwardsSection = ({
  index,
  data,
}: {
  index?: number
  data: CompetitionAwards
}) => {
  const items = data?.awards || []
  return (
    <CVSectionShell
      index={index}
      label={data?.headerName || 'Competitions'}
      count={items.length}
    >
      <Flex direction="column">
        {items.map((award, i) => (
          <CVRow
            key={i}
            isFirst={i === 0}
            title={award.contestName}
            subtitle={award.award}
            meta={award.organization || undefined}
            period={fmt(award.date)}
            location={award.location}
          >
            {award.description?.length ? (
              <Flex direction="column" gap={1.5}>
                {award.description.map((line, j) => (
                  <Text key={j} fontSize="14px" lineHeight="1.55">
                    {line}
                  </Text>
                ))}
              </Flex>
            ) : null}
          </CVRow>
        ))}
      </Flex>
    </CVSectionShell>
  )
}

export default CompetitionAwardsSection
