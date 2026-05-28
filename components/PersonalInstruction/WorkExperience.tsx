import React from 'react'
import { Flex, Link, Box, useColorModeValue } from '@chakra-ui/react'
import { DateTime } from 'luxon'
import { Experiences } from '../../types/cvProps'
import CVSectionShell, { CVRow, CVBullets, CVTagList } from './_CVSectionShell'

const fmt = (iso?: string) => {
  if (!iso) return ''
  if (iso.toLowerCase() === 'now') return 'Present'
  const dt = DateTime.fromISO(iso)
  return dt.isValid ? dt.toFormat('LLL yyyy') : iso
}

const WorkExperience = ({
  index,
  data,
}: {
  index?: number
  data: Experiences
}) => {
  const items = data?.experiences || []
  // "at" connector word inside the title — needs theme-aware color so it
  // stays readable on white (was hard-coded "gray.500" which is 2.4:1 on
  // light bg, fails WCAG AA).
  const conjColor = useColorModeValue('gray.600', 'gray.500')
  return (
    <CVSectionShell
      index={index}
      label={data?.headerName || 'Work Experience'}
      count={items.length}
    >
      <Flex direction="column">
        {items.map((exp, i) => (
          <CVRow
            key={i}
            isFirst={i === 0}
            title={
              <Flex align="baseline" wrap="wrap" gap={2}>
                <Box as="span">{exp.jobTitle}</Box>
                <Box as="span" color={conjColor} fontWeight={400} fontSize="14px">
                  at
                </Box>
                {exp.companyURL ? (
                  <Link
                    href={`https://${exp.companyURL}`}
                    isExternal
                    color="var(--accent)"
                    sx={{
                      borderBottom: '1px solid transparent',
                      _hover: { borderBottomColor: 'var(--accent)', textDecoration: 'none' },
                    }}
                  >
                    {exp.companyName}
                  </Link>
                ) : (
                  <Box as="span">{exp.companyName}</Box>
                )}
              </Flex>
            }
            subtitle={exp.jobDescription}
            period={`${fmt(exp.startDate)} — ${fmt(exp.endDate)}`}
            location={exp.location}
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
