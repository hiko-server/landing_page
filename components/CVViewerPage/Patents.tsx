import React from 'react'
import type { Patents } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cleanList, cvLabels, formatCvDate } from '../../lib/cvFormat'
import { EntryStack, EntryText, EntryTitle, MetaLine, PlainBullets, SheetEntry, SheetSection } from './primitives'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const PatentsSection = ({ data, lang = 'en' }: { data: Patents; lang?: CvLang }) => {
  const L = cvLabels(lang)
  const items = (data.patentExperience || []).filter((p) => t(p.title) || cleanList(p.patents).length)
  if (!items.length) return null
  const sep = lang === 'zh' ? '：' : ': '
  return (
    <SheetSection title={data.headerName}>
      <EntryStack>
        {items.map((p, i) => (
          <SheetEntry
            key={i}
            left={
              <>
                {t(p.title) ? <EntryTitle>{p.title}</EntryTitle> : null}
                <EntryText>{t(p.organization)}</EntryText>
                {t(p.status) ? (
                  <EntryText italic>
                    {L.status}
                    {sep}
                    {t(p.status)}
                  </EntryText>
                ) : null}
              </>
            }
            right={<MetaLine date={formatCvDate(p.date, lang)} place={t(p.authority)} />}
          >
            <PlainBullets items={p.patents} />
          </SheetEntry>
        ))}
      </EntryStack>
    </SheetSection>
  )
}

export default PatentsSection
