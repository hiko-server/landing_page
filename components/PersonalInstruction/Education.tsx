import { Box, Flex } from '@chakra-ui/react'
import { Education } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels, formatCvRange, majorAddsInfo } from '../../lib/cvFormat'
import CVSectionShell, { CVRow } from './_CVSectionShell'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const EducationSection = ({
  index,
  data,
  lang = 'en',
}: {
  index?: number
  data: Education
  lang?: CvLang
}) => {
  const L = cvLabels(lang)
  const items = (data?.educationExperience || []).filter((e) => t(e.schoolName) || t(e.degree))
  // GPA line: a semantic token (AA in both modes, correct on the first paint).
  const gpaColor = 'page.fg-secondary'
  if (!items.length) return null
  return (
    <CVSectionShell index={index} label={data?.headerName || 'Education'} count={items.length} countSuffix={L.entries}>
      <Flex direction="column">
        {items.map((edu, i) => {
          const major = majorAddsInfo(edu.degree, edu.major) ? t(edu.major) : ''
          return (
            <CVRow
              key={i}
              isFirst={i === 0}
              title={t(edu.degree) || t(edu.schoolName)}
              subtitle={[t(edu.degree) ? t(edu.schoolName) : '', t(edu.schoolLocation)].filter(Boolean).join(' · ') || undefined}
              meta={major ? `${L.major} · ${major}` : undefined}
              period={formatCvRange(edu.startDate, edu.endDate, lang) || undefined}
            >
              {t(edu.gpa) ? (
                <Box fontSize="13px" color={gpaColor}>
                  {L.gpa}: {t(edu.gpa)}
                </Box>
              ) : null}
            </CVRow>
          )
        })}
      </Flex>
    </CVSectionShell>
  )
}

export default EducationSection
