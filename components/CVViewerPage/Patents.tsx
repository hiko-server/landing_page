import React from 'react'
import type { Patents } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels, formatCvDate } from '../../lib/cvFormat'
import { bullets, field, labelled, list } from './fields'
import { EntryStack, EntryText, EntryTitle, MetaLine, PlainBullets, SheetEntry, SheetSection } from './primitives'

const PatentsSection = ({ data, lang = 'en' }: { data: Patents; lang?: CvLang }) => {
  const L = cvLabels(lang)
  const items = list(data, 'patentExperience').filter((p) => field(p, 'title') || bullets(p, 'patents').length)
  if (!items.length) return null
  return (
    <SheetSection title={data.headerName}>
      <EntryStack>
        {items.map((p, i) => {
          const title = field(p, 'title')
          const status = labelled(L.status, field(p, 'status'), lang)
          return (
            <SheetEntry
              key={i}
              left={
                <>
                  {title ? <EntryTitle>{title}</EntryTitle> : null}
                  <EntryText>{field(p, 'organization')}</EntryText>
                  {status ? <EntryText italic>{status}</EntryText> : null}
                </>
              }
              right={<MetaLine date={formatCvDate(field(p, 'date'), lang)} place={field(p, 'authority')} />}
            >
              <PlainBullets items={bullets(p, 'patents')} />
            </SheetEntry>
          )
        })}
      </EntryStack>
    </SheetSection>
  )
}

export default PatentsSection
