import type { Education } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels, majorAddsInfo } from '../../lib/cvFormat'
import { useReferenceMonth } from '../../lib/clock'
import { cvEntryAnchor, cvSectionAnchor, field, graduation, indexedList, joinParts, labelled } from './fields'
import { EntryStack, EntryText, MetaLine, SheetEntry, SheetSection } from './primitives'

const EducationSection = ({ data, lang = 'en' }: { data: Education; lang?: CvLang }) => {
  const L = cvLabels(lang)
  const month = useReferenceMonth()
  const items = indexedList(data, 'educationExperience').filter(
    ({ item: e }) => field(e, 'schoolName') || field(e, 'degree') || field(e, 'major') || field(e, 'gpa'),
  )
  if (!items.length) return null
  return (
    <SheetSection title={data.headerName} id={cvSectionAnchor('education')}>
      <EntryStack>
        {items.map(({ item: edu, index }) => {
          const degree = field(edu, 'degree')
          const major = majorAddsInfo(degree, field(edu, 'major')) ? field(edu, 'major') : ''
          const school = joinParts([field(edu, 'schoolName'), field(edu, 'schoolLocation')], ', ')
          const title = joinParts([degree, major], lang === 'zh' ? ' · ' : ', ')
          const gpa = labelled(L.gpa, field(edu, 'gpa'), lang)
          return (
            <SheetEntry
              key={index}
              id={cvEntryAnchor('education', index)}
              left={<EntryText>{title || school}</EntryText>}
              right={<MetaLine date={graduation(edu, lang, month)} place={title ? school : ''} />}
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
