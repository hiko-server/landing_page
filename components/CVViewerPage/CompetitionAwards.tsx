import React from 'react'
import type { CompetitionAwards as CompetitionAwardsType } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { formatCvDate } from '../../lib/cvFormat'
import { EntryStack, EntryText, EntryTitle, MetaLine, PlainBullets, SheetEntry, SheetSection } from './primitives'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const CompetitionAwardsSection = ({ data, lang = 'en' }: { data: CompetitionAwardsType; lang?: CvLang }) => {
  const items = (data.awards || []).filter((a) => t(a.contestName) || t(a.award) || (a.description || []).length)
  if (!items.length) return null
  return (
    <SheetSection title={data.headerName}>
      <EntryStack>
        {items.map((item, index) => (
          <SheetEntry
            key={index}
            left={
              <>
                {t(item.contestName) ? <EntryTitle>{item.contestName}</EntryTitle> : null}
                <EntryText>{t(item.award)}</EntryText>
                <EntryText muted>{t(item.organization)}</EntryText>
              </>
            }
            right={<MetaLine date={formatCvDate(item.date, lang)} place={t(item.location)} />}
          >
            <PlainBullets items={item.description} />
          </SheetEntry>
        ))}
      </EntryStack>
    </SheetSection>
  )
}

export default CompetitionAwardsSection
