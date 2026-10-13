import React from 'react'
import type { CompetitionAwards as CompetitionAwardsType } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { formatCvDate } from '../../lib/cvFormat'
import { bullets, cvEntryAnchor, cvSectionAnchor, field, indexedList } from './fields'
import { EntryStack, EntryText, EntryTitle, MetaLine, PlainBullets, SheetEntry, SheetSection } from './primitives'

const CompetitionAwardsSection = ({ data, lang = 'en' }: { data: CompetitionAwardsType; lang?: CvLang }) => {
  const items = indexedList(data, 'awards').filter(
    ({ item: a }) => field(a, 'contestName') || field(a, 'award') || bullets(a, 'description').length,
  )
  if (!items.length) return null
  return (
    <SheetSection title={data.headerName} id={cvSectionAnchor('competitionAwards')}>
      <EntryStack>
        {items.map(({ item, index }) => {
          const contest = field(item, 'contestName')
          return (
            <SheetEntry
              key={index}
              id={cvEntryAnchor('competitionAwards', index)}
              left={
                <>
                  {contest ? <EntryTitle>{contest}</EntryTitle> : null}
                  <EntryText>{field(item, 'award')}</EntryText>
                  <EntryText muted>{field(item, 'organization')}</EntryText>
                </>
              }
              right={<MetaLine date={formatCvDate(field(item, 'date'), lang)} place={field(item, 'location')} />}
            >
              <PlainBullets items={bullets(item, 'description')} />
            </SheetEntry>
          )
        })}
      </EntryStack>
    </SheetSection>
  )
}

export default CompetitionAwardsSection
