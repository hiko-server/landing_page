import React from 'react'
import { Text } from '@chakra-ui/react'
import type { Experiences } from '../../types/cvProps'
import type { CvLang } from '../../lib/cvVisibility'
import { cvLabels } from '../../lib/cvFormat'
import { bullets, cvEntryAnchor, cvSectionAnchor, entryRange, field, indexedList, list } from './fields'
import { EntryStack, EntryText, EntryTitle, FeatureBullets, MetaLine, SheetEntry, SheetSection } from './primitives'

const WorkExperience = ({ data, lang = 'en' }: { data: Experiences; lang?: CvLang }) => {
  const L = cvLabels(lang)
  const items = indexedList(data, 'experiences').filter(
    ({ item: e }) => field(e, 'jobTitle') || field(e, 'companyName') || field(e, 'jobDescription') || list(e, 'features').length,
  )
  if (!items.length) return null
  return (
    <SheetSection title={data.headerName} id={cvSectionAnchor('workExperience')}>
      <EntryStack>
        {items.map(({ item: exp, index }) => {
          const title = field(exp, 'jobTitle')
          const company = field(exp, 'companyName')
          const skills = bullets(exp, 'relatedSkills')
          return (
            <SheetEntry
              key={index}
              id={cvEntryAnchor('workExperience', index)}
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
                  <EntryText>{field(exp, 'jobDescription')}</EntryText>
                </>
              }
              right={<MetaLine date={entryRange(exp, lang)} place={field(exp, 'location')} />}
            >
              <FeatureBullets items={list(exp, 'features')} />
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
