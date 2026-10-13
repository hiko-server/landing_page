import React from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import type { Skill } from '../../types/cvProps'
import { bullets, cvSectionAnchor, field, list } from './fields'
import { PlainBullets, SheetSection } from './primitives'

const SkillSection = ({ data }: { data: Skill }) => {
  const languages = list(data, 'languages').filter((l) => field(l, 'language') || field(l, 'level'))
  const techs = list(data, 'technical').filter((g) => field(g, 'name') || bullets(g, 'description').length)
  if (!languages.length && !techs.length) return null
  return (
    <SheetSection title={data.headerName} id={cvSectionAnchor('skill')}>
      <Flex direction="column" gap="14px">
        {languages.length ? (
          <Box display="grid" gridTemplateColumns="max-content 1fr" columnGap="12px" rowGap="4px" fontSize="12px" lineHeight="1.5">
            {languages.map((l, index) => (
              <React.Fragment key={index}>
                <Text fontWeight={800}>{field(l, 'language')}</Text>
                <Text>{field(l, 'level')}</Text>
              </React.Fragment>
            ))}
          </Box>
        ) : null}
        {techs.map((tech, i) => {
          const name = field(tech, 'name')
          return (
            <Box key={i} sx={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
              {name ? (
                <Text fontWeight={800} fontSize="12px" lineHeight="1.5">
                  {name.toUpperCase()}
                </Text>
              ) : null}
              <PlainBullets items={bullets(tech, 'description')} />
            </Box>
          )
        })}
      </Flex>
    </SheetSection>
  )
}
export default SkillSection
