import React from 'react'
import { Flex } from '@chakra-ui/react'
import { Project } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels, formatCvRange } from '../../lib/cvFormat'
import { useReferenceMonth } from '../../lib/clock'
import CVSectionShell, { CVRow, CVBullets } from './_CVSectionShell'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const ProjectSection = ({
  index,
  data,
  lang = 'en',
}: {
  index?: number
  data: Project
  lang?: CvLang
}) => {
  const month = useReferenceMonth()
  const items = (data?.projectExperience || []).filter((p) => t(p.title) || t(p.description))
  if (!items.length) return null
  return (
    <CVSectionShell
      index={index}
      label={data?.headerName || 'Projects'}
      count={items.length}
      countSuffix={cvLabels(lang).entries}
    >
      <Flex direction="column">
        {items.map((pro, i) => (
          <CVRow
            key={i}
            isFirst={i === 0}
            title={t(pro.title) || t(pro.description)}
            subtitle={t(pro.title) ? t(pro.description) || undefined : undefined}
            period={formatCvRange(pro.startDate, pro.endDate, lang, { futureEndAsPresent: true, now: month }) || undefined}
            location={t(pro.projectLocation) || undefined}
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
