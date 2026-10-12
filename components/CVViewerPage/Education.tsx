import React from 'react'
import type { Education } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels, majorAddsInfo } from '../../lib/cvFormat'
import { field, graduation, joinParts, labelled, list } from './fields'
import { EntryStack, EntryText, MetaLine, SheetEntry, SheetSection } from './primitives'

const EducationSection = ({ data, lang = 'en' }: { data: Education; lang?: CvLang }) => {
  const L = cvLabels(lang)
  const items = list(data, 'educationExperience').filter(
    (e) => field(e, 'schoolName') || field(e, 'degree') || field(e, 'major') || field(e, 'gpa'),
  )
  if (!items.length) return null
  return (
    <SheetSection title={data.headerName}>
      <EntryStack>
        {items.map((edu, k) => {
          const degree = field(edu, 'degree')
          const major = majorAddsInfo(degree, field(edu, 'major')) ? field(edu, 'major') : ''
          const school = joinParts([field(edu, 'schoolName'), field(edu, 'schoolLocation')], ', ')
          const title = joinParts([degree, major], lang === 'zh' ? ' · ' : ', ')
          const gpa = labelled(L.gpa, field(edu, 'gpa'), lang)
          return (
            <SheetEntry
              key={k}
              left={<EntryText>{title || school}</EntryText>}
              right={<MetaLine date={graduation(edu, lang)} place={title ? school : ''} />}
            >
              {gpa ? <EntryText italic>• {gpa}</EntryText> : null}
            </SheetEntry>
          )
        })}
      </EntryStack>
    </SheetSection>
  )
}
export default EducationSection
