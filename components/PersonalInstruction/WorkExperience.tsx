import React from 'react'
import { Flex, Link, Box } from '@chakra-ui/react'
import { Experiences } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels, formatCvRange, safeHref } from '../../lib/cvFormat'
import CVSectionShell, { CVRow, CVBullets, CVTagList } from './_CVSectionShell'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const WorkExperience = ({
  index,
  data,
  lang = 'en',
}: {
  index?: number
  data: Experiences
  lang?: CvLang
}) => {
  const L = cvLabels(lang)
  const items = (data?.experiences || []).filter((e) => t(e.jobTitle) || t(e.companyName))
  if (!items.length) return null
  return (
    <CVSectionShell
      index={index}
      label={data?.headerName || 'Work Experience'}
      count={items.length}
      countSuffix={L.entries}
    >
      <Flex direction="column">
        {items.map((exp, i) => (
          <CVRow
            key={i}
            isFirst={i === 0}
            title={
              <Flex align="baseline" wrap="wrap" gap={2}>
                {t(exp.jobTitle) ? <Box as="span">{exp.jobTitle}</Box> : null}
                {t(exp.jobTitle) && t(exp.companyName) ? (
                  <Box as="span" color="page.fg-secondary" fontWeight={400} fontSize="14px">
                    {L.at}
                  </Box>
                ) : null}
                {!t(exp.companyName) ? null : safeHref(exp.companyURL) ? (
                  <Link
                    href={safeHref(exp.companyURL)}
                    isExternal
                    color="accent.text"
                    sx={{
                      borderBottom: '1px solid transparent',
                      _hover: { borderBottomColor: 'accent.text', textDecoration: 'none' },
                    }}
                  >
                    {exp.companyName}
                  </Link>
                ) : (
                  <Box as="span">{exp.companyName}</Box>
                )}
              </Flex>
            }
            subtitle={t(exp.jobDescription) || undefined}
            period={formatCvRange(exp.startDate, exp.endDate, lang) || undefined}
            location={t(exp.location) || undefined}
          >
            <CVBullets
              items={(exp.features || []).map((fea) => ({
                description: fea.description,
                furtherExplanation: fea.furtherExplanation || [],
              }))}
            />
            <CVTagList tags={exp.relatedSkills || []} />
          </CVRow>
        ))}
      </Flex>
    </CVSectionShell>
  )
}

export default WorkExperience
