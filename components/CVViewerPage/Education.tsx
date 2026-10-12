import React from 'react'
import type { Education } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels, formatGraduation, majorAddsInfo } from '../../lib/cvFormat'
import { EntryStack, EntryText, MetaLine, SheetEntry, SheetSection } from './primitives'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const EducationSection = ({ data, lang = 'en' }: { data: Education; lang?: CvLang }) => {
  const L = cvLabels(lang)
  const items = (data.educationExperience || []).filter(
    (e) => t(e.schoolName) || t(e.degree) || t(e.major) || t(e.gpa),
  )
  if (!items.length) return null
  return (
    <SheetSection title={data.headerName}>
      <EntryStack>
        {items.map((edu, k) => {
          const degree = t(edu.degree)
          const major = majorAddsInfo(degree, edu.major) ? t(edu.major) : ''
          const school = [t(edu.schoolName), t(edu.schoolLocation)].filter(Boolean).join(', ')
          const title = [degree, major].filter(Boolean).join(lang === 'zh' ? ' · ' : ', ')
          return (
            <SheetEntry
              key={k}
              left={<EntryText>{title || school}</EntryText>}
              right={<MetaLine date={formatGraduation(edu.endDate, lang)} place={title ? school : ''} />}
            >
              {t(edu.gpa) ? (
                <EntryText italic>
                  • {L.gpa}
                  {lang === 'zh' ? '：' : ': '}
                  {t(edu.gpa)}
                </EntryText>
              ) : null}
            </SheetEntry>
          )
        })}
      </EntryStack>
    </SheetSection>
  )
}
export default EducationSection
