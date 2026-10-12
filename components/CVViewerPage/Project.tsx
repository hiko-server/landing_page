import React from 'react'
import type { Project } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { formatCvRange } from '../../lib/cvFormat'
import { EntryStack, EntryText, EntryTitle, FeatureBullets, MetaLine, SheetEntry, SheetSection } from './primitives'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const ProjectSection = ({ data, lang = 'en' }: { data: Project; lang?: CvLang }) => {
  const items = (data.projectExperience || []).filter(
    (p) => t(p.title) || t(p.description) || (p.features || []).length,
  )
  if (!items.length) return null
  return (
    <SheetSection title={data.headerName}>
      <EntryStack>
        {items.map((pro, k) => (
          <SheetEntry
            key={k}
            left={
              <>
                {t(pro.title) ? <EntryTitle>{pro.title}</EntryTitle> : null}
                <EntryText>{t(pro.description)}</EntryText>
              </>
            }
            right={
              <MetaLine
                date={formatCvRange(pro.startDate, pro.endDate, lang, { futureEndAsPresent: true })}
                place={t(pro.projectLocation)}
              />
            }
          >
            <FeatureBullets items={pro.features} />
          </SheetEntry>
        ))}
      </EntryStack>
    </SheetSection>
  )
}

export default ProjectSection
