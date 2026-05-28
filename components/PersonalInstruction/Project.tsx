import React from 'react'
import { Flex } from '@chakra-ui/react'
import { DateTime } from 'luxon'
import { Project } from '../../types/cvProps'
import CVSectionShell, { CVRow, CVBullets } from './_CVSectionShell'

const fmt = (iso?: string) =>
  iso && DateTime.fromISO(iso).isValid
    ? DateTime.fromISO(iso).toFormat('LLL yyyy')
    : iso || ''

const ProjectSection = ({
  index,
  data,
}: {
  index?: number
  data: Project
}) => {
  const items = data?.projectExperience || []
  return (
    <CVSectionShell
      index={index}
      label={data?.headerName || 'Projects'}
      count={items.length}
    >
      <Flex direction="column">
        {items.map((pro, i) => (
          <CVRow
            key={i}
            isFirst={i === 0}
            title={pro.title}
            subtitle={pro.description}
            period={`${fmt(pro.startDate)} — ${fmt(pro.endDate)}`}
            location={pro.projectLocation}
          >
            <CVBullets
              items={(pro.features || []).map((fea) => ({
                description: fea.description,
                furtherExplanation: fea.furtherExplanation || [],
              }))}
            />
          </CVRow>
        ))}
      </Flex>
    </CVSectionShell>
  )
}

export default ProjectSection
