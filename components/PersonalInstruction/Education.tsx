import React from 'react'
import { Box, Flex, useColorModeValue } from '@chakra-ui/react'
import { DateTime } from 'luxon'
import { Education } from '../../types/cvProps'
import CVSectionShell, { CVRow } from './_CVSectionShell'

const fmt = (iso?: string) =>
  iso && DateTime.fromISO(iso).isValid
    ? DateTime.fromISO(iso).toFormat('LLL yyyy')
    : iso || ''

const EducationSection = ({
  index,
  data,
}: {
  index?: number
  data: Education
}) => {
  const items = data?.educationExperience || []
  // GPA line color — same fix as WorkExperience, theme-aware instead of
  // hard-coded gray.500 which is below WCAG AA on white.
  const gpaColor = useColorModeValue('gray.600', 'gray.500')
  return (
    <CVSectionShell
      index={index}
      label={data?.headerName || 'Education'}
      count={items.length}
    >
      <Flex direction="column">
        {items.map((edu, i) => (
          <CVRow
            key={i}
            isFirst={i === 0}
            title={edu.degree}
            subtitle={`${edu.schoolName}${edu.schoolLocation ? ` · ${edu.schoolLocation}` : ''}`}
            period={`${fmt(edu.startDate)} — ${fmt(edu.endDate)}`}
          >
            {edu.gpa && (
              <Box fontSize="13px" color={gpaColor} fontStyle="normal">
                GPA: {edu.gpa}
              </Box>
            )}
          </CVRow>
        ))}
      </Flex>
    </CVSectionShell>
  )
}

export default EducationSection
