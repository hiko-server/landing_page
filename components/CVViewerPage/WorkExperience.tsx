import React from 'react'
import { Text } from '@chakra-ui/react'
import type { Experiences } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cleanList, cvLabels, formatCvRange } from '../../lib/cvFormat'
import { EntryStack, EntryText, EntryTitle, FeatureBullets, MetaLine, SheetEntry, SheetSection } from './primitives'

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const WorkExperience = ({ data, lang = 'en' }: { data: Experiences; lang?: CvLang }) => {
  const L = cvLabels(lang)
  const items = (data.experiences || []).filter(
    (e) => t(e.jobTitle) || t(e.companyName) || t(e.jobDescription) || (e.features || []).length,
  )
  if (!items.length) return null
  return (
    <SheetSection title={data.headerName}>
      <EntryStack>
        {items.map((exp, k) => {
          const title = t(exp.jobTitle)
          const company = t(exp.companyName)
          const skills = cleanList(exp.relatedSkills)
          return (
            <SheetEntry
              key={k}
              left={
                <>
                  {title || company ? (
                    <EntryTitle>
                      {title}
                      {title && company ? (
                        <Text as="span" fontWeight={600} px="4px">
                          {L.at}
                        </Text>
                      ) : null}
                      {company}
                    </EntryTitle>
                  ) : null}
                  <EntryText>{t(exp.jobDescription)}</EntryText>
                </>
              }
              right={<MetaLine date={formatCvRange(exp.startDate, exp.endDate, lang)} place={t(exp.location)} />}
            >
              <FeatureBullets items={exp.features} />
              {skills.length ? (
                <Text fontSize="12px" fontWeight={300} mt="4px" lineHeight="1.5">
                  {skills.join(' | ')}
                </Text>
              ) : null}
            </SheetEntry>
          )
        })}
      </EntryStack>
    </SheetSection>
  )
}

export default WorkExperience
