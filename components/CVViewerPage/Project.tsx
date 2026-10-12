import React from 'react'
import type { Project } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { useReferenceMonth } from '../../lib/clock'
import { entryRange, field, list } from './fields'
import { EntryStack, EntryText, EntryTitle, FeatureBullets, MetaLine, SheetEntry, SheetSection } from './primitives'

const ProjectSection = ({ data, lang = 'en' }: { data: Project; lang?: CvLang }) => {
  const month = useReferenceMonth()
  const items = list(data, 'projectExperience').filter(
    (p) => field(p, 'title') || field(p, 'description') || list(p, 'features').length,
  )
  if (!items.length) return null
  return (
    <SheetSection title={data.headerName}>
      <EntryStack>
        {items.map((pro, k) => {
          const title = field(pro, 'title')
          return (
            <SheetEntry
              key={k}
              left={
                <>
                  {title ? <EntryTitle>{title}</EntryTitle> : null}
                  <EntryText>{field(pro, 'description')}</EntryText>
                </>
              }
              right={
                <MetaLine
                  date={entryRange(pro, lang, { futureEndAsPresent: true, now: month })}
                  place={field(pro, 'projectLocation')}
                />
              }
            >
              <FeatureBullets items={list(pro, 'features')} />
            </SheetEntry>
          )
        })}
      </EntryStack>
    </SheetSection>
  )
}

export default ProjectSection
